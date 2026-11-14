# Loyal Cart — Related Work

**Date:** 2026-11-14 · **Status:** prior-art review. Feeds `CLAIMS.md` C13a.

**Method.** Every project below was read at source on 2026-11-12 — repository READMEs and
specification files fetched raw, paper abstracts pulled from the arXiv API, product docs from the
vendor page. Earlier drafts were treated as leads, not as evidence; three corrections are recorded below (see §5). Where a claim about another project could
not be confirmed at source, it is marked **[unverified]** rather than repeated.

**Why this document exists.** Loyal Cart's only originality sentence (C13) is a negative existential
claim — "the first …". A negative existential claim cannot be proven by a test; it can only be
supported by a search that is documented and re-runnable, and weakened by a single counterexample.
This document is that search record, and it is deliberately written so that a reviewer who finds a
counterexample can point at the row it falsifies.

---

## 1. NorthCinder — the closest thing to the same thesis

`github.com/cinderline/northcinder` · MIT · created 2026-08-17 · ~1.2k stars · Node/pnpm MCP server.

**What it actually is.** A *buyer-run* MCP server for shopping agents. It connects to Shopify,
WooCommerce, eBay, Etsy and read-only Amazon, ranks the returned offers against a buyer brief, and
explains each rank. Its tagline is literally "your shopping agent should work for you." The
repository owner operates no service: local mode is keyless and runs the MCP server and search engine
in one process.

**Its stated verification model — this is the part that matters.** The ranking is open
(`packages/protocol/src/ranking/rank.ts`), deterministic, and pure ("no clock, no randomness, no I/O;
same inputs → byte-identical output"). Every `/v1/search` response returns all the ranking inputs, so
the client re-runs `rankOffers` locally and diffs the service's order (`verifySearchRanking`),
flagging `rankingVerified: false` on divergence. Sponsored placement is not a score input: it puts
an offer in a strictly lower tier, always labelled, with a tested property that setting
`sponsored: true` can never raise a rank. The `NEUTRALITY-AUDIT.md` probe battery measures this.

Critically, `docs/RANKING.md` states the limit of that model in its own words:

> "Client-side verification proves that the ordering, scores, and reasons are exactly what the open
> `rankOffers` produces GIVEN the inputs the service disclosed. … It does **not** prove the disclosed
> inputs are themselves honest. A dishonest service could fabricate trust levels, strip an offer's
> `sponsored` flag, or curate the offer set (drop or invent offers) — and then rank honestly over
> those doctored inputs, passing with `rankingVerified: true`."

**What it does not do.** No chain, no contract, no settlement gate. Checkout is a signed single-use
authorization held by the buyer's own software — "a recommendation is not permission to buy", but the
enforcement is `northcinder`'s own code, not a contract that a third party can hold it to. There is no
agent account, so there is nothing for a seller payment to arrive at and nothing to forward. And
`post_offer`-style admission is not the buyer's: store connection selection is a client config, and in
remote (`NORTHCINDER_SERVICE_URL`) mode offer-set completeness is entirely the service's claim.

**Honest comparison.** NorthCinder is not a weaker Loyal Cart; on one axis it is *stronger*. Its trust
model is re-execution over open code with no hardware and no chain, which is the most sceptical
position available. Loyal Cart's delta is not "more verifiable". It is narrower and more concrete:
**in Loyal Cart the payment cannot happen unless the ranking condition holds.** A dishonest service
in NorthCinder's model can rank honestly over a doctored input set and still close the sale. That is
precisely the move Loyal Cart's checkout gate removes — the contract checks the offers against the
quote's hashes and checks the winner before any money moves. That is the delta to defend, and it is a
delta about *settlement*, not about *verification*.

---

## 2. CheckMate — deterministic policy, but the signature is the operator's own

`github.com/HadiaIshtiaqq/CheckMate` · MIT · built for the PayPal AI Hackathon · FastAPI + Next.js,
Gemini, SerpAPI, PayPal Sandbox.

**Mechanism.** Ten agents propose; a deterministic policy engine decides, returning `PASS`, `FAIL` or
`UNKNOWN`, and `UNKNOWN` is never treated as a pass. Listing text is treated as data: "The LLM can
only add stricter rules, never relax yours, and its spec output is limited to fields the engine can
verify." A hashed, versioned purchase plan is produced; approval is bound to that plan's SHA-256 and
version; "no signed plan, no PayPal order."

**What the signature actually proves.** This is where earlier summaries need correcting. CheckMate
signs with **HMAC** — "approvals, passports and the audit-chain head are HMAC-signed with a key kept
*outside* the database." HMAC is symmetric. So the signature proves:

- the operator's own server did not act on a plan it had not signed;
- a plan was not edited after signing, relative to a key the operator holds;
- the audit chain was not edited after the fact.

It does **not** prove the operator ranked honestly, did not curate the offer set, or did not favour a
merchant — because the operator holds the key, is the source of the offers (SerpAPI), and authored the
policy engine. And because the key is symmetric, no third party can verify a passport without being
able to forge one. CheckMate is tamper-evidence *against outsiders and against database-level edits*.
It is not public verifiability.

**What it does not do.** No chain. No public recomputation. No committed offer set. The checkout
blocking that catches seven attacks runs only against its fictional demo store; its own "Honest
limits" section says real-store purchases are *self-reported* because "real stores don't expose their
checkout to third parties." No kickback handling.

---

## 3. A-VIP (arXiv 2609.11757) — the gap, named exactly

**"Signing the Transaction but Not the Decision: Whisper Attacks and a Binding Defense for AP2"**,
Yedidel Louck, Amit Dvir, Ariel Stulman · 2026-09-10 · cs.CR · `arxiv.org/abs/2609.11757`.

**The exact gap it names**, from the abstract: agent payment protocols such as AP2 "produce
cryptographically valid signatures for completed purchases, yet do not constrain the decisions that
lead to them. Consequently, ordinary product-description text can steer a shopping agent into forming
a cart that passes every protocol check but no longer matches the user's request."

Three attacks, measured on the Gemini Flash-Lite models AP2's own samples specify: **90%** (agent is
steered into fetching another user's payment credentials), **56%** (a cryptographically valid cart
whose contents do not match what the user was shown), **73.3%** (a single factual claim about stock or
lineage moves the agent from the cheaper displayed item to a more expensive one, with the cart
remaining fully consistent with the listing). The authors report the same vulnerability across
seventeen Google models, three agent frameworks, two cross-vendor anchors and Google's consumer
assistant.

**The defence.** A-VIP "treats the signed intent as a capability grant rather than judging the
merchant's description": it binds every credential lookup to the session that requested it and every
cart line to the listing that was seen. The first two attacks leave structural traces and are blocked
with zero false positives. **The third attack leaves no trace** — so A-VIP "surfaces unauthorized
spending for user confirmation." It escalates; it does not decide.

**Why this is the right citation and the wrong comparison.** A-VIP names the same gap Loyal Cart is
aimed at, but it closes a different one. A-VIP binds the cart to *the listing the user was shown*. It
takes the displayed listing as ground truth and detects drift from it. It never asks whether the shown
listing was the best one available. Loyal Cart's `NotWinner` refusal binds the purchase to a computed
best-scoring (lowest cost) over a committed set, which is a strictly different condition: a cart that matches the listing
exactly still reverts if that listing was not the winner. Say this precisely and the citation helps;
say "A-VIP names our gap" without the distinction and it reads as though Loyal Cart is a variant of
A-VIP.

---

## 4. Adjacent work

One line each on what it covers and why it is not Loyal Cart.

**nearcarta** — `github.com/nearcarta/nearcarta`, live on NEAR **mainnet**. "An AI agent can be talked
into paying the wrong person. Nearcarta puts the payment rules in a NEAR contract the agent cannot
change, so a fooled agent produces a refused transaction instead of a loss." A charter-board contract
checks allowlist, per-shop cap, session cap, per-action cap, daily budget, daily count, window, expiry,
nonce and signature before paying, with named refusals (`receiver_not_allowlisted`,
`over_per_action_cap`). **Covers:** who the agent may pay and how much. **Not Loyal Cart:** it gates
the payee and the amount, not the choice between N competing offers. Its Ferry shop does mark the
larger-output quote `best rate`, but via an off-chain `pickBest` in the client, with no committed
policy and no best-scoring (lowest cost) over an on-chain book. Worth noting: nearcarta is *stronger* than Loyal Cart on
deployment evidence (mainnet, real tx hashes, no access key on the board) and should not be
caricatured as a mere spend limit.

**Flock** — pooled demand → sealed-bid (commit/reveal)
reverse auction on NEAR; second-price settlement; a seller that hides an offer loses its bond; the
browser recomputes every settled round from the revealed offers. **Covers:** auction integrity and
group-buying protection. **Not Loyal Cart:** single-dimension price competition over one item, no
buyer-authored scoring policy, and it defends buyers *from sellers*, not from their own agent. Shares
Loyal Cart's primitives — function-call keys that cannot withdraw, contracts deployed with no access
keys — so Loyal Cart's novelty cannot rest on key scoping, which is already commodity here.

**CartelBreaker** — `github.com/KushnerykPavel/cartelbreaker`. Bonded procurement auction for AI
seller agents; a bid at or above `cost_index + markup_limit` is flagged and slashed from the bond
on-chain; an oracle sets the cost index. **Covers:** seller-side collusion. **Not Loyal Cart:**
orthogonal direction — it constrains what sellers may charge, Loyal Cart constrains what the agent may
choose. They compose rather than compete. Its `docs/NOVELTY.md` and its unusually blunt limitations
section are a good template for Loyal Cart's own.

**Accord** — `github.com/Adityaakr/accord` (this hackathon; business/agents/realworld). Open tenders:
sealed prices are revealed after the deadline, and an on-chain board "picks the lowest valid price, by
a rule anyone can call"; the winner becomes the vendor of a procurement agreement. **Covers:** sealed
tenders and a public lowest-price award. **Not Loyal Cart:** Accord's rule is lowest price; Loyal Cart's
rule is the buyer's committed multi-factor policy, and the checkout refuses any non-winner. Quote #4 is
the proof the two rules differ: a lowest-price rule would have paid #8 at 0.08/120 days; the committed
policy paid #9 at 0.10/1 day. Recorded from the 2026-11-14 scan.

**Restock Relay** — `github.com/fawazdevx/restock-relay` (this hackathon). Scores supplier quotes
55/25/20 on price/delivery/trust in a server policy engine; its README says "the score never
authorizes a payment." **Covers:** supplier ranking as advice. **Not Loyal Cart:** the opposite design —
Loyal Cart makes the score the payment condition, enforced on chain. Recorded from the 2026-11-14 scan.

**VeilProcure** — `github.com/Olalekan2345/veilprocure` (this hackathon). The buyer hashes its
evaluation rules on NEAR, suppliers commit sealed quotes, ranking runs off-chain, and escrow pays the
supplier the buyer selects. **Covers:** sealed procurement with a committed rule hash. **Not Loyal
Cart:** the ranking runs off-chain and the buyer still selects; Loyal Cart's contract refuses any offer
that is not the winner. Recorded from the 2026-11-14 scan.

**Day One** — `github.com/CoderofVibes/day-one` (this hackathon). A procurement agent buying inside
on-chain spending limits, with director approval and QC-gated escrow. **Covers:** how much an agent may
spend and when it may pay. **Not Loyal Cart:** limits and approvals decide *whether* a payment happens;
Loyal Cart decides *which offer* wins under a committed policy. Recorded from the 2026-11-14 scan.

**SwarmBid / General Contractor / SwarmShop** — this hackathon. Agent/bid marketplaces where the agent
picks the cheapest bid or counters once (SwarmShop pays the cheapest fix that passes tests). **Covers:**
agent selection of a bid. **Not Loyal Cart:** the choice is the agent's; in Loyal Cart the contract
recomputes the winner under the committed multi-factor policy and refuses a non-winner. Recorded from
the 2026-11-14 scan.

**AP2** — `github.com/google-agentic-commerce/AP2`. Signed mandates as the authorization artifact for
agent payments. **Covers:** authorization — this payment was authorised for this cart by this user.
**Not Loyal Cart:** the signature is over the transaction, not the decision. This is exactly the gap
A-VIP names and measures.

**Mastercard Verifiable Intent** — `verifiableintent.dev`, `github.com/agent-intent/verifiable-intent`,
announced 2026-03-05 with Google, Draft v0.1, layered SD-JWT credentials forming "tamper-evident
delegation chains that bind AI agent actions to human-approved scope." **Covers:** delegation scope —
what the human approved the agent to do. **Not Loyal Cart:** scope is a permission envelope
(merchants, limits, categories). An agent can spend its entire envelope on the worst offer in the
envelope and produce a perfectly valid chain.

**Visa Trusted Agent Protocol** — unveiled 2025-10-14, co-developed with Cloudflare, RFC 9421 HTTP
message signatures giving an agent a cryptographic identity on each request, verified against a
Visa-operated directory. **Covers:** agent identity and merchant-side trust — is this a legitimate,
accountable agent rather than a bot, and is it authorised for this specific action. **Not Loyal Cart:**
it authenticates who is asking. It says nothing about whether the answer the agent chose was the best
one for the user, and it is merchant-facing, not buyer-facing.

**MEV-Share / MEV Blocker** — order-flow auctions that rebate third-party payments for a user's flow
back to that user. MEV Blocker's own documentation: searchers' backrun bundles, "returning 90% to the
user", plus 50% of builder fees shared with wallet flow originators. **Covers:** the *principle* that a
third party's payment for a user's flow belongs to the user. **Not Loyal Cart:** a rebate pipeline in
trading infrastructure, with no agency, no choice and no proof. It is the conceptual ancestor of one of
Loyal Cart's two mechanisms and **should be credited as such** — claiming kickback-forwarding as a new
idea invites the obvious rebuttal.

**Verifiable sealed-bid auctions (the mechanism-level neighbour).** Gebele, Mutzel, Öz & Matthes,
*Sealed-Bid Auctions via TEE-Backed Confidential Compute Blockchains*, DeFi '25, ACM, published
2025-11-11 (`doi.org/10.1145/3733815.3764043`; also `arXiv:2510.19491`; code at
`github.com/TimmMu/tee-confidential-auctions`). Its shape: bidders commit funds to enclave-controlled
escrow, "the confidential blockchain determines the winner through verifiable off-chain computation
and issues signed settlement transactions for execution on the public chain", and "the resulting
outcome [is] enforced on-chain." **Covers:** best-scoring (lowest cost) over a committed set, with on-chain enforcement of
settlement. **Not Loyal Cart:** auction domain and seller-side price competition; the "policy" is the
auction rule (highest bid), not a buyer-authored, hash-committed scoring policy with weights,
exclusions and a reputation term; bids are sealed, so it needs TEE hardware trust, whereas Loyal Cart's
offers are public and its winner is recomputable in plain Node with no hardware trust at all. This is
the strongest *mechanism-level* precedent and the real threat to an unqualified "first".

---

## 5. Corrections to earlier drafts

Recorded here because these corrections affect the README:

1. **NorthCinder is buyer-run and local by default, not a deployed service.** "Re-run to verify the
   deployed service" describes only the optional self-hosted remote-engine mode. In local mode there
   is no adversary to verify against. The correct framing is the weaker, more accurate one: NorthCinder
   states that its checks cover "the offers NorthCinder received, not the completeness or truth of a
   store's catalog."
2. **CheckMate's signatures are HMAC, not asymmetric.** The earlier note "proves nothing about the
   operator's loyalty" is directionally right but understates the *structural* point: a symmetric key
   means no third party can verify a passport without being able to forge one. That is the cleanest
   single sentence for why CheckMate is not a public proof.
3. **A-VIP does not merely "name the gap" — it ships a defence for two of its three attacks** and
   escalates the third. Describing it as naming-only will read as an undisclosed comparison if a judge
   opens the paper.
4. **NorthCinder's docs explicitly refuse the word "provable"** — "deterministic and auditable (never
   'provably neutral')". Loyal Cart's README should not describe NorthCinder as providing a "provable"
   ranking; that is a strawman a reviewer can check in ten seconds.

---

## 6. Comparison table

| Project | Mechanism | Trust model | What it proves | What it does not | How Loyal Cart differs |
|---|---|---|---|---|---|
| **NorthCinder** | MCP server; open deterministic `rankOffers`; client re-runs and diffs (`verifySearchRanking`); sponsored offers forced into a lower tier; single-use signed mandate at checkout | Re-execution over **disclosed** inputs; no chain, no hardware | That the order, scores and reasons equal what the open ranker produces **given the inputs the service disclosed** | That the disclosed inputs are honest, or that the offer set is complete — stated as out of scope in its own spec; no settlement gate; no agent account, so no kickback surface | Loyal Cart removes the "disclosed inputs" qualifier for the offer set (public contract index, hashed into the quote) and makes the ranking a **payment condition** in a contract, not a check inside the buyer's process |
| **CheckMate** | 10 agents propose; deterministic policy engine returns PASS/FAIL/UNKNOWN; hashed versioned plan; HMAC-signed approval required before a PayPal order | Operator-held **symmetric** HMAC key; trust the operator's server | That the operator's server acted only on a plan it signed, and that neither plan nor audit chain was edited after signing | That the operator ranked honestly, did not curate offers, or favoured a merchant; third-party verification at all (symmetric key); no chain; real-store purchases are self-reported | Loyal Cart's check is public and asymmetric in effect: anyone recomputes the winner from chain data with no key and no permission |
| **A-VIP (2609.11757)** | Binds credential lookup to session and cart line to the listing seen; flags unauthorised spend | AP2 credential infrastructure | That the cart matches the listing the user was shown | That the listing was the best available; the third attack leaves no trace and is escalated to the user for confirmation | Loyal Cart binds to an best-scoring (lowest cost) over a committed offer set, so a cart that matches its listing exactly still reverts if the listing was not the winner |
| **nearcarta** | On-chain charter board: allowlist, caps, budget, count, window, expiry, nonce, signature checked before a yoctoNEAR moves | NEAR contract; agent holds a scoped function-call key; board has no access key | That the payment went to an allowed payee within the user's caps | That the agent chose the best offer; no offer book, no committed scoring, no best-scoring (lowest cost) | Loyal Cart gates *which* offer, not just *whom* and *how much*. nearcarta is stronger on deployment evidence (mainnet, real tx) |
| **Flock** | Pooled demand → commit/reveal sealed-bid reverse auction; second-price; offer-hiding slashed; browser recomputes every settled round | NEAR contract + bond; re-execution in the browser | That settlement followed the auction rule over the revealed offers | Any buyer-authored scoring policy; multi-dimensional offers; anything about the buyer's own agent | Loyal Cart's ranking is the buyer's policy, not a fixed auction rule; its adversary is the agent, not the seller |
| **CartelBreaker** | Bonded procurement auction; bids at/above `cost_index + markup_limit` flagged and slashed on-chain | NEAR contract + a trusted cost oracle | That supra-competitive bids were detected and punished | Anything buyer-side; the oracle is a trust assumption it names itself | Orthogonal. CartelBreaker constrains sellers, Loyal Cart constrains the agent. They compose |
| **AP2** | Signed mandates (intent / cart / payment) as authorisation credentials | Credential issuer + protocol | That this payment was authorised for this cart by this user | That the decision behind the cart was sound — the gap A-VIP measures at 56–90% attack success | Loyal Cart adds the missing decision check and puts it in the settlement path |
| **Mastercard Verifiable Intent** | Layered SD-JWT delegation chain binding agent action to human-approved scope | Issuer-anchored credential chain | That the agent acted inside the scope the human approved | That the offer chosen inside that scope was the best one | Same envelope-vs-choice distinction: scope is a permission, not a ranking |
| **Visa TAP** | RFC 9421 signed HTTP headers; agent identity verified against a Visa-run directory | Visa-operated directory; issuer trust | That the caller is a legitimate, accountable agent authorised for that action | Anything about the buyer's interest; merchant-facing by design | Loyal Cart is buyer-facing and proves a choice, not an identity |
| **MEV-Share / MEV Blocker** | Order-flow auction; third-party payments for user flow rebated to the user (90% of backrun bundles; 50% of builder fees to wallet originators) | Auction operator + searcher honesty | That a rebate was paid to the flow originator | Any choice, any agent, any proof; no non-retention guarantee, only a payout policy | Loyal Cart's non-retention is structural — the agent account has no method that pays the agent — where MEV rebates are a policy of the operator. Loyal Cart must credit this as the ancestor of the idea |
| **TEE sealed-bid auctions (DeFi '25)** | Bids escrowed to enclave addresses; enclave computes the winner; signed settlement txs enforced on a public chain | **TEE hardware** + confidential-compute chain | That the winner is the best-scoring (lowest cost) of the committed bid set, enforced at settlement | A buyer-authored scoring policy; multi-dimensional offers; freedom from hardware trust; public recomputation | Loyal Cart gets the same "best-scoring (lowest cost) gates release" shape with **no TEE**, because its offers are public — the winner is recomputable in plain Node. Its policy is buyer-authored, not a fixed auction rule |
| **Loyal Cart** | Public on-chain offer book; `create_quote` snapshots every valid offer from the book's own index and stores `policy_hash` + per-offer hashes; `CheckoutGate.execute` refuses unless the offer is the stored winner and hashes match; `AgentAccount` forwards inflows to the owner | NEAR contracts; the OfferBook code is the trust assumption; no TEE, no oracle, no TEE-attested hardware | That the purchase is the best-scoring (lowest cost) of the on-chain offer book under the policy the quote committed to — recheckable by any third party with no wallet | That the offers are competitive or truthful; that unposted offers exist; that the policy is good; that an off-chain side payment was not made; that the deployer cannot upgrade | — |

---

## 7. The claim we make

> "Prior systems publish a verifiable ranking (NorthCinder, by re-execution over disclosed inputs) or sign the purchase (CheckMate by operator HMAC; AP2 and Mastercard Verifiable Intent by authorisation credential). Loyal Cart makes the ranking the payment condition: the contract refuses any purchase that is not the best-scoring (lowest cost) offer in the on-chain offer book under the committed policy."

That is the user-facing sentence. It is mechanism-level, not a novelty claim, and it matches `CLAIMS.md` C13a.
