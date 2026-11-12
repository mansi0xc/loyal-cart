# Loyal Cart

**Status: CP2 deployed and locked on NEAR testnet.** OfferBook and CheckoutGate have no full-access keys; the AgentAccount is owner-controlled with a runner key scoped to `execute_purchase`. The real testnet flow includes a winner checkout, a refused non-winner, a cooperative donate, a plain transfer and a permissionless sweep. The claims ledger (`CLAIMS.md`) records the evidence; `deployments.json` is the machine-readable record.

Loyal Cart makes the payment rule **the best offer in a complete public offer book under the buyer's committed scoring**. A bribe cannot change the winner, and an auditor can recheck every purchase from chain data. The checkout refuses any non-winner; that refusal is the enforcement, not the pitch.

For a company, the procurement lead commits the policy; the employee or agent who shops cannot tailor the scoring after seeing the offers. Off-chain bribes to the agent's operator are out of scope.

The honest claim ladder (only use the highest rung whose ledger rows are VERIFIED/ATTESTED):

> **L1 — mechanism.** "A testnet prototype in which the payment contract forwards the buyer's funds to the seller only if the offer being bought is the best-scoring (lowest cost) offer among every valid offer in a public on-chain offer book, under the scoring policy committed in the quote — so a third party can recheck the choice from chain data alone, with no key and no hardware trust — and the agent's own account has no method that can pay the agent or a third party."
>
> **L3 — no originality claim.** "Prior systems publish a verifiable ranking (NorthCinder, by re-execution over disclosed inputs) or sign the purchase (CheckMate by operator HMAC; AP2 and Mastercard Verifiable Intent by an authorisation credential). Loyal Cart makes the ranking the payment condition: the contract refuses any purchase that is not the best-scoring (lowest cost) offer in the on-chain offer book under the committed policy."

We do **not** claim "first", "world-first" or "trustless". The prior-art review found Gebele et al., *Sealed-Bid Auctions via TEE-Backed Confidential Compute Blockchains* (DeFi '25), which already gates settlement on a best-scoring rule over a committed set. Loyal Cart's delta is a public offer book plus a buyer-authored policy with no TEE.

Tracks: **realworld**, **business**, **swarms**, **open**. The lead use case is procurement: the policy author and the shopper are different people, which is what makes the pre-commitment meaningful.

---

## The problem

AI shopping agents are starting to spend real money. The agent's operator, the marketplace, or a seller can steer which offer it picks: paid placement, a kickback to the agent, or free-text in a listing that overrides the agent's instructions. The user has no way to check whose interest the agent served.

## What Loyal Cart will do

1. **On-chain offer book.** Merchants post fixed-field offers (item id, price, delivery days, seller, expiry, metadata hash). The on-chain struct has no free-text field; off-chain metadata may contain arbitrary text and is committed only by hash. The item id is a 1–64 char slug.
2. **User-committed scoring.** The owner commits a hash of the scoring policy (price / delivery / seller reputation weights, max price, exclusions) one-way before any quote; the agent account refuses a quote with a different hash.
3. **Quote snapshot.** The offer book snapshots every valid offer for the item from its own index, up to 64; above the cap it panics rather than truncating. The agent cannot pass an arbitrary list or swap the policy.
4. **Proof-gated checkout.** The checkout contract forwards the buyer's attached deposit to the seller only if the chosen offer is the quote's winner and the offer hash matches. Any other choice reverts.
5. **Forwarding account.** Any NEAR sent to the agent account through `donate` is forwarded to the owner; a plain transfer can be swept to the owner by anyone. The agent has no method that pays the agent or a third party. NEP-141 plain transfers are not forwarded (out of scope). The contract cannot see intent, so "kickback" is a label, not a proof.
6. **Bribe Arena.** A fixed-seed demo with honest and crooked merchants, a **scripted naive agent (no LLM)**, and Loyal Cart. It shows three attacks: a valid offer with injection text and a 0.50 NEAR worse price loses on score; a 5 NEAR cooperative `donate()` cannot change the winner (a plain transfer needs `sweep`); expired/excluded/over-price offers are filtered.

See `SPEC.md` for the interfaces, schemas, scoring, threat model, arena script and demo storyboard.

---

## Quickstart (CP2: unit tests + local sandbox; testnet pending)

These run on a clean clone with no wallet, no funds and no paid keys:

```sh
make test             # Rust workspace + Node verifier/arena tests
make verify           # dependency-free verifier on the committed quote fixture
make arena            # deterministic Bribe Arena fixture
make test-integration # builds wasm, then runs the near-workspaces sandbox flow
```

`make test-integration` deploys the three contracts to a local near-sandbox, runs a quote → winner checkout, asserts a non-winner checkout fails without recording a purchase, and asserts a merchant donation reaches the owner. It downloads the sandbox binary on first run; no testnet or funds are needed. Testnet is deployed and locked (see below).

## Live testnet (deployed 2026-11-12)

| Role | Account |
|---|---|
| Owner | `lc-111206284835-owner.testnet` |
| OfferBook | `lc-111206284835-offerbook.testnet` |
| CheckoutGate | `lc-111206284835-checkout.testnet` |
| AgentAccount | `lc-111206284835-agent.testnet` |
| Runner (agent) | `lc-111206284835-runner.testnet` |
| Merchant | `lc-111206284835-merchant.testnet` |

**Lock check:** OfferBook and CheckoutGate have **0 access keys**; the wasm hashes match the published build (`703e5c57…` and `eb03bea9…`). The AgentAccount has the owner's full-access key and the runner's function-call key scoped to `execute_purchase`. The full record is in `deployments.json`.

**Real transactions:**
- Winner checkout: [qttMVuFUsZPhTMyzPPax9YmKx5sSJapfyPJv9WJ3zv7](https://testnet.nearblocks.io/txns/qttMVuFUsZPhTMyzPPax9YmKx5sSJapfyPJv9WJ3zv7) — seller received exactly 0.1 NEAR.
- Non-winner refusal: [5WJmzbCELSSgi6wX6Daw6j32EwGR5aDJ1kho5ixQagpU](https://testnet.nearblocks.io/txns/5WJmzbCELSSgi6wX6Daw6j32EwGR5aDJ1kho5ixQagpU) — failed receipt `7YxnXodGipvERgZutqzjgGEgq2hXYRntrPM4eeEXdjdm`; no purchase recorded.
- Cooperative donate: [8cbCEPqinRaDdtfPt9bmA7TYyqkSJXVKfXWcTYFjW1Sx](https://testnet.nearblocks.io/txns/8cbCEPqinRaDdtfPt9bmA7TYyqkSJXVKfXWcTYFjW1Sx) — owner +0.05 NEAR.
- Plain transfer: [H8AQCvscfC2mX4vpitSa3jMMBHGSo8A6NmZGEqNuzcsp](https://testnet.nearblocks.io/txns/H8AQCvscfC2mX4vpitSa3jMMBHGSo8A6NmZGEqNuzcsp).
- Permissionless sweep: [FEQvP9E9FTQV55mX3rV1kzaWzG6BXbC11QcD8vM8qQoq](https://testnet.nearblocks.io/txns/FEQvP9E9FTQV55mX3rV1kzaWzG6BXbC11QcD8vM8qQoq).

Live verification against quote 2:

```sh
node packages/verifier/verify.mjs --rpc https://rpc.testnet.fastnear.com \
  --offer-book lc-111206284835-offerbook.testnet --quote 2
```

It prints `OFFER_HASHES_MATCH`, `WINNER_IS_BEST_SCORING`, `CHECKOUT_GATE: PASS`. This is the independent recomputation, with no wallet.

## Agent baseline (honest label)

The arena's baseline is a **scripted naive agent, not an LLM**; the fixture includes its recorded transcript. The security claim does not depend on a model: the contract checks the quote, the hashes and the winner. A real LLM adapter is an optional CP3 seam; see `docs/LLM-AGENT.md` and `packages/agent/agent.mjs`.

## Lock check (after testnet deploy; planned)

After deploying, delete the deployer's full-access keys on OfferBook and CheckoutGate and publish the wasm hashes. The check is:

```sh
node packages/verifier/lock-check.mjs \
  --contract offerbook.<parent>.testnet \
  --expected-code-hash <sha256>
```

It prints the keys and the wasm hash and fails if a full-access key remains or the hash differs. The AgentAccount stays owner-controlled because the owner is the principal. See `scripts/deploy-testnet.sh` and `deployments.example.json`.

---

## Repository layout

```
contracts/shared/        types, scoring, Borsh hashing, golden tests
contracts/offer-book/    offer index, quote snapshot, winner
contracts/checkout-gate/ proof-gated payment
contracts/agent-account/ budget, scoped agent key, kickback forwarding
packages/verifier/       dependency-free Node best-scoring (lowest cost) verifier
packages/arena/          deterministic Bribe Arena
packages/ui/             static demo UI (CP3)
docs/                    threat model, demo, worklogs
fixtures/                committed quote/arena fixtures
```

---

## Related work

- **NorthCinder** — "your shopping agent should work for you"; verifiable neutral ranking by re-execution over *disclosed* inputs, no chain. Its own docs concede that a dishonest service could curate the offer set and then rank honestly over it. Loyal Cart makes the offer set a public contract index and the ranking the payment condition, so the curated-set move cannot close a sale.
- **CheckMate** — deterministic policy engine, injection-resistant listings, signed purchase plan; the signatures are operator HMACs, so a third party cannot verify them without the operator's key. Loyal Cart's quote and winner are on chain, and the payment contract checks them.
- **arXiv 2609.11757 / A-VIP** — names the gap "signing the transaction but not the decision." Loyal Cart binds the decision (best-scoring (lowest cost) under the committed policy) to settlement.
- **Gebele, Mutzel, Öz & Matthes, *Sealed-Bid Auctions via TEE-Backed Confidential Compute Blockchains* (DeFi '25, DOI 10.1145/3733815.3764043)** — already gates settlement on a best-scoring rule over a committed set. Loyal Cart differs by using a public offer book and a buyer-authored policy, with no TEE. This is why we do not claim "first."

These are prior art. The honest claim is mechanism-level, not novelty-level; see `CLAIMS.md` C13a/C13b and `docs/RELATED-WORK.md`.

---

## What this does not stop

- **Off-chain offers.** The proof covers only offers posted on chain. A merchant that never posts is invisible to the quote; paying the agent to ignore it costs nothing.
- **Per-quote, not per-shopping-trip.** The agent chooses which item gets a quote and which quote gets executed. A perfect quote can still be the wrong purchase.
- **The agent never has to buy anything.** A refusal to act leaves no on-chain trace. The design constrains what a purchase pays, not whether one happens.
- **Index-completeness.** "Every valid offer" means every valid offer in this contract's index for the item at that block, not every offer in the market.
- **The 64-offer cap.** Above `MAX_OFFERS_PER_QUOTE = 64`, `create_quote` panics rather than truncating. A griefer who can post 64 valid offers makes an item unquotable.
- **Ordering.** The policy is public to be scored, so a block producer that sees a pending quote can order an offer in front of it. No mitigation ships in v0.1.
- **Merchant collusion.** The proof shows the agent picked the best committed offer under the user's scoring; it does not make the offers competitive or honest.
- **Scoring-author collusion.** The proof binds the choice to the committed policy, not to the quality or fairness of that policy. A delegated or LLM-authored policy can be steered, and the steering will be signed.
- **False fields.** A merchant can lie about delivery or item quality. The proof covers the choice, not the truth of the fields.
- **Sybil offers and reputation farming.** A merchant can post from many accounts and buy its own offers through a second account to inflate `sales`; a seller bond is future work.
- **A plain transfer is not auto-forwarded.** `donate()` forwards the attached deposit; a plain NEAR transfer runs no contract code and must be swept. Anyone can call `sweep()`, but it is not automatic. NEP-141 plain transfers are not forwarded at all.
- **Off-chain kickbacks to the operator/developer.** The contract catches transfers to the agent account, not a side payment to a human. Forwarding is fee capture for the user, not an anti-bribery mechanism. The strong claim is that a bribe cannot change the winner.
- **The policy reveals the budget.** The committed policy is public in the quote, including `max_price`. The optional TEE brief exists only to hide it, and is not part of the security claim.
- **A full-access key on the agent account defeats forwarding.** A contract account with a full-access key can be deleted and its balance sent anywhere. `donate`/`sweep` only bind if no such key exists.
- **Kickback capture is NEAR-only.** A NEP-141 `ft_transfer` to a contract account does not call `ft_on_transfer`; a token plain transfer is not forwarded by `donate`.
- **The user's own key is the root of trust.** Whoever holds it can rewrite the policy, sweep the budget, or delete the agent account. No recovery, multisig or time lock in v0.1.
- **TEE trust, if the optional private brief is used.** NEAR AI Cloud or OutLayer plus a hardware vendor must be trusted. The base claim does not require it.
- **Upgrade keys.** If the deployer can upgrade the contracts, it can change the rules. The README names the key and the mitigation.
- **RPC and external services.** Testnet, the RPC and 1Click are external dependencies; a recorded artifact is a recording, not a live run.
- **1Click dry quotes.** The testnet demo shows a quote, not a mainnet execution.
- **The testnet flow is verified; these are not.** The arena's testnet mode, 1Click, the optional TEE brief, the agent key rotation and the F5 offer-spam protection (one live offer per seller + refundable deposit) are not done.

The full matrix, with attack ids and test names, is in `docs/THREAT_MODEL.md`.

---

## License

MIT. See `LICENSE`.
