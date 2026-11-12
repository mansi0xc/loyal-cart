# Loyal Cart — Claims Ledger

**Status at CP1:** every row is **PLANNED** except where noted. No user-facing text may present a PLANNED row as verified.
**Rule:** one row per factual sentence in README, demo video, X post, and submission form.

**Status values**
- **VERIFIED** — a stranger can rerun the named command on a clean clone with no wallet, no funds and no paid keys and get the same result.
- **ATTESTED** — a stranger can open the named public artifact (tx, explorer page, deployed state) and check that it says what the claim says. Not re-executable, but inspectable.
- **SIMULATED** — the behavior is modelled in a fixture or local mock and must be labelled as such.
- **PLANNED** — not built yet. May appear in planning docs, never as a present-tense fact in user-facing text.
- **DROPPED** — removed from user-facing text. Kept here so the decision is recorded.

**Banned words until a row proves them:** world-first, first ever, first, unhackable, trustless, secure, production-ready. The word "first" is banned everywhere in this project; the prior-art review found a DeFi '25 paper with the same mechanism shape (Gebele et al., DOI 10.1145/3733815.3764043). The honest claim is mechanism-level, not novelty-level.

---

## The claim ladder

**L1 — the mechanism (safe to use once verified):**
> "Loyal Cart is a testnet prototype in which the payment contract forwards the buyer's funds to the seller only if the offer being bought is the best-scoring (lowest cost) offer among every valid offer in a public on-chain offer book, under the scoring policy committed in the quote — so a third party can recheck the choice from chain data alone, with no key and no hardware trust — and the agent's own account has no method that can pay the agent or a third party."

**L2 — the differentiator (use if L1 is challenged as old):**
> "A shopping checkout in which the offer set is a public contract index rather than a service's own disclosed inputs, so an operator cannot rank honestly over a curated set and still be paid."

**L3 — the no-originality fallback (safest for the form):**
> "Prior systems publish a verifiable ranking (NorthCinder, by re-execution over disclosed inputs) or sign the purchase (CheckMate by operator HMAC; AP2 and Mastercard Verifiable Intent by an authorisation credential). Loyal Cart makes the ranking the payment condition: the contract refuses any purchase that is not the best-scoring (lowest cost) offer in the on-chain offer book under the committed policy."

Do not use L1/L2/L3 until the rows they depend on are VERIFIED/ATTESTED. At CP1, use "testnet prototype, not functional yet."

---

## Ledger

| ID | Claim (exact wording allowed) | Where it appears | Evidence (test / command / tx) | Status | Owner | Notes |
|---|---|---|---|---|---|---|
| C00 | "Loyal Cart makes the payment rule the best offer in a complete public offer book under the buyer's committed scoring. A bribe cannot change the winner; an auditor can recheck every purchase from chain data. The checkout refuses any non-winner. Off-chain bribes to the operator are out of scope." | README headline, video, X post | C04 + C06 + C08 + C16; not a standalone proof | PLANNED | lead | F2 pitch: the rule first, the refused tx second. Do not lead with "spending firewall". |
| C01 | "An on-chain offer is a fixed struct — item id, price, delivery days, seller, expiry block, metadata hash — with no free-text field. The item id is a slug of 1–64 chars from `[a-z0-9-_]`. Off-chain metadata may contain arbitrary text; the offer commits to it only by hash." | README, SPEC | `Offer` schema; `post_offer_stores_an_immutable_offer`; `post_offer_rejects_a_bad_slug` | VERIFIED (local unit) | contract | The old wording "no free text, so listing text cannot steer the ranking" was too broad; the metadata hash is the injection surface. |
| C02 | "The user commits a scoring-policy hash to the AgentAccount before any quote; `commit_policy` is one-way, and `create_quote` refuses a policy whose hash does not match the commitment." | README, video | `owner_commits_a_policy_one_way`; `a_policy_cannot_be_committed_twice`; `create_quote_requires_a_commitment`; `make test-integration` | VERIFIED (local unit + sandbox) | contract | Design change at CP1: add `commit_policy` to AgentAccount. The old "policy and hash in the same call" was auditability, not pre-commitment. |
| C03 | "A quote includes every valid offer in the contract's index for the item at the quote block, up to `MAX_OFFERS_PER_QUOTE = 64`; above the cap it panics rather than truncating." | README, video | `create_quote_snapshots_all_valid_offers_and_picks_the_winner`; `create_quote_filters_expired_excluded_and_over_price_offers`; `create_quote_panics_above_the_offer_cap` | VERIFIED (local unit) | contract | Index-completeness, not market-completeness. The un-posted set is out of scope (C16). |
| C04 | "The checkout contract forwards the buyer's attached deposit to the seller only if the chosen offer is the quote's winner; every other choice reverts." | README, video | `non_winner_is_refused`; `make test-integration` (failed gate receipt, no purchase, seller balance unchanged) | VERIFIED (local sandbox; testnet tx pending) | contract | "Forwards" not "releases": the contract never holds a balance. |
| C05 | "Offers are immutable and there is no retire method; the quote commits to each offer hash, and the gate rejects a hash mismatch." | README | `a_tampered_winner_offer_is_refused_at_registration`; no `retire_offer` in the ABI | VERIFIED (local unit) | contract | Removing `active` fixed the hash-mutability bug. |
| C06 | "Any NEAR sent to the agent account through `donate` is forwarded to the owner; any balance left by a plain transfer can be swept to the owner by anyone. The contract has no method that sends funds to the agent or a third party. 'Kickback' is a label; the contract cannot see intent." | README, video | `a_merchant_donation_is_forwarded`; `anyone_can_sweep_to_the_owner`; `make test-integration` (owner balance +5 NEAR) | VERIFIED (local sandbox; testnet tx pending) | contract | A NEP-141 plain transfer is not forwarded by `donate`; see C16. |
| C07 | "The agent's key is a function-call key with `method_names = ['execute_purchase']` only; it cannot create a quote, change the policy, withdraw or sweep." | README | `near view-access-key-list` output (CP2); `agent_key_method_scope` test | PLANNED | lead | Ground-truth enumeration, not a test alone. |
| C08 | "Anyone can recompute the best-scoring (lowest cost) from the committed quote with no wallet, no funds and no paid keys." | README, video | `npm run verify -- --fixture fixtures/arena.json` (PASS) | VERIFIED (fixture; live RPC pending) | verifier | Add the live-RPC run; the fixture alone is not enough. |
| C09 | "The arena shows three attacks: (a) a *valid* offer with injection text and a 0.50 NEAR worse price loses on score; (b) a 5 NEAR cooperative `donate()` cannot change the winner (a plain transfer needs `sweep`); (c) expired, excluded and over-price offers are filtered." | README, video | `npm run arena -- --fixture fixtures/arena.json` (three PASS); `make test-integration` for the donate and plain-transfer+sweep paths | SIMULATED (fixture; real transfer evidenced in C06) | arena | The old injection test was vacuous and won on a tie-break. Offer 7 is now valid but strictly worse; the scripted baseline picks it, the ranker does not. |
| C10 | "The 1Click panel shows a `dry: true` quote; no funds move on testnet." | README, video, UI | Logged 1Click response + UI label `quote only; no funds move` | PLANNED | arena | Mainnet execution is out of scope. |
| C11 | "The optional private brief is not required for the security claim; with `PRIVATE_BRIEF=off` the quote/winner tests are identical." | README | Test matrix with the flag on/off; `private_brief_is_optional` | PLANNED | lead | If cut, say "not implemented". |
| C12 | "The contracts are deployed on NEAR testnet at the addresses in the README, and the deployed wasm code hash matches the reviewed source build." | README, form | `near view-state`; explorer links; `sha256` of the built wasm; reproducible build command | PLANNED | lead | ATTESTED for addresses; VERIFIED for the build hash. Addresses alone do not prove the code. |
| C13a | "In this testnet prototype, the checkout contract forwards the buyer's funds to the seller only if the chosen offer is the best-scoring (lowest cost) offer in the public offer-book index under the policy committed in the quote." | README, video, form | C02 + C03 + C04 + C08 | PLANNED | lead | The mechanism claim. L1/L2/L3 are built from this. |
| C13b | ~~"The first shopping agent whose checkout is gated by..."~~ | nowhere | Prior-art review (`docs/RELATED-WORK.md`) | **DROPPED** | lead | "First" is a negative existential and is falsified by Gebele et al., DeFi '25. Do not use in any user-facing text. |
| C14 | "Test counts, latency and gas numbers are measured on this machine/testnet, with the command and output pasted." | README | 39 Rust unit tests, 1 sandbox integration test, 13 Node tests; commands and outputs in CP1/CP2 reports | VERIFIED (counts) | lead | No estimates. |
| C15 | "The demo video shows a live testnet run; any recorded segment is labelled 'recorded'." | video, X post | Video file + tx hashes + label | PLANNED | lead | A video cannot prove liveness; the label is the claim. |
| C16 | "We do not attempt to prevent: off-chain offers, per-quote-not-per-trip choices, refusal to buy, merchant collusion, scoring-author collusion, false fields, sybil offers, reputation farming, off-chain operator bribes, a full-access key on the agent account, NEP-141 kickbacks, TEE compromise, upgrade-key abuse, RPC outage, or dry-quote confusion. The README lists them." | README "What this does not stop" | `docs/THREAT_MODEL.md` §5; README section | PLANNED | A1 | A scope statement, not a system claim. Keep all 20 items in spirit. |
| C17 | "No public method on AgentAccount or CheckoutGate can pay the agent or a third party other than the seller of a valid winner." | README | API-surface table: every public method, its caller, and its fund recipient; `no_other_payout_path` audit | PLANNED | lead | The negative claim needs enumeration, not a single test. |
| C18 | "Related work: NorthCinder publishes a verifiable ranking over disclosed inputs; CheckMate signs the purchase with an operator HMAC; AP2/Mastercard Verifiable Intent sign the authorisation; Gebele et al. (DeFi '25) use a TEE-backed auction with best-scoring (lowest cost)-gated settlement. Loyal Cart's delta is a public offer book plus a buyer-authored policy, with no TEE." | README "Related work" | `docs/RELATED-WORK.md` with URLs/DOI | PLANNED | A3 | Reported context, not a claim of novelty. |

---

## Rules for use

1. A PLANNED row may appear in the README only with the status label "planned" or in a "Status: CP1" header. It must not appear in the video, X post or form as a present-tense fact.
2. An ATTESTED row may appear as "on testnet, tx <hash>" and must link the explorer.
3. A SIMULATED row must say "simulated" in the same sentence.
4. A DROPPED row never appears.
5. Every number in user-facing text must paste the command that produced it.
6. No fabricated tx hashes, test results, users, partnerships or screenshots.
7. If a row cannot be verified by CP5, delete the sentence; do not soften it.
