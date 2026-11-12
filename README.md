# Loyal Cart

**Status: CP3 deployed and locked on NEAR testnet; the Bribe Arena is replayed with distinct merchants.** OfferBook and CheckoutGate have no full-access keys; the AgentAccount is owner-controlled with a runner key scoped to `execute_purchase`. The real testnet flow includes a winner checkout, a refused non-winner, a cooperative donate, a plain transfer and a permissionless sweep. The claims ledger (`CLAIMS.md`) records the evidence; `deployments.json` is the machine-readable record.

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
3. **Quote snapshot.** The offer book snapshots every valid offer for the item from its own index, up to 64; each (seller, item) may have only one live offer, and above the cap it panics rather than truncating. The agent cannot pass an arbitrary list or swap the policy.
4. **Proof-gated checkout.** The checkout contract forwards the buyer's attached deposit to the seller only if the chosen offer is the quote's winner and the offer hash matches. Any other choice reverts.
5. **Forwarding account.** Any NEAR sent to the agent account through `donate` is forwarded to the owner; a plain transfer can be swept to the owner by anyone. The agent has no method that pays the agent or a third party. NEP-141 plain transfers are not forwarded (out of scope). The contract cannot see intent, so "kickback" is a label, not a proof.
6. **Bribe Arena.** A fixed-seed demo with honest and crooked merchants, a **scripted naive agent (no LLM)**, and Loyal Cart. It shows three attacks: a valid offer with injection text and a 0.50 NEAR worse price loses on score; a 5 NEAR cooperative `donate()` cannot change the winner (a plain transfer needs `sweep`); expired/excluded/over-price offers are filtered.

See `SPEC.md` for the interfaces, schemas, scoring, threat model, arena script and demo storyboard.

---

## Quickstart (CP3: unit tests, local sandbox, live testnet evidence)

These run on a clean clone with no wallet, no funds and no paid keys:

```sh
make test             # Rust workspace + Node verifier/arena tests
make verify           # dependency-free verifier on the committed quote fixture
make arena            # deterministic Bribe Arena fixture
npm run arena:testnet # re-fetches every tx in artifacts/arena-testnet.json (no keys)
make test-integration # builds wasm, then runs the near-workspaces sandbox flow
npm run ui            # CP3 web UI at http://localhost:4173 from artifacts/arena-testnet.json
```

| Do this | See this |
|---|---|
| `make test` | 41 Rust unit tests and 15 Node tests pass |
| `make verify` | `OVERALL: PASS` for the committed quote fixture |
| `make arena` | three attacks pass, fixed seed, no chain |
| `npm run arena:testnet` | 22 checks re-fetched from chain, all PASS |
| `make test-integration` | 1 sandbox pass; refusal message contains `NotWinner` (needs `ulimit -n 65535` on some machines) |
| `node packages/verifier/lock-check.mjs --contract offerbook3… --expected-code-hash fb94…` | 0 keys; wasm hash matches |
| `npm run ui` | CP3 UI at `http://localhost:4173`; the two tx cards and the three attacks |

`make test-integration` deploys the three contracts to a local near-sandbox, runs a quote → winner checkout, asserts a non-winner checkout fails with an on-chain `NotWinner` message and without recording a purchase, and asserts a merchant donation reaches the owner. It downloads the sandbox binary on first run; no testnet or funds are needed. On some machines the sandbox needs `ulimit -n 65535`; this test is optional and the testnet transactions below are the same evidence. Testnet is deployed and locked (see below).

## Live testnet (CP3, deployed 2026-11-12)

| Role | Account |
|---|---|
| Owner / buyer | `lc-111206284835-owner.testnet` |
| OfferBook | `offerbook3.lc-111206284835-owner.testnet` |
| CheckoutGate | `checkout3.lc-111206284835-owner.testnet` |
| AgentAccount | `agent3.lc-111206284835-owner.testnet` |
| Runner (agent) | `lc-111206284835-runner.testnet` |
| Honest A | `honest-a.lc-111206284835-owner.testnet` |
| Honest B | `honest-b.lc-111206284835-owner.testnet` |
| Crooked (kickback) | `crooked.lc-111206284835-owner.testnet` |
| Injector (invalid) | `injector.lc-111206284835-owner.testnet` |
| Injector (valid, worse) | `injector-valid.lc-111206284835-owner.testnet` |
| Expired | `expired.lc-111206284835-owner.testnet` |
| Excluded | `excluded.lc-111206284835-owner.testnet` |

**Lock check:** OfferBook and CheckoutGate have **0 access keys**; the deployed code hashes match the published values (`fb94e3ed…` OfferBook, `4b18f337…` CheckoutGate, `b70796e3…` AgentAccount). This is not a reproducible-build claim: a plain `cargo build` embeds machine-specific paths, so a rebuilt wasm can differ. The lock check proves chain hash = published hash, not chain code = reviewed source. The AgentAccount has the owner's full-access key and the runner's function-call key scoped to `execute_purchase` with a 0.25 NEAR allowance (gas only). The full record is in `deployments.json`; the CP2 record is in `artifacts/cp2-deployments.json`.

**Real CP3 transactions** (item `gpu-hour-cp3-final3`, quote 2/3):
- Winner checkout: [Fj64Shdpa4GFkMpVTKQHvFk3hD1Smo2DoT2Hd5gphbKa](https://testnet.nearblocks.io/txns/Fj64Shdpa4GFkMpVTKQHvFk3hD1Smo2DoT2Hd5gphbKa) — quote 2, offer 26 (`honest-a`) paid exactly 0.1 NEAR.
- Non-winner refusal: [4HfakrGLYqYUAJ9bbboxk3FFMLCvZFRkSxX9k7UZhcTX](https://testnet.nearblocks.io/txns/4HfakrGLYqYUAJ9bbboxk3FFMLCvZFRkSxX9k7UZhcTX) — quote 3, offer 30 (`injector-valid`, 0.105 NEAR) failed with `Smart contract panicked: NotWinner`; no purchase recorded.
- Cooperative donate: [4MeYcugH9CFAFK6uMfoPYTLwxbHVxpMAThKFHmQZw9F5](https://testnet.nearblocks.io/txns/4MeYcugH9CFAFK6uMfoPYTLwxbHVxpMAThKFHmQZw9F5) — owner +0.05 NEAR.
- Plain transfer: [8b1Eg8ywa4WppJXbhs2vDmYs7DQHTyHWDx18q34uMynL](https://testnet.nearblocks.io/txns/8b1Eg8ywa4WppJXbhs2vDmYs7DQHTyHWDx18q34uMynL).
- Permissionless sweep: [6gzGshrWX36baM6wBLZBTAnvA8tuGD3vyAWgTTTSZuNj](https://testnet.nearblocks.io/txns/6gzGshrWX36baM6wBLZBTAnvA8tuGD3vyAWgTTTSZuNj) — returns the whole free balance, not just the bribe, minus a storage reserve computed from `storage_usage * storage_byte_cost` plus a 0.5 NEAR margin. Owner +5.2227 NEAR; the agent kept 2.1859 NEAR for storage.
- Policy commit: [2tHwiQY9wRcFbLDyZf4h6kAWYWgUEhjUqKE483FchqFh](https://testnet.nearblocks.io/txns/2tHwiQY9wRcFbLDyZf4h6kAWYWgUEhjUqKE483FchqFh) — one-way; hash `2959b64a…`.

Every offer, quote, checkout and refusal in the arena is linked by hash in `artifacts/arena-testnet.json`:

| Offer | Role | Price | Delivery | Result |
|---|---|---|---|---|
| 26 | honest-a | 0.10 NEAR | 2d | **winner**; paid |
| 27 | honest-b | 0.11 NEAR | 1d | valid, ranked |
| 28 | crooked | 0.12 NEAR | 3d | valid, ranked; donated 0.05 NEAR |
| 30 | injector-valid | 0.105 NEAR | 2d | valid, ranked; refused as non-winner |
| 25 | expired | 0.09 NEAR | 1d | filtered: expired |
| 29 | injector | 2.00 NEAR | 30d | filtered: over the 1 NEAR cap |
| 31 | excluded | 0.07 NEAR | 1d | filtered: seller excluded |

Live verification against quote 2 (winner), and quote 3 plus the refusal tx:

```sh
node packages/verifier/verify.mjs --rpc https://rpc.testnet.fastnear.com \
  --offer-book offerbook3.lc-111206284835-owner.testnet --quote 2 \
  --tx Fj64Shdpa4GFkMpVTKQHvFk3hD1Smo2DoT2Hd5gphbKa --sender lc-111206284835-runner.testnet

node packages/verifier/verify.mjs --rpc https://rpc.testnet.fastnear.com \
  --offer-book offerbook3.lc-111206284835-owner.testnet --quote 3 \
  --tx 4HfakrGLYqYUAJ9bbboxk3FFMLCvZFRkSxX9k7UZhcTX --sender lc-111206284835-runner.testnet
```

Both print PASS, including `tx_outcome_matches_book`; the refusal run also checks that the failure names `NotWinner`. The verifier needs no wallet. `--rpc` is optional: without it, live verification and `npm run arena:testnet` try FastNEAR, then `rpc.testnet.near.org`, and print which provider answered.

## Agent baseline (honest label)

The arena's baseline is a **scripted naive agent, not an LLM**; the fixture includes its recorded transcript. The security claim does not depend on a model: the contract checks the quote, the hashes and the winner. An optional LLM adapter exists in `packages/agent/agent.mjs` but is **not used** in this build; see `docs/LLM-AGENT.md`. The demo says “scripted baseline — no LLM” on screen.

## Lock check (done on CP3)

After deploying, delete the deployer's full-access keys on OfferBook and CheckoutGate and publish the wasm hashes. The check is:

```sh
node packages/verifier/lock-check.mjs \
  --rpc https://rpc.testnet.fastnear.com \
  --contract offerbook3.lc-111206284835-owner.testnet \
  --expected-code-hash fb94e3eda80522d72f2ea37a9c33276b9997a83c5934b8790d40c0288fbe5f37
```

It prints the keys and the wasm hash and fails if a full-access key remains or the hash differs. The AgentAccount stays owner-controlled because the owner is the principal. See `scripts/deploy-testnet.sh` and `deployments.example.json`.

---

## Repository layout

```
contracts/shared/        types, scoring, Borsh hashing, golden tests
contracts/offer-book/    offer index, quote snapshot, winner
contracts/checkout-gate/ proof-gated payment
contracts/agent-account/ budget, scoped agent key, kickback forwarding
contracts/integration-tests/ near-workspaces sandbox flow
packages/verifier/       dependency-free Node best-scoring (lowest cost) verifier
packages/arena/          deterministic Bribe Arena
packages/web/            CP3 web UI (npm run ui)
scripts/                 UI server, testnet replay, deploy checklist
docs/                    threat model, demo, worklogs
fixtures/                committed quote/arena fixtures
artifacts/               CP3 testnet arena record (no secrets)
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
- **The 64-offer cap.** Above `MAX_OFFERS_PER_QUOTE = 64`, `create_quote` panics rather than truncating. One live offer per (seller, item) blocks the trivial single-account DoS, but a griefer with many accounts can still fill the cap and make an item unquotable. A refundable storage deposit is not implemented.
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
- **The TEE private brief is not implemented.** No NEAR AI Cloud or OutLayer path ships in this build; the base claim does not require it.
- **Upgrade keys.** If the deployer can upgrade the contracts, it can change the rules. The README names the key and the mitigation.
- **RPC is external.** Testnet and the RPC are dependencies; a recorded artifact is a recording, not a live run.
- **1Click is not implemented.** No quote or panel is shown; cut at CP3.
- **The testnet flow is verified; these are not.** The CP3 arena is replayed on testnet in `artifacts/arena-testnet.json`. 1Click, the TEE brief and agent key rotation are not implemented. F5's one-live-offer half is done; the refundable storage deposit is not. The build is not byte-reproducible (C12 is ATTESTED).
- **The merchants are owner-created subaccounts.** They have distinct accounts and keys, and the winner is not the owner, but they are demo actors created and funded by the owner. The faucet rate-limited top-level creation.
- **Deploy and deposit tx hashes are not recorded.** The CP3 deploy script captured them only in memory. The code hashes, zero-key state, policy commit and every arena tx are recorded.
- **Extra offers from failed attempts remain.** Offers for `gpu-hour`, `gpu-hour-cp3` and `gpu-hour-cp3-final` are on testnet but not in the `gpu-hour-cp3-final3` quote. The contract has no retire method.
- **The baseline is scripted, not an LLM.** The UI and README label it; the security claim does not depend on a model.

The full matrix, with attack ids and test names, is in `docs/THREAT_MODEL.md`.

---

## Companion project

**Pinned** is the second project: a generation-pinned payment router for rentable names, in `../pinned/` (separate repository). It has its own README, claims ledger and testnet evidence.

## License

MIT. See `LICENSE`.
