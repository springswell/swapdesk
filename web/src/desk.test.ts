import { describe, expect, it } from "vitest";
import { receiveFor, type Offer } from "./desk";

const o: Offer = {
  id: 1n, maker: "G", sell_token: "A", sell_amount: 10n, buy_token: "B", buy_amount: 3n,
  sell_remaining: 10n, buy_remaining: 3n, taker: null, allow_partial: true, expires_at: 0n, status: 0,
};

describe("receiveFor mirrors the contract", () => {
  it("rounds partial fills down", () => expect(receiveFor(o, 1n)).toBe(3n));
  it("gives the exact remainder on the final fill", () => expect(receiveFor({ ...o, sell_remaining: 4n, buy_remaining: 1n }, 1n)).toBe(4n));
  it("returns 0 for invalid amounts", () => {
    expect(receiveFor(o, 0n)).toBe(0n);
    expect(receiveFor(o, 4n)).toBe(0n);
  });
});
