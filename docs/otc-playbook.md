# OTC playbook

1. **Agree terms off-chain**: assets, amounts, deadline, and who the
   counterparty is.
2. **Maker creates a private offer** with `taker = counterparty` and a short
   expiry (hours, not weeks).
3. **Share the offer id.** The taker checks `get_offer` and confirms the
   token contract ids are the real assets (anyone can name a token "USDC").
4. **Taker fills** with `pay_amount = buy_remaining`.

## Selling to several buyers

Use a public offer with `allow_partial = true`. Each buyer fills the amount
they want at the fixed price, and the maker cancels whatever's left at the
end.

## Verifying assets

Compare `sell_token` / `buy_token` against the issuer's published Stellar
Asset Contract address (derived from `CODE:ISSUER`), never just the code.
