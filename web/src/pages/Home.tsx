import { useEffect, useState } from "react";
import { scanOffers, symbolOf, type Offer } from "../desk";
import { fromUnits, short, timeLeft } from "../lib/format";
import { Link, useTitle } from "../lib/router";

export function Home() {
  const [failed, setFailed] = useState(false);
  useTitle("swapdesk · escrowed OTC swaps on Stellar");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [syms, setSyms] = useState<Record<string, string>>({});
  useEffect(() => {
    scanOffers()
      .then(async (all) => {
        setOffers(all);
        const ids = [...new Set(all.flatMap((o) => [o.sell_token, o.buy_token]))];
        const pairs = await Promise.all(ids.map(async (id) => [id, await symbolOf(id).catch(() => short(id))] as const));
        setSyms(Object.fromEntries(pairs));
      })
      .catch(() => setFailed(true));
  }, []);
  const open = (offers ?? []).filter((o) => o.status === 0 && Number(o.expires_at) * 1000 > Date.now());
  const STATS: [string, string][] = [
    ["Open offers", offers ? String(open.length) : "…"],
    ["Filled", offers ? String(offers.filter((o) => o.status === 1).length) : "…"],
    ["Slippage", "none"],
  ];
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.2fr_1fr] md:pt-20">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-pink">Escrowed OTC swaps on Stellar</p>
          <h1 className="mt-4 text-5xl leading-[1.03] md:text-6xl font-bold tracking-tight text-glow">Swap peer-to-peer. <span className="text-cyan">Nobody sends first.</span></h1>
          <p className="mt-6 max-w-xl text-lg text-fog">Makers escrow what they’re selling and name their price. Takers fill atomically, so payment and delivery happen in one transaction or not at all. Private offers, partial fills and expiry, with no order book and no slippage.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/app" className="key key-cyan inline-block">Open the desk →</Link>
            <Link to="/docs" className="key key-dim inline-block">How it works</Link>
          </div>
          <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
            {STATS.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wider text-fog">{label}</dt>
                <dd className="mt-1 text-2xl font-bold tracking-tight text-glow">{value}</dd>
              </div>
            ))}
          </dl>
          {failed && (
            <p className="mt-6 text-sm opacity-80" role="status">
              Couldn’t reach Stellar testnet, so live numbers aren’t shown.{" "}
              <button className="font-semibold underline" onClick={() => window.location.reload()}>
                Retry
              </button>
            </p>
          )}
        </div>
        <div className="deck p-7">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase text-fog">Live book · testnet</p>
            <span className="tag bg-lime/15 text-lime">● live</span>
          </div>
          <div className="mt-4 divide-y divide-seam font-mono text-sm">
            {offers === null && <p className="py-3 text-fog">loading book…</p>}
            {offers && open.length === 0 && <p className="py-3 text-fog">No open offers right now. Post the first one.</p>}
            {open.slice(0, 5).map((o) => (
              <div key={String(o.id)} className="grid grid-cols-[36px_1fr_1fr_60px] items-center gap-2 py-2.5">
                <span className="text-fog">#{String(o.id)}</span>
                <span className="truncate">
                  {fromUnits(o.sell_remaining)} <span className="text-cyan">{syms[o.sell_token] ?? "…"}</span>
                </span>
                <span className="truncate">
                  {fromUnits(o.buy_remaining)} <span className="text-pink">{syms[o.buy_token] ?? "…"}</span>
                </span>
                <span className="text-right text-xs text-fog">{timeLeft(o.expires_at)}</span>
              </div>
            ))}
          </div>
          <Link to="/app" className="key key-cyan mt-5 inline-block">
            Take an offer
          </Link>
        </div>
      </section>

      <section className="border-y border-seam bg-hull/60">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-pink">How it works</p>
          <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-glow">Escrow, fill, settled</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="deck p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold bg-cyan text-void">{i + 1}</span>
                <h3 className="mt-4 text-xl font-bold tracking-tight text-glow">{title}</h3>
                <p className="mt-2 text-sm text-fog">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-pink">Use cases</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-glow">When an order book isn’t the right tool</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {USES.map(([icon, title, body]) => (
            <div key={title} className="deck p-6">
              <span className="text-3xl">{icon}</span>
              <h3 className="mt-3 text-lg font-bold tracking-tight text-glow">{title}</h3>
              <p className="mt-2 text-sm text-fog">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-pink">Guarantees</p>
        <h2 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight text-glow">Atomic by design</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PROMISES.map(([title, body]) => (
            <div key={title} className="rounded-2xl p-7 border border-cyan/30 bg-cyan/5 text-glow">
              <h3 className="text-xl font-bold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm text-fog">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pt-20">
        <div className="deck flex flex-col items-start justify-between gap-6 p-10 md:flex-row md:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-glow">Post your first offer.</h2>
            <p className="mt-2 text-fog">Use the testnet DEMO token or any Stellar asset contract.</p>
          </div>
          <Link to="/app" className="key key-cyan inline-block shrink-0">Open the desk →</Link>
        </div>
      </section>
    </>
  );
}

const STEPS: [string, string][] = [
  [
    "Maker posts an offer",
    "Sell token and amount, buy token and amount, an expiry, optional partial fills and an optional private taker."
  ],
  [
    "Taker fills",
    "They pay the buy token and receive the sell token from escrow in the same transaction, in full or in part."
  ],
  [
    "Leftovers go home",
    "The maker can cancel an open offer any time, and anyone can send an expired offer’s remainder back to the maker."
  ]
];

const USES: [string, string, string][] = [
  [
    "🤝",
    "OTC deals",
    "Agree a price in a chat, then settle trustlessly on-chain."
  ],
  [
    "🔒",
    "Private swaps",
    "Lock an offer to one counterparty’s address."
  ],
  [
    "🧩",
    "Illiquid tokens",
    "Trade assets with no market, without anyone going first."
  ],
  [
    "🏢",
    "Treasury rebalancing",
    "Swap large amounts at a fixed price with no slippage."
  ]
];

const PROMISES: [string, string][] = [
  [
    "No counterparty risk",
    "Both legs settle in one transaction. If either fails, nothing moves."
  ],
  [
    "Exact prices",
    "Partial fills pay out at the maker’s price, and rounding always favours the maker."
  ],
  [
    "Your escrow, your exit",
    "Cancel an open offer to get the unsold remainder back straight away."
  ]
];
