import { useCallback, useEffect, useState } from "react";
import { StrKey, xdr } from "@stellar/stellar-sdk";
import { DEMO_TOKEN, desk, KNOWN_TOKENS, priceOf, receiveFor, scanOffers, symbolOf, type Offer } from "./desk";
import { routeParams } from "./lib/router";
import { addr, bool, i128, none, txLink, u64, XLM_SAC } from "./lib/stellar";
import { fromUnits, short, timeLeft, toUnits } from "./lib/format";
import { useWallet } from "./lib/useWallet";
import { useAction } from "./lib/useAction";

export type Wallet = ReturnType<typeof useWallet>;

/** Short contract id plus a badge for tokens we know, so a fake "USDC" is visible. */
function TokenId({ token }: { token: string }) {
  const known = KNOWN_TOKENS[token];
  return (
    <span className="ml-1 inline-flex items-center gap-1 align-middle font-mono text-[10px] text-fog" title={token}>
      {short(token, 4)}
      {known?.kind === "verified" && <span className="tag bg-lime/15 text-lime">✓</span>}
      {known?.kind === "demo" && <span className="tag border border-seam">demo</span>}
    </span>
  );
}

function useSymbol(token: string) {
  const [s, setS] = useState(token === XLM_SAC ? "XLM" : "…");
  useEffect(() => {
    symbolOf(token).then(setS);
  }, [token]);
  return s;
}

export function Workspace({ wallet }: { wallet: Wallet }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  // #/app?offer=<id> opens that offer's ticket, so offers can be shared.
  const [selected, setSelectedState] = useState<bigint | null>(() => {
    const id = routeParams().get("offer");
    return id && /^\d+$/.test(id) ? BigInt(id) : null;
  });
  const setSelected = (id: bigint | null | ((cur: bigint | null) => bigint | null)) =>
    setSelectedState((cur) => {
      const next = typeof id === "function" ? id(cur) : id;
      if (next !== null && next !== cur) history.replaceState(null, "", `${window.location.pathname}#/app?offer=${next}`);
      return next;
    });
  const [filter, setFilter] = useState<"open" | "mine" | "all">("open");
  const [pair, setPair] = useState("all");
  const [sort, setSort] = useState<"newest" | "price-asc" | "price-desc">("newest");
  const [symbols, setSymbols] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const all = await scanOffers();
    setOffers(all);
    setSelected((cur) => cur ?? all.find((o) => o.status === 0)?.id ?? null);
    const ids = [...new Set(all.flatMap((o) => [o.sell_token, o.buy_token]))];
    const named = await Promise.all(ids.map(async (id) => [id, await symbolOf(id)] as const));
    setSymbols(Object.fromEntries(named));
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const now = Date.now() / 1000;
  const pairOf = (o: Offer) => `${o.sell_token}>${o.buy_token}`;
  const pairs = [...new Set((offers ?? []).map(pairOf))];
  const pairLabel = (p: string) => {
    const [a, b] = p.split(">");
    return `${symbols[a] ?? short(a)} → ${symbols[b] ?? short(b)}`;
  };
  const shown = (offers ?? [])
    .filter((o) =>
      filter === "open" ? o.status === 0 && Number(o.expires_at) > now : filter === "mine" ? o.maker === wallet.address : true,
    )
    .filter((o) => pair === "all" || pairOf(o) === pair)
    .sort((a, b) => (sort === "price-asc" ? priceOf(a) - priceOf(b) : sort === "price-desc" ? priceOf(b) - priceOf(a) : 0));
  const current = offers?.find((o) => o.id === selected) ?? null;

  return (
    <div className="min-h-screen">

      <section className="mx-auto max-w-7xl px-5 pt-10">
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
          Swap peer-to-peer. <span className="text-cyan">Nobody sends first.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-fog">
          Makers escrow their side; takers fill atomically, so payment and delivery settle in one transaction or not
          at all. Private offers, partial fills, expiry: no order book, no slippage.
        </p>
      </section>

      <div className="mx-auto grid max-w-7xl gap-5 px-5 py-8 lg:grid-cols-[1.5fr_1fr]">
        <section className="deck overflow-hidden">
          <div className="flex items-center justify-between border-b border-seam px-4 py-3">
            <div className="flex gap-1">
              {(["open", "mine", "all"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`tag ${filter === f ? "bg-cyan text-void" : "text-fog"}`}>
                  {f === "open" ? "Open offers" : f === "mine" ? "My offers" : "History"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select className="tx w-auto py-1 text-xs" value={pair} onChange={(e) => setPair(e.target.value)} aria-label="Filter by pair">
                <option value="all">All pairs</option>
                {pairs.map((p) => (
                  <option key={p} value={p}>
                    {pairLabel(p)}
                  </option>
                ))}
              </select>
              <select className="tx w-auto py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
                <option value="newest">Newest</option>
                <option value="price-asc">Price ↑</option>
                <option value="price-desc">Price ↓</option>
              </select>
              <button className="tag text-fog" onClick={refresh}>
                ↻ refresh
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[60px_1fr_1fr_90px_80px] gap-2 border-b border-seam px-4 py-2 font-mono text-[11px] uppercase text-fog">
            <span>#</span>
            <span>Selling</span>
            <span>For</span>
            <span className="text-right">Price</span>
            <span className="text-right">Ends</span>
          </div>
          {offers === null && <p className="p-6 font-mono text-sm text-fog">loading book…</p>}
          {offers && shown.length === 0 && <p className="p-6 text-sm text-fog">Nothing here yet.</p>}
          {shown.map((o) => (
            <OfferRow key={String(o.id)} o={o} active={o.id === selected} onClick={() => setSelected(o.id)} />
          ))}
        </section>

        <aside className="space-y-5">
          {current && <Ticket key={String(current.id)} o={current} wallet={wallet} onChange={refresh} />}
          <CreateOffer wallet={wallet} onCreated={(id) => (refresh(), setSelected(id))} />
        </aside>
      </div>

    </div>
  );
}

function OfferRow({ o, active, onClick }: { o: Offer; active: boolean; onClick: () => void }) {
  const sell = useSymbol(o.sell_token);
  const buy = useSymbol(o.buy_token);
  const price = priceOf(o);
  const filledPct = Number(((o.sell_amount - o.sell_remaining) * 100n) / o.sell_amount);
  const expired = Number(o.expires_at) * 1000 < Date.now();
  return (
    <button
      onClick={onClick}
      className={`grid w-full grid-cols-[60px_1fr_1fr_90px_80px] items-center gap-2 border-b border-seam/60 px-4 py-3 text-left text-sm transition ${active ? "bg-plate" : "hover:bg-plate/60"}`}
    >
      <span className="font-mono text-fog">{String(o.id)}</span>
      <span>
        <b className="text-pink">{fromUnits(o.sell_remaining)}</b> {sell}
        <TokenId token={o.sell_token} />
        {o.taker && <span className="tag ml-2 border border-pink/40 text-pink">private</span>}
        {filledPct > 0 && o.status === 0 && <span className="ml-2 font-mono text-[11px] text-lime">{filledPct}% filled</span>}
      </span>
      <span>
        <b className="text-cyan">{fromUnits(o.buy_remaining)}</b> {buy}
        <TokenId token={o.buy_token} />
      </span>
      <span className="text-right font-mono text-xs">{price.toPrecision(4)}</span>
      <span className={`text-right font-mono text-xs ${o.status ? "text-fog" : expired ? "text-red" : ""}`}>
        {o.status === 1 ? "filled" : o.status === 2 ? "closed" : expired ? "expired" : timeLeft(o.expires_at).replace("in ", "")}
      </span>
    </button>
  );
}

function Msg({ a }: { a: ReturnType<typeof useAction> }) {
  if (a.error) return <p className="rounded-md bg-red/10 px-3 py-2 text-sm text-red">{a.error}</p>;
  if (a.notice)
    return (
      <p className="rounded-md bg-lime/10 px-3 py-2 text-sm text-lime">
        {a.notice.text}{" "}
        {a.notice.hash && (
          <a className="underline" href={txLink(a.notice.hash)} target="_blank" rel="noreferrer">
            tx↗
          </a>
        )}
      </p>
    );
  return null;
}

function Ticket({ o, wallet, onChange }: { o: Offer; wallet: Wallet; onChange: () => void }) {
  const sell = useSymbol(o.sell_token);
  const buy = useSymbol(o.buy_token);
  const [pay, setPay] = useState(fromUnits(o.buy_remaining).replace(/,/g, ""));
  const act = useAction();
  let payUnits = 0n;
  try {
    payUnits = toUnits(pay);
  } catch {
    payUnits = 0n;
  }
  const receive = receiveFor(o, payUnits);
  const expired = Number(o.expires_at) * 1000 < Date.now();
  const isMaker = wallet.address === o.maker;
  const blockedPrivate = !!o.taker && wallet.address !== o.taker;
  const run = (label: string, method: string, args: xdr.ScVal[], text: string) =>
    act.run(label, async () => {
      const me = wallet.address ?? (await wallet.connect());
      if (!me) throw new Error("Connect a wallet.");
      const r = await desk.invoke(me, method, args);
      onChange();
      return r;
    }, (r) => ({ text, hash: r.hash }));

  return (
    <section className="deck p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Offer #{String(o.id)}</h2>
        <span className="flex items-center gap-3 font-mono text-xs text-fog">
          <button className="underline" onClick={() => navigator.clipboard.writeText(window.location.href)}>
            copy link
          </button>
          maker {short(o.maker)}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold">
        <span className="text-pink">{fromUnits(o.sell_remaining)}</span> {sell} <span className="text-fog">for</span>{" "}
        <span className="text-cyan">{fromUnits(o.buy_remaining)}</span> {buy}
      </p>
      <p className="mt-1 font-mono text-xs text-fog">
        1 {sell} = {(Number(o.buy_amount) / Number(o.sell_amount)).toPrecision(6)} {buy} ·{" "}
        {o.allow_partial ? "partial fills ok" : "fill in full"}
        {o.taker ? ` · private to ${short(o.taker)}` : ""}
      </p>
      <dl className="mt-3 grid gap-1 rounded-md border border-seam p-3 font-mono text-[11px] text-fog">
        {[
          ["selling", o.sell_token],
          ["for", o.buy_token],
        ].map(([k, t]) => (
          <div key={k} className="flex flex-wrap items-center justify-between gap-2">
            <dt>{k}</dt>
            <dd className="break-all text-glow">
              {t} {KNOWN_TOKENS[t] ? <span className="text-lime">({KNOWN_TOKENS[t].label})</span> : <span className="text-red">(unverified)</span>}
            </dd>
          </div>
        ))}
      </dl>

      {o.status === 0 && !expired && !isMaker && (
        <div className="mt-5 space-y-3">
          <label className="block text-xs text-fog">
            You pay ({buy})
            <input className="tx mt-1" value={pay} disabled={!o.allow_partial} onChange={(e) => setPay(e.target.value)} />
          </label>
          <div className="flex items-center justify-between rounded-md bg-plate px-3 py-2.5 font-mono text-sm">
            <span className="text-fog">you receive</span>
            <b className="text-pink">
              {fromUnits(receive)} {sell}
            </b>
          </div>
          <button
            className="key key-cyan w-full"
            disabled={!!act.busy || receive <= 0n || blockedPrivate}
            onClick={async () => {
              const me = wallet.address ?? (await wallet.connect());
              if (me) run("fill", "fill", [u64(o.id), addr(me), i128(payUnits)], `Filled: received ${fromUnits(receive)} ${sell}.`);
            }}
          >
            {blockedPrivate ? "Private offer for another taker" : act.busy ? "Confirm in wallet…" : "Fill atomically"}
          </button>
        </div>
      )}
      {o.status === 0 && isMaker && (
        <button className="key key-dim mt-5 w-full" disabled={!!act.busy} onClick={() => run("cancel", "cancel", [u64(o.id)], "Offer cancelled; escrow returned.")}>
          Cancel &amp; return {fromUnits(o.sell_remaining)} {sell}
        </button>
      )}
      {o.status === 0 && expired && !isMaker && (
        <button className="key key-dim mt-5 w-full" disabled={!!act.busy} onClick={() => run("reclaim", "reclaim_expired", [u64(o.id)], "Escrow returned to the maker.")}>
          Return expired escrow to maker
        </button>
      )}
      <div className="mt-3">
        <Msg a={act} />
      </div>
    </section>
  );
}

const TOKENS: [string, string][] = [
  ["XLM", XLM_SAC],
  ["DEMO (testnet)", DEMO_TOKEN],
];

function TokenPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = TOKENS.some(([, id]) => id === value);
  return (
    <div className="space-y-1.5">
      <select className="tx" value={known ? value : "custom"} onChange={(e) => onChange(e.target.value === "custom" ? "" : e.target.value)}>
        {TOKENS.map(([l, id]) => (
          <option key={id} value={id}>
            {l}
          </option>
        ))}
        <option value="custom">Other token contract…</option>
      </select>
      {!known && <input className="tx text-xs" placeholder="C… token contract id" value={value} onChange={(e) => onChange(e.target.value.trim())} />}
    </div>
  );
}

function CreateOffer({ wallet, onCreated }: { wallet: Wallet; onCreated: (id: bigint) => void }) {
  const [sellToken, setSellToken] = useState(XLM_SAC);
  const [buyToken, setBuyToken] = useState(DEMO_TOKEN);
  const [sellAmt, setSellAmt] = useState("100");
  const [buyAmt, setBuyAmt] = useState("500");
  const [taker, setTaker] = useState("");
  const [partial, setPartial] = useState(true);
  const [hours, setHours] = useState(48);
  const act = useAction();
  return (
    <form
      className="deck space-y-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const me = wallet.address ?? (await wallet.connect());
        if (!me) return;
        const r = await act.run(
          "create",
          async () => {
            if (taker && !StrKey.isValidEd25519PublicKey(taker)) throw new Error("Taker must be a G… address.");
            const expires = BigInt(Math.floor(Date.now() / 1000) + hours * 3600);
            return desk.invoke<bigint>(me, "create_offer", [
              addr(me),
              addr(sellToken),
              i128(toUnits(sellAmt)),
              addr(buyToken),
              i128(toUnits(buyAmt)),
              taker ? addr(taker) : none(),
              bool(partial),
              u64(expires),
            ]);
          },
          (res) => ({ text: `Offer #${res.result} posted; your side is escrowed.`, hash: res.hash }),
        );
        if (r) onCreated(r.result);
      }}
    >
      <h2 className="font-semibold">Post an offer</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs text-fog">
          You sell
          <input className="tx mt-1" value={sellAmt} onChange={(e) => setSellAmt(e.target.value)} />
        </label>
        <label className="text-xs text-fog">
          You want
          <input className="tx mt-1" value={buyAmt} onChange={(e) => setBuyAmt(e.target.value)} />
        </label>
        <TokenPick value={sellToken} onChange={setSellToken} />
        <TokenPick value={buyToken} onChange={setBuyToken} />
      </div>
      <input className="tx text-xs" placeholder="Private taker G… (optional)" value={taker} onChange={(e) => setTaker(e.target.value.trim())} />
      <div className="flex items-center justify-between text-sm text-fog">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} /> partial fills
        </label>
        <label className="flex items-center gap-2">
          expires in <input className="tx w-16 py-1" type="number" min="1" value={hours} onChange={(e) => setHours(Number(e.target.value))} /> h
        </label>
      </div>
      <button className="key key-pink w-full" disabled={!!act.busy}>
        {act.busy ? "Confirm in wallet…" : "Escrow & post offer"}
      </button>
      <Msg a={act} />
    </form>
  );
}
