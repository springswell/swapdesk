import { CONTRACT_ID } from "../desk";
import { contractLink } from "../lib/stellar";
import { Link, useTitle } from "../lib/router";

const SECTIONS = [
  ["start", "Getting started"],
  ["concepts", "Concepts"],
  ["reference", "Contract reference"],
  ["faq", "FAQ"],
] as const;

export function Docs() {
  useTitle("Docs · swapdesk");
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-5 py-14 lg:grid-cols-[210px_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-1 text-sm">
          <p className="mb-3 px-3 font-mono text-xs uppercase tracking-[0.2em] text-pink">On this page</p>
          {SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href="#/docs"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
              }}
              className="block rounded-lg px-3 py-2 text-fog hover:bg-plate hover:text-glow"
            >
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <article className="min-w-0 space-y-16">
        <header>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-pink">Documentation</p>
          <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight text-glow">How swapdesk works</h1>
          <p className="mt-4 max-w-2xl text-lg text-fog">A Soroban escrow for peer-to-peer swaps between any two Stellar assets, settled atomically.</p>
        </header>

        <section id="start" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-bold tracking-tight text-glow">Getting started</h2>
          <ol className="space-y-3">
            {START.map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-cyan text-void">{i + 1}</span>
                <p className="pt-0.5 text-glow/90">{step}</p>
              </li>
            ))}
          </ol>
          <Link to="/app" className="key key-cyan inline-block inline-block">Open the desk →</Link>
        </section>

        <section id="concepts" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-bold tracking-tight text-glow">Concepts</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CONCEPTS.map(([term, body]) => (
              <div key={term} className="deck p-5">
                <h3 className="text-lg font-bold tracking-tight text-glow">{term}</h3>
                <p className="mt-1.5 text-sm text-fog">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="reference" className="scroll-mt-24 space-y-5">
          <h2 className="text-3xl font-bold tracking-tight text-glow">Contract reference</h2>
          <p className="text-fog">
            Deployed on testnet at{" "}
            <a className="break-all font-mono text-sm underline text-cyan" href={contractLink(CONTRACT_ID)} target="_blank" rel="noreferrer">{CONTRACT_ID}</a>
          </p>
          <div className="deck overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-seam text-xs uppercase tracking-wider text-fog">
                <tr>
                  <th className="p-3.5">Function</th>
                  <th className="p-3.5">Signed by</th>
                  <th className="p-3.5">What it does</th>
                </tr>
              </thead>
              <tbody>
                {REFERENCE.map(([fn, who, what]) => (
                  <tr key={fn} className="border-t border-seam">
                    <td className="p-3.5 font-mono text-xs text-glow">{fn}</td>
                    <td className="p-3.5 text-fog">{who}</td>
                    <td className="p-3.5 text-fog">{what}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 space-y-3">
          <h2 className="text-3xl font-bold tracking-tight text-glow">FAQ</h2>
          {FAQ.map(([q, a]) => (
            <details key={q} className="deck group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-glow">
                {q}
                <span className="transition group-open:rotate-45 text-cyan">+</span>
              </summary>
              <p className="mt-3 text-sm text-fog">{a}</p>
            </details>
          ))}
        </section>
      </article>
    </div>
  );
}

const START: string[] = [
  "Install the Freighter browser wallet, switch it to Testnet and fund the account with test XLM from Friendbot (lab.stellar.org/account/fund).",
  "Makers: in “New offer”, choose what you’re selling and what you want, the amounts, expiry, partial fills and an optional taker. Signing escrows your side.",
  "Takers: pick an open offer from the book, choose how much to fill and sign. You receive the sold token in the same transaction.",
  "Makers can cancel an open offer at any time, and expired offers can be reclaimed back to the maker."
];

const CONCEPTS: [string, string][] = [
  [
    "Offer",
    "Maker, sell and buy tokens and amounts, what remains of each, expiry and status."
  ],
  [
    "Price",
    "buy_amount ÷ sell_amount, fixed by the maker. Partial fills keep the same price."
  ],
  [
    "Private offer",
    "An offer with a named taker. Nobody else can fill it."
  ],
  [
    "Escrow",
    "The sell side moves into the contract when the offer is created and leaves only by fill, cancel or reclaim."
  ]
];

const REFERENCE: [string, string, string][] = [
  [
    "create_offer(maker, sell_token, sell_amount, buy_token, buy_amount, taker, allow_partial, expires_at)",
    "maker",
    "Escrows the sell side and returns the offer id"
  ],
  [
    "fill(offer_id, taker, pay_amount)",
    "taker",
    "Pays the buy token and receives the sell token pro rata"
  ],
  [
    "cancel(offer_id)",
    "maker",
    "Returns the unsold remainder"
  ],
  [
    "reclaim_expired(offer_id)",
    "anyone",
    "Sends an expired offer’s remainder back to the maker"
  ],
  [
    "get_offer(offer_id)",
    "—",
    "Read state"
  ]
];

const FAQ: [string, string][] = [
  [
    "What stops a taker from paying less?",
    "The contract computes what they receive from what they pay, at the maker’s price, and moves both sides in one transaction."
  ],
  [
    "Can I be front-run?",
    "There’s no price to move, because an offer has a fixed price. A private offer can only be filled by its named taker."
  ],
  [
    "How do I know a token is real?",
    "Check the token’s contract id, not just its symbol. Anyone can create a token called USDC."
  ],
  [
    "What happens at expiry?",
    "The offer can no longer be filled, and the remainder can be returned to the maker."
  ],
  [
    "Are there fees?",
    "No protocol fee, only Stellar network fees."
  ],
  [
    "Is it audited?",
    "Not yet. It runs on Stellar testnet and is open source; treat it as a working prototype until it has been audited."
  ]
];
