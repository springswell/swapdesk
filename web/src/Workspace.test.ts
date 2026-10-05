import { describe, expect, it } from "vitest";
import { getOfferIdFromUrl, getOfferUrl } from "./Workspace";

describe("getOfferIdFromUrl", () => {
  it("parses offer ID from hash with query string", () => {
    expect(getOfferIdFromUrl("", "#/app?offer=7")).toBe(7n);
    expect(getOfferIdFromUrl("", "#/app?offer=0")).toBe(0n);
    expect(getOfferIdFromUrl("", "#/app?offer=12345678901234567890")).toBe(12345678901234567890n);
  });

  it("handles extra query parameters in hash", () => {
    expect(getOfferIdFromUrl("", "#/app?foo=bar&offer=42")).toBe(42n);
    expect(getOfferIdFromUrl("", "#/app?offer=99&token=demo")).toBe(99n);
  });

  it("falls back to search query string if hash has no offer param", () => {
    expect(getOfferIdFromUrl("?offer=15", "#/app")).toBe(15n);
    expect(getOfferIdFromUrl("?offer=20", "")).toBe(20n);
  });

  it("returns null when no offer param is present", () => {
    expect(getOfferIdFromUrl("", "#/app")).toBeNull();
    expect(getOfferIdFromUrl("", "#/")).toBeNull();
    expect(getOfferIdFromUrl("", "")).toBeNull();
  });

  it("returns null for non-numeric offer params", () => {
    expect(getOfferIdFromUrl("", "#/app?offer=abc")).toBeNull();
    expect(getOfferIdFromUrl("", "#/app?offer=-7")).toBeNull();
    expect(getOfferIdFromUrl("", "#/app?offer=12.34")).toBeNull();
    expect(getOfferIdFromUrl("", "#/app?offer=")).toBeNull();
  });
});

describe("getOfferUrl", () => {
  it("generates correct URL format with base href", () => {
    expect(getOfferUrl(7n, "https://swapdesk.app/#/app")).toBe("https://swapdesk.app/#/app?offer=7");
    expect(getOfferUrl(42n, "http://localhost:5173/")).toBe("http://localhost:5173/#/app?offer=42");
    expect(getOfferUrl(100n, "http://localhost:5173/#/app?offer=1")).toBe("http://localhost:5173/#/app?offer=100");
  });

  it("falls back to hash path when base href is not available", () => {
    expect(getOfferUrl(7n, "")).toBe("#/app?offer=7");
  });
});
