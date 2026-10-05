import { Asset, Networks } from "@stellar/stellar-sdk";
import { client, u64, XLM_SAC } from "./lib/stellar";

export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID ?? "CD3VOYQK6YW4567ARVWN4MAQ6XFJQNFVWL3VR5MZGNMLV2VOPF6B43KL";
export const DEMO_TOKEN = import.meta.env.VITE_DEMO_TOKEN ?? "CD6XZE7ONYYM3DD2HKY7W7ZQXEGGV6FGDZN4X44YC7PTKIR6AYBY3LN7";

export const ERRORS: Record<number, string> = {
  1: "No offer with that id.",
  2: "Invalid offer: amounts must be positive, the two assets different, expiry in the future, and you can't be your own taker.",
  3: "This offer is no longer open.",
  4: "This offer has expired.",
  5: "Only the maker can do that.",
  6: "This is a private offer for a different taker.",
  7: "This offer must be filled in full.",
  8: "That amount isn't valid for this offer.",
  9: "This offer hasn't expired yet.",
};
export const desk = client(CONTRACT_ID, ERRORS);

export interface Offer {
  id: bigint;
  maker: string;
  sell_token: string;
  sell_amount: bigint;
  buy_token: string;
  buy_amount: bigint;
  sell_remaining: bigint;
  buy_remaining: bigint;
  taker: string | null | undefined;
  allow_partial: boolean;
  expires_at: bigint;
  status: number; // 0 open, 1 filled, 2 cancelled
}

/** Same math as the contract's fill(). */
export function receiveFor(o: Offer, pay: bigint): bigint {
  if (pay <= 0n || pay > o.buy_remaining) return 0n;
  if (pay === o.buy_remaining) return o.sell_remaining;
  return (o.sell_amount * pay) / o.buy_amount;
}

const getOffer = (id: number) => desk.read<Offer>("get_offer", [u64(id)]);

/**
 * Newest first. Uses offer_count with parallel batches when available;
 * older deployments fall back to probing ids until the first gap.
 */
export async function scanOffers(batch = 10): Promise<Offer[]> {
  const out: Offer[] = [];
  let count: number | null = null;
  try {
    count = Number(await desk.read<bigint>("offer_count"));
  } catch {
    count = null;
  }
  if (count !== null) {
    for (let start = 1; start <= count; start += batch) {
      const ids = Array.from({ length: Math.min(batch, count - start + 1) }, (_, i) => start + i);
      const got = await Promise.allSettled(ids.map(getOffer));
      for (const r of got) if (r.status === "fulfilled") out.push(r.value);
    }
    return out.reverse();
  }
  for (let id = 1; ; id++) {
    try {
      out.push(await getOffer(id));
    } catch {
      break;
    }
  }
  return out.reverse();
}

/** Token contracts we can vouch for, so look-alike symbols stand out. */
export const KNOWN_TOKENS: Record<string, { label: string; kind: "verified" | "demo" }> = {
  [XLM_SAC]: { label: "native XLM", kind: "verified" },
  [new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5").contractId(Networks.TESTNET)]: {
    label: "Circle USDC (testnet)",
    kind: "verified",
  },
  [DEMO_TOKEN]: { label: "swapdesk demo token", kind: "demo" },
};

/** Price of one sell-token unit in buy-token units. */
export const priceOf = (o: Offer) => Number(o.buy_amount) / Number(o.sell_amount);

const symbols = new Map<string, Promise<string>>([[XLM_SAC, Promise.resolve("XLM")]]);
/** Token symbol from the token contract itself (cached). */
export function symbolOf(token: string): Promise<string> {
  if (!symbols.has(token)) {
    symbols.set(
      token,
      client(token)
        .read<string>("symbol")
        .then((s) => (s === "native" ? "XLM" : s))
        .catch(() => `${token.slice(0, 4)}…`),
    );
  }
  return symbols.get(token)!;
}
