# Swapdesk

**Trustless OTC token swaps on Stellar. Nobody has to send first.**

Two parties agree a trade off-exchange: "10,000 USDC for 85,000 XLM".
Today one of them sends first and hopes the other follows through.
Swapdesk removes that risk:

1. The **maker** posts an offer and the contract escrows their tokens.
2. The **taker** fills it. Their payment goes to the maker and the
   escrowed tokens go to them **in the same transaction**, or nothing
   happens at all.

Use it for OTC desks, peer-to-peer trades between communities, treasury
diversification between DAOs, or selling an illiquid token to a known
buyer at an agreed price, without slippage or an order book.

## Features

| | |
| --- | --- |
| **Atomic settlement** | Payment and delivery happen together in one transaction |
| **Private offers** | Name a taker and nobody else can fill it |
| **Partial fills** (opt-in) | Several takers can fill one offer at its fixed price |
| **Maker-safe rounding** | Partial fills round down; the final fill takes the exact remainder, so escrow never ends short or with dust |
| **Expiry** | After `expires_at` the offer can't be filled, and *anyone* can return the escrow to the maker |
| **Cancel any time** | The maker gets back whatever hasn't been filled |
| **Any two Stellar assets** | XLM, USDC, any SAC-wrapped asset or Soroban token |

## Contract interface

| Function | Who signs | Notes |
| --- | --- | --- |
| `create_offer(maker, sell_token, sell_amount, buy_token, buy_amount, taker?, allow_partial, expires_at)` | maker | Escrows `sell_amount` |
| `fill(offer_id, taker, pay_amount)` | taker | Returns the amount received; pay `buy_remaining` to fill fully |
| `cancel(offer_id)` | maker | Refunds the remaining escrow |
| `reclaim_expired(offer_id)` | anyone | After expiry; refunds the maker |
| `get_offer(offer_id)` | anyone | Includes `sell_remaining` / `buy_remaining` |

Price math for a partial fill: `received = sell_amount × pay_amount ÷ buy_amount`,
rounded down.

Errors: `OfferNotFound (1)`, `InvalidOffer (2)`, `NotOpen (3)`, `Expired (4)`,
`NotYourOffer (5)`, `PrivateOffer (6)`, `PartialNotAllowed (7)`,
`InvalidAmount (8)`, `NotExpired (9)`.

Events: `("swap","offered", id)`, `("swap","filled", id)` (with paid and
received amounts), `("swap","closed", id)` (with the refund).

## Build, test and deploy

```bash
cd contracts
cargo test             # 12 unit tests
stellar contract build
stellar contract deploy --wasm target/wasm32v1-none/release/swapdesk.wasm \
  --source me --network testnet

# Offer 10,000 USDC for 85,000 XLM to one specific buyer, valid 24h
stellar contract invoke --id <DESK> --source maker --network testnet -- \
  create_offer --maker maker --sell_token <USDC_SAC> --sell_amount 100000000000 \
  --buy_token <XLM_SAC> --buy_amount 850000000000 --taker G...BUYER \
  --allow_partial false --expires_at 1767312000
```

## Glossary (new to Stellar?)

- **OTC (over-the-counter)**: a trade agreed directly between two
  parties instead of on an exchange order book.
- **Maker / taker**: the party who posts the offer / the party who
  accepts it.
- **Escrow**: tokens held by the contract until the trade completes or
  is cancelled.
- **Atomic**: all-or-nothing. Either both transfers happen or neither
  does.
- **Partial fill**: accepting only part of an offer, at the same price.
- **Soroban / SAC**: Stellar's smart-contract platform / the contract
  address that represents a Stellar asset such as XLM or USDC.

## License

MIT
