# Loyal Cart — CLAIMS.md audit

**Author:** A3 · **Date:** 2026-11-12 · **Scope:** every row of `CLAIMS.md` at CP1.
**Not edited:** `CLAIMS.md` itself. Proposed rewrites below are for the lead to integrate.

**Question each row is asked.** Not "is this true?" — at CP1 nothing is built, so every row is
PLANNED and that is correct and honest. The question is: **if the named evidence were produced
exactly as described, would it prove the claim as worded?** A row can fail in three ways:

- **EVIDENCE TOO WEAK** — the named test/command does not establish the sentence.
- **WRONG EVIDENCE TYPE** — no test or command of that kind can establish the sentence.
- **WORDING OVERCLAIMS** — the evidence is fine, the sentence says more than it shows.

| ID | Verdict | Severity | One-line reason |
|---|---|---|---|
| C01 | WORDING OVERCLAIMS | Low | Struct is text-free; the *offer as experienced* is not, because `metadata_hash` points at arbitrary off-chain text |
| C02 | **WORDING OVERCLAIMS** | **High** | "before shopping starts" is enforced by nothing; policy and hash arrive in the same call |
| C03 | EVIDENCE TOO WEAK + WORDING | Medium | "every valid offer" ignores the 64 cap and the un-posted set |
| C04 | WORDING OVERCLAIMS | Low | "releases funds" — nothing is held; the deposit is forwarded |
| C05 | WORDING OVERCLAIMS | Low | A seller *can* retire; the gate catches it, which is not the same as "cannot change" |
| C06 | WORDING OVERCLAIMS | Medium | "kickback" presumes intent the contract cannot see |
| C07 | PROVES IF COMPLETED | Low | Key listing is the right ground truth; must be pasted in full |
| C08 | **PROVES** (best row) | — | Add a live-RPC run alongside the fixture |
| C09 | **EVIDENCE TOO WEAK** | **High** | The injecting offer is filtered for price/delivery, not because of the injection — the test is near-vacuous as specified |
| C10 | PROVES IF COMPLETED | Low | "testnet demo" vs mainnet-only 1Click is muddled |
| C11 | PROVES IF COMPLETED | Medium | Flag alone does not establish "the security claim does not depend on it" |
| C12 | **EVIDENCE TOO WEAK** | **High** | Addresses prove deployment, not that the deployed wasm is the reviewed source |
| C13 | **WRONG EVIDENCE TYPE** | **Blocking** | "first" is a negative existential; the named evidence is a process, not an artifact. Cannot reach VERIFIED |
| C14 | PROVES | — | Well formed; add machine + toolchain + date |
| C15 | WORDING OVERCLAIMS | Medium | A video cannot prove liveness; the disjunction is an escape hatch with no trigger |
| C16 | **WRONG EVIDENCE TYPE** | **High** | Nine negatives in one row; docs prove documents exist, not that the system fails to defend |

---

## Systemic findings

These matter more than any single row.

### S1. The ledger's own VERIFIED rule is unsatisfiable for every row evidenced by a transaction

The rule reads: *"A row is VERIFIED only when the evidence can be reproduced by a stranger with no
wallet, no funds, and no paid keys."*

A testnet transaction cannot be **reproduced** by a stranger — it can be **inspected**. C04, C06, C12
and C15 all name a real transaction as evidence, so under the ledger's own definition they can never
flip to VERIFIED. The team will then either lie about the status or quietly weaken the rule at CP4.

**Fix:** split the status vocabulary.

- **VERIFIED** — a stranger can rerun the named command on a clean clone with no wallet and get the
  same result. (C08, C14, and the test-backed half of every other row.)
- **ATTESTED** — a stranger can open the named transaction on a public explorer and confirm it says
  what the claim says. Not reproducible, but inspectable. (The testnet halves of C04, C06, C12, C15.)
- **SIMULATED / PLANNED / DROPPED** — unchanged.

Without this split, C12 ("contracts are deployed") is structurally unverifiable, which is absurd,
because it is one of the easiest rows to establish.

### S2. C13 asks for something no evidence can supply

"First" is a negative existential claim. It is proven only by exhaustion and disproven by one
counterexample. The row's named evidence — *"Related-work section; prior-art search; Claude review"* —
contains no artifact a stranger can reproduce: a search has no output, a review has no output. **C13
can never reach any status above PLANNED as written.** See the C13 section below for the split.

### S3. Three rows state an absence and are evidenced as though it were a presence

C01 ("no free-text field"), C06 ("cannot keep it"), C07 ("can only call `execute_purchase`"), C11
("not required") and C16 (nine "does not stop") are all negative claims. A test proves the paths the
author thought of. For negative claims the adequate evidence is one of:

- a **ground-truth enumeration** (C07's `view_access_key_list` — this is why C07 is the best-designed
  absence row in the ledger); or
- an **exhaustive API surface audit** — every public method listed, with the recipient of its funds; or
- an explicit **scope statement** ("we do not attempt X"), which is a documentation claim, not a
  system claim.

### S4. "A test named X" is doing work it cannot do

Several rows name a single unit test while the claim is about the whole system. `non_winner_is_refused`
proves the contract has a branch. It does not prove that no *other* path moves money — that requires
the API-surface audit of S3. Rows C04, C06 and C07 should each carry an explicit "no other method
pays" enumeration, not only a named test.

### S5. The README contains absolute claims with no ledger row

The ledger's rule is "one row per factual sentence in README, demo video, X post and submission form."
These README sentences have no row:

- **"A shopping agent that cannot take a bribe."** (the headline, above the fold). This is the
  strongest sentence in the project and it is completely unledgered. It also overclaims on its own
  terms: the agent can take an off-chain bribe, which C16 concedes.
- **"provably the best on-chain offer"** (paragraph 2) — "provably" is unledgered and C04 only claims
  a refusal path.
- **"There is no free-text field, so listing text cannot steer the ranking."** C01 covers the first
  clause. Nothing covers the *"so"* — the causal claim that the ranking cannot be steered.
- **"The agent cannot omit an offer or swap the policy."** C03 covers omission. Nothing covers policy
  swapping independently of C02 (and C02's own commitment is weaker than this implies).

Add rows or reword. The headline especially: either it gets a row and a rewrite, or the ledger is not
doing what it says it does.

---

## Row-by-row

### C01 — fixed-field offers

> "Merchants post fixed-field offers on chain; there is no free-text field in an offer."
> Evidence: `post_offer_has_no_free_text`; `Offer` schema in SPEC §4.

**Proves?** The struct half, yes. `Offer` has `item_id: String`, `metadata_hash: [u8; 32]` and
otherwise numeric fields. `item_id` is constrained in SPEC §4 to 1–64 chars of `[a-z0-9-_]`, so it is
not free text either.

**Wording.** Overclaims by implication. A reviewer's immediate reply is "so the injection moves to the
metadata behind the hash, or into the item slug." Both are fair: `metadata_hash` commits to arbitrary
off-chain text, and a 64-char slug can carry a message. The sentence is true of the *on-chain struct*
and misleading about the *offer as experienced*.

**Proposed rewrite.**
> "An on-chain offer is a fixed struct — item id, price, delivery days, seller, expiry block, metadata
> hash — with no free-text field. The item id is a slug of 1–64 characters from `[a-z0-9-_]`. Off-chain
> metadata may contain arbitrary text; the offer commits to it only by hash."

### C02 — the policy commitment (highest-value wording fix)

> "The user's scoring policy is hash-committed before shopping starts."
> Evidence: `create_quote` test `policy_hash_mismatch_is_refused`; policy hash golden vector.

**Proves?** It proves the hash check. It does **not** prove *before shopping starts*, and nothing in the
design does. SPEC §6.1 has `create_quote(item_id, policy, policy_hash, ttl)` taking the policy and its
hash **in the same call**. There is no earlier commitment transaction, no timestamp, no block-height
binding to a pre-shopping moment. By the time `create_quote` runs, merchants have already posted offers
and the user may already have seen them.

There is a second-order problem worth the lead's attention: because the policy and its hash arrive
together, `policy_hash == sha256(borsh(policy))` is close to a typo check. It proves the caller did not
mistype. Its real function is **auditability** — it lets a later verifier confirm which policy produced
a given winner — not **pre-commitment**. That is a legitimate and useful property. It is not what the
sentence says.

**Wording.** Materially overclaims. "Committed before shopping starts" is the phrase that makes the
mechanism sound like a commitment device; the implementation is a same-transaction hash. A judge who
reads SPEC §6.1 after reading the claim will conclude the claim was inflated.

**Proposed rewrite.**
> "A quote commits to the user's scoring policy by hash, `policy_hash = sha256(borsh(policy))`, and
> `create_quote` refuses the quote with `PolicyHashMismatch` if the two do not agree. The commitment is
> made in the same transaction that creates the quote, so the policy cannot change after the quote
> exists; it is not committed before offers are visible."

**Note for the lead.** If "committed before shopping" is the intended story, it needs a separate
`commit_policy(policy_hash)` call, owner-only, before any quote — and that is a CP2 design change, not
a wording change. Worth deciding now, because C13 depends on it.

### C03 — the snapshot

> "A quote snapshots every valid offer for the item from the offer book's own index; the agent cannot
> omit an offer."
> Evidence: `create_quote_snapshots_all_valid_offers`; test with an extra valid offer.

**Proves?** Partly. The "agent cannot omit" half is solid: `create_quote` takes no offer list. But
"every valid offer" has two holes the row's own notes acknowledge and the sentence does not:

1. `MAX_OFFERS_PER_QUOTE = 64`, and above that the call **panics** (`TooManyOffers`). Panicking rather
   than truncating is the right choice and should be said out loud — it converts a silent omission into
   a loud failure — but "every" is still bounded by 64.
2. Offers that were never posted are not omissions the contract can prevent. The proof covers the book,
   not the market.

**Proposed rewrite.**
> "`create_quote` builds the offer list from the offer book's own `offers_by_item` index; the caller
> supplies no list, so the agent cannot add, drop or reorder an offer. Every offer valid at the quote
> block is included; above `MAX_OFFERS_PER_QUOTE = 64` the call panics with `TooManyOffers` rather than
> truncating. Offers a merchant never posted are outside the proof."

### C04 — the checkout gate

> "Checkout releases funds only if the chosen offer is the quote's winner."
> Evidence: `checkout_gate` test `non_winner_is_refused`; real refused tx (CP2).

**Proves?** The branch, yes. The "only" needs the API-surface audit (S3/S4): `execute` must be shown to
be the only method on CheckoutGate that pays anyone, and `sweep` on AgentAccount must be shown to pay
only the owner.

**Wording.** "Releases funds" is wrong in a way a careful judge will notice. In v0.1 the gate **forwards
an attached deposit**; it does not hold a pooled balance and release it. Small, but this is exactly the
kind of sentence that gets read back to you.

**Proposed rewrite.**
> "CheckoutGate forwards an attached deposit to a seller only when the chosen offer is the quote's
> recorded winner and every other check passes; any other offer reverts with `NotWinner`. `execute` is
> the only method on the contract that pays a seller."

### C05 — offer immutability

> "A merchant cannot change an offer after the quote; the gate checks the offer hash."
> Evidence: `offer_hash_mismatch_is_refused`.

**Proves?** Yes, if `retire_offer` is included in the hash (`active` is part of `Offer`, so it is).
Worth naming `retire_offer` explicitly in the evidence, because a seller *can* mutate `active`, and the
claim's "cannot change" reads as though they cannot.

**Proposed rewrite.**
> "Offers are immutable on chain; a seller may only retire one before expiry. The quote stores
> `sha256(borsh(offer))` for every offer it snapshotted and the gate recomputes it, refusing with
> `OfferChanged` if the offer no longer matches — so a retire after the quote makes the purchase fail
> rather than change what is bought."

### C06 — bribe forwarding

> "The agent account forwards a merchant kickback to the user; the agent cannot keep it."
> Evidence: `agent_account` test `donate_forwards_to_owner`; real forwarded tx (CP2).

**Proves?** The forwarding, yes. "Cannot keep it" needs the enumeration of S3: every public method on
AgentAccount with the destination of its funds.

**Wording.** Two issues. "Kickback" attributes intent the contract cannot observe — it sees a transfer.
And "the agent cannot keep it" is true of *on-chain transfers to this account*, which is much narrower
than the word "kickback" suggests; a merchant can pay the agent's developer directly, which C16
concedes.

**Proposed rewrite.**
> "Any NEAR sent to the agent account is forwarded to the owner: `donate()` forwards its attached
> deposit in the same call and `sweep()` forwards the whole balance. The contract has no method that
> pays the agent or a third party, so the agent cannot retain an on-chain transfer."

### C07 — the scoped agent key

> "The agent's key can call only `execute_purchase`; it cannot create a quote or withdraw."
> Evidence: key setup script + test `agent_key_method_scope`; testnet key listing.

**Proves?** Yes — this is the best-designed absence row in the ledger, because `view_access_key_list`
is ground truth rather than an argument. Two conditions: the listing must be pasted **in full** (not
summarised), and it must show no full-access key held by the agent on any related account.

**Proposed rewrite.** Keep it, tighten it, and paste the output.
> "The agent holds a NEAR function-call key on the agent account with
> `method_names = ["execute_purchase"]`. A `view_access_key_list` output from testnet, pasted in the
> repo, shows that key and no full-access key held by the agent. Contract-side, `deposit` and
> `create_quote` are owner-only and `execute_purchase` is agent-only."

### C08 — keyless recomputation

> "Anyone can recompute the argmax from public data with no wallet."
> Evidence: `npm run verify -- --fixture fixtures/quote.json`; `make verify`; clean-clone test.

**Proves?** Yes. This is the strongest row in the ledger: dependency-free, no wallet, clean clone,
reproducible. It is the row the other rows should be modelled on.

**Wording.** Minor: a *fixture* proves the verifier works, not that it works on live data. Add one
run against a real quote id over public RPC — that converts "our verifier parses our fixture" into
"our verifier parses the chain".

**Proposed rewrite.**
> "Anyone with Node and no wallet can recompute the winner: `npm run verify -- --fixture
> fixtures/quote.json` re-derives every score and the argmax from the committed quote and offers with a
> dependency-free verifier and prints PASS or FAIL with the divergence. The same verifier runs against
> a live testnet quote id over public RPC."

### C09 — the Bribe Arena (weakest evidence in the ledger)

> "The Bribe Arena demonstrates three attacks refused: prompt injection, kickback, fake offer."
> Evidence: `npm run arena -- --fixture fixtures/arena.json`; tests named after the attacks.

**Proves?** Not as specified. Per SPEC §7 the `injector` offer is **already invalid on independent
grounds** — price 20 exceeds `max_price` 15, and delivery 30 is below `min_delivery_days` 1. So
`prompt_injection_is_ignored` passes without the injection mattering at all: the offer is filtered out
for price and delivery. The test would still pass if the ranker did read listing text. That makes it
close to vacuous as evidence for the claim it is named after.

The underlying property is real — a fixed-field ranker has no text input, so injection cannot reach it
— but the fixture as designed does not demonstrate it. The fix is a fixture change, not a wording
change: add an injecting offer that is **otherwise valid and would win on the numbers**, and show it
wins on merit with the injected text present and ignored.

**Wording.** "Three attacks refused" also overstates what the arena does. The kickback is *forwarded*,
not refused; the fake offer is *excluded by the filter*, not refused by a security decision. Two of the
three are not refusals.

**Proposed rewrite.**
> "The Bribe Arena runs a scripted naive agent that reads listing text against a fixed-field ranker
> that parses no text at all, on a fixed seed (`loyal-cart-arena-v1`). The naive agent's choices are
> refused at checkout (`NotWinner`/`OfferInvalid`); the ranker is unaffected because it has no text
> input, and an injected listing that is otherwise valid wins or loses purely on its numbers.
> Injection resistance here is structural, not a defence against a merchant who lies in the fixed
> fields."

### C10 — the dry 1Click quote

> "The 1Click checkout quote is a dry quote; no funds move in the testnet demo."
> Evidence: 1Click `dry: true` response logged; UI label.

**Proves?** Yes if the response body is logged verbatim and the UI label is screenshotted.

**Wording.** "in the testnet demo" is muddled: 1Click is mainnet-only, so the quote is a mainnet quote
inside a testnet demo. Say it.

**Proposed rewrite.**
> "The demo's 1Click quote is dry (`dry: true`; the response is logged) and is labelled dry in the UI.
> 1Click is mainnet-only, so the demo shows a mainnet quote and moves no mainnet funds."

### C11 — the optional private brief

> "The optional private brief is not required for the security claim."
> Evidence: Code path flag `PRIVATE_BRIEF=off`; test that the base flow works with it off.

**Proves?** Not by itself. "Not required for the security claim" is a statement about the *threat
model*, so the evidence has to be a threat-model cross-reference — every defended item in `docs/
THREAT_MODEL.md` shown to hold with the brief off — not a flag and a smoke test.

**Wording.** Fine in spirit. Note the row is ambiguous about whether the feature exists; if it is cut,
the honest row is "not implemented", which is a different claim from "not required".

**Proposed rewrite.**
> "The optional private brief is off in every configuration this ledger evidences
> (`PRIVATE_BRIEF=off`), and no other row depends on it. If it is not built by CP4, the README says
> 'not implemented'."

### C12 — testnet deployment

> "The contracts are deployed on NEAR testnet at the addresses in the README."
> Evidence: `near view-state` / explorer links; deployment log.

**Proves?** That *something* is deployed at those addresses. It does **not** prove that what is deployed
is the code in this repository. Anyone can deploy any wasm and put the address in a README. The missing
link is the one that matters: **`code_hash` of the deployed account vs. the hash of a wasm built from
the committed source.**

There is also a circularity: "at the addresses in the README" — the README currently has no addresses.

**Wording.** Overclaims by omission. A reviewer will assume "deployed contracts" means "the reviewed
contracts", and nothing establishes that.

**Proposed rewrite.**
> "The three contracts are deployed on NEAR testnet at the addresses listed in the README. For each
> address the README records the account's `code_hash`, the commit it was built from, and the
> `cargo build --target wasm32-unknown-unknown --release` invocation that reproduces it; the deployment
> log is committed."

### C13 — the originality sentence

> "The narrow originality claim: *'the first shopping agent whose checkout is gated by an on-chain
> proof that it chose the best offer under the user's committed scoring, with kickbacks forwarded by
> contract.'*"
> Evidence: Related-work section; prior-art search; Claude review.

**Proves?** No, and no evidence of the named type can. See S2. The row's own note says "Banned until
evidence is reviewed" — that review is this document.

**Clause-by-clause.**

| Clause | Problem |
|---|---|
| "The first" | Negative existential. Unprovable by test, falsifiable by one counterexample. The named evidence is a process, not an artifact. And the mechanism half — argmax over a committed set gates on-chain release — is published and peer-reviewed (Gebele et al., DeFi '25) and implemented (`TimmMu/tee-confidential-auctions`). |
| "shopping agent" | At CP1 there is no shopping agent — a spec, a fixture, a scripted arena. If the arena is scripted, the honest noun is "simulated shopping agent". |
| "checkout is gated" | True of the design, unimplemented at CP1. Fine once built. |
| "on-chain proof" | Invites a zero-knowledge reading. What exists is deterministic on-chain computation plus a re-executable verifier. That is genuinely verifiable; it is not a proof, and "proof" is the word a technical judge will pull on. |
| "it chose the best offer" | "Best" is unqualified — best among the offers posted, valid at the quote block, within the 64 cap. And "it chose" is misleading: the contract computes the winner and the agent can only execute it. The stronger and more accurate statement is that the purchase *is* the argmax. |
| "under the user's committed scoring" | Per C02 the commitment is same-transaction, not pre-shopping. Say "the policy the quote committed to". |
| "with kickbacks forwarded by contract" | True for on-chain transfers only, which C16 concedes. Also the idea has an ancestor: MEV-Share / MEV Blocker rebate third-party payments to the user. |

**Verdict: C13 does not survive as worded. The claim survives; the sentence does not.**

**Recommended fix — split the row.** The mechanism clauses are testable; the novelty clause is not.
Keeping them in one row is what makes C13 permanently unverifiable.

**C13a — mechanism. Status can reach VERIFIED.** Owner: lead.
> "The payment contract will not forward the buyer's funds unless the offer being bought is the argmax
> of every valid offer in the public on-chain offer book, under the scoring policy the quote
> hash-committed. A third party can recheck the choice from chain data with no key, no wallet and no
> hardware trust."
>
> Evidence: C03 + C04 + C05 + C08 as their tests land; a clean-clone `npm run verify` against a live
> testnet quote.

**C13b — novelty. Status is REPORTED, never VERIFIED.** Owner: A3 → lead.
> "To our knowledge, no prior system combines all four of: a public on-chain offer book; a
> buyer-hash-committed scoring policy; a settlement contract that refuses any purchase that is not the
> argmax; and an agent account with no method that can retain a seller payment. The search behind this
> is recorded, dated and re-runnable in `docs/RELATED-WORK.md`."
>
> Evidence: `docs/RELATED-WORK.md` §6 table and §9 recommendation; the source URLs it cites, all read
> at source on 2026-11-12.

**C13c — preferred if the lead will accept it: drop "first" entirely.** Use the L1 sentence from
`RELATED-WORK.md` §7 and let the novelty argument live in prose where citations carry it. This removes
the only clause in the project that one counterexample can destroy, and it costs nothing at the demo.

**C13d — fallback if L1 is challenged.** Use L2 or L3 from `RELATED-WORK.md` §8. L3 in particular
makes no originality claim at all and is safe for the submission form, where there is no room to
qualify.

**Also add to the banned-words list:** "first". It is doing the same job as "world-first" and carries
the same risk.

### C14 — measured numbers

> "Test counts, latency, and gas numbers are measured on this machine/testnet."
> Evidence: Commands + outputs pasted in CP reports.

**Proves?** Yes, by construction. Well formed.

**Proposed rewrite** (small tightening, mostly to pre-empt the "which machine?" question):
> "Every test count, latency and gas figure in the README is pasted together with the command that
> produced it, the machine (OS, CPU), the toolchain versions, the date, and whether it was local or
> testnet."

### C15 — the demo video

> "The demo video shows a real testnet run (or a labelled recorded artifact if testnet is unavailable)."
> Evidence: Video file + tx hashes; label if recorded.

**Proves?** A video proves nothing about liveness on its own. The tx hashes are what carry it, and only
if they resolve on an explorer and match what is on screen.

**Wording.** The disjunction is an escape hatch with no trigger. "If testnet is unavailable" — by whom,
when, decided by whom? As written it licenses a recorded video with no further justification.

**Proposed rewrite.**
> "The demo video shows operations whose transaction hashes appear on screen and resolve on the NEAR
> testnet explorer. Any segment that is a recording rather than a live run is labelled on screen at that
> moment."

### C16 — what this does not stop

> "The project does not stop off-chain offers, merchant collusion, scoring-author collusion, false
> fields, sybil offers, off-chain operator bribes, TEE trust, or upgrade-key risk."
> Evidence: `docs/THREAT_MODEL.md`; README section.

**Proves?** Wrong evidence type, twice over.

1. **Nine claims in one row**, against the ledger's own "one row per factual sentence" rule. If an
   auditor wants to check "sybil offers", there is no row to check.
2. **Documentation proves documents exist, not that the system fails to defend.** The claim is about
   the system's capabilities. The adequate evidence for each item is a code path showing the absence of
   a defence, or an explicit scope statement.

**Wording.** Also: the list conflates two different kinds of limit. Some are *out of scope*
(merchant collusion, false fields, TEE trust) — the system never claimed to address them. Others are
*known gaps in a claimed defence* (off-chain offers, off-chain bribes, upgrade keys) — these are the
ones that matter and they are buried in the middle of a nine-item list.

**Proposed fix: split into C16a–C16i**, one row per item, with C16a written as the sharpest because it
is the one a reviewer will raise first. It is not merely "off-chain offers":

> **C16a.** "The proof covers only offers posted on chain. `post_offer` is permissionless, so any
> merchant may list — but a merchant that never posts is invisible to the quote, and the operator both
> runs the merchant bots and chooses which merchants it recruits."

That sentence is nearly the same admission NorthCinder makes about curated inputs in its own
`docs/RANKING.md`. Making it explicitly, in the README and in the threat model, is the difference
between reading as rigorous and reading as overselling.

Remaining splits, each needing a code path or a scope statement as evidence: C16b merchant collusion ·
C16c scoring-author collusion · C16d false fields · C16e sybil offers · C16f off-chain bribes to the
operator · C16g TEE trust (if the brief is used) · C16h upgrade keys · C16i 1Click dry quotes.
`SPEC.md` §9 already has the prose for all of these; the ledger just needs to give each one a row.

---

## Recommended ledger rule changes

1. **Add the ATTESTED status** (S1). Without it, C04, C06, C12 and C15 can never be VERIFIED and the
   team will either mislabel them or weaken the rule at CP4.
2. **Add "first" to the banned-words list**, alongside "world-first" and "first ever". It carries the
   same risk and C13 is the only place it appears.
3. **Require an artifact path per row**, not a process description. "Prior-art search" and "Claude
   review" are not evidence; `docs/RELATED-WORK.md` is.
4. **Require the API-surface enumeration for every absence claim** (C01, C06, C07, C11, C16).
5. **Add rows for the four unledgered README sentences in S5**, starting with the headline
   "A shopping agent that cannot take a bribe", which is currently the most load-bearing and least
   evidenced sentence in the project.

---

## Summary for the lead

- **C13 does not survive as worded.** Split it into C13a (mechanism, verifiable) and C13b (novelty,
  reported not verified), or adopt the L1 sentence without "first".
- **The three rows to fix before CP2**, because they are structural rather than cosmetic: **C02** (the
  commitment is same-transaction, not pre-shopping), **C09** (the injection fixture passes for the
  wrong reason), **C12** (deployed addresses do not bind deployed code to repo code).
- **The strongest unledgered sentence** is the README headline "A shopping agent that cannot take a
  bribe". It needs a row or a rewrite.
- **C08 and C07 are the models to copy** — reproducible artifact, ground-truth enumeration,
  no adjectives.
