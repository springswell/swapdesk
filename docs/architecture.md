# Architecture

## Offer

```text
Offer { maker, sell_token, sell_amount, buy_token, buy_amount,
        sell_remaining, buy_remaining, taker?, allow_partial, expires_at, status }
```

## Fill math

```text
fill(pay):
  require 0 < pay ≤ buy_remaining
  if pay < buy_remaining: require allow_partial
  receive = (pay == buy_remaining) ? sell_remaining          // final fill clears dust
                                   : sell_amount × pay / buy_amount   // floor
  buy_token:  taker → maker   (pay)
  sell_token: contract → taker (receive)
```

Flooring partial fills means the maker never delivers more than the agreed
price. Letting the final fill take `sell_remaining` guarantees the escrow
ends at exactly zero. At creation, `sell_amount × buy_amount` is checked
for overflow when partial fills are enabled.

## Atomicity

Both transfers happen in one contract call. If either fails (the taker
lacks funds, or a trustline is missing), Soroban reverts the whole call
and no partial state is written.

## Ending an offer

- `cancel`: maker only, any time while open.
- `reclaim_expired`: anyone, after expiry. The refund always goes to the
  maker, so letting anyone trigger it is safe and stops tokens being stranded.
