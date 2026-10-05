#!/usr/bin/env bash
# Return the escrow of every expired, still-open swapdesk offer to its maker.
#
#   scripts/reclaim.sh <contract-id> <stellar-cli-key> [--network testnet] [--dry-run]
#
# reclaim_expired can be called by anyone and always pays the maker, so the
# key only needs XLM for fees. Run it from cron (e.g. hourly).
set -euo pipefail

CONTRACT=${1:?usage: reclaim.sh <contract-id> <key> [--network NET] [--dry-run]}
SOURCE=${2:?usage: reclaim.sh <contract-id> <key> [--network NET] [--dry-run]}
shift 2
NETWORK=testnet
DRY=0
while [ $# -gt 0 ]; do
  case $1 in
    --network) NETWORK=$2; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

inv() { stellar contract invoke --id "$CONTRACT" --source "$SOURCE" --network "$NETWORK" "$@" 2>/dev/null; }
field() { sed -E "s/.*\"$1\":\"?([^\",}]*)\"?.*/\1/"; }

# Newer deployments expose offer_count; older ones are probed until the first gap.
COUNT=$(inv -- offer_count | tr -d '"' || true)
if [ -z "$COUNT" ]; then
  COUNT=0
  while inv -- get_offer --offer_id $((COUNT + 1)) >/dev/null; do COUNT=$((COUNT + 1)); done
fi

NOW=$(date +%s)
echo "checking $COUNT offer(s) on $NETWORK"
for ((id = 1; id <= COUNT; id++)); do
  offer=$(inv -- get_offer --offer_id "$id") || continue
  [ "$(echo "$offer" | field status)" = "0" ] || continue
  [ "$(echo "$offer" | field expires_at)" -le "$NOW" ] || continue
  if [ "$DRY" = 1 ]; then
    echo "expired: #$id (maker $(echo "$offer" | field maker))"
  elif refunded=$(inv --send=yes -- reclaim_expired --offer_id "$id"); then
    echo "reclaimed #$id: $refunded returned to the maker"
  else
    echo "reclaim #$id failed" >&2
  fi
done
