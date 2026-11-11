# Loyal Cart

**Status: CP1 spec freeze. Contracts are stubs; no testnet deployment yet.** The claims ledger (`CLAIMS.md`) marks every system claim PLANNED until it is verified. The fixture verifier and arena already run (see Quickstart); nothing here is evidence of a live deployment.

A shopping agent whose checkout cannot pay a non-winner. The checkout forwards the buyer's funds to the seller only if the offer being bought is the best in a public on-chain offer book under the user's committed scoring. Any on-chain transfer to the agent is forwarded to the user. Off-chain bribes to the agent's operator are out of scope.

The honest claim ladder (only use the highest rung whose ledger rows are VERIFIED/ATTESTED):

> **L1 — mechanism.** "A testnet prototype in which the payment contract forwards the buyer's funds to the seller only if the offer being bought is the argmax of every valid offer in a public on-chain offer book, under the scoring policy committed in the quote — so a third party can recheck the choice from chain data alone, with no key and no hardware trust — and the agent's own account has no method that can pay the agent or a third party."
>
> **L3 — no originality claim.** "Prior systems publish a verifiable ranking (NorthCinder, by re-execution over disclosed inputs) or sign the purchase (CheckMate by operator HMAC; AP2 and Mastercard Verifiable Intent by an authorisation credential). Loyal Cart makes the ranking the payment condition: the contract refuses any purchase that is not the argmax of the on-chain offer book under the committed policy."

We do **not** claim "first", "world-first" or "trustless". The prior-art review found Gebele et al., *Sealed-Bid Auctions via TEE-Backed Confidential Compute Blockchains* (DeFi '25), which already gates settlement on an argmax over a committed set. Loyal Cart's delta is a public offer book plus a buyer-authored policy with no TEE.

Tracks: **swarms**, **realworld**, **open**.

---

## The problem

AI shopping agents are starting to spend real money. The agent's operator, the marketplace, or a seller can steer which offer it picks: paid placement, a kickback to the agent, or free-text in a listing that overrides the agent's instructions. The user has no way to check whose interest the agent served.

## What Loyal Cart will do

1. **On-chain offer book.** Merchants post fixed-field offers (item id, price, delivery days, seller, expiry, metadata hash). The on-chain struct has no free-text field; off-chain metadata may contain arbitrary text and is committed only by hash. The item id is a 1–64 char slug.
2. **User-committed scoring.** The owner commits a hash of the scoring policy (price / delivery / seller reputation weights, max price, exclusions) one-way before any quote; the agent account refuses a quote with a different hash.
3. **Quote snapshot.** The offer book snapshots every valid offer for the item from its own index, up to 64; above the cap it panics rather than truncating. The agent cannot pass an arbitrary list or swap the policy.
4. **Proof-gated checkout.** The checkout contract forwards the buyer's attached deposit to the seller only if the chosen offer is the quote's winner and the offer hash matches. Any other choice reverts.
5. **Forwarding account.** Any NEAR sent to the agent account through `donate` is forwarded to the owner; a plain transfer can be swept to the owner by anyone. The agent has no method that pays the agent or a third party. NEP-141 plain transfers are not forwarded (out of scope). The contract cannot see intent, so "kickback" is a label, not a proof.
6. **Bribe Arena.** A fixed-seed demo with honest and crooked merchants, a naive agent and Loyal Cart. It shows three attacks: a valid offer with identical fields and injection text loses on the tie-break; a 5 NEAR transfer is forwarded and the winner is unchanged; expired/excluded/over-price offers are filtered.

See `SPEC.md` for the interfaces, schemas, scoring, threat model, arena script and demo storyboard.

---

## Quickstart (CP1: fixture paths work; contracts are stubs)

These run on a clean clone with no wallet, no funds and no paid keys:

```sh
make test      # Rust workspace + Node verifier/arena tests
make verify    # dependency-free verifier on the committed quote fixture
make arena     # deterministic Bribe Arena fixture
```

The contracts are stubs at CP1; testnet deployment is CP2. The verifier and arena prove the shared scoring/hashing logic and the attack model, not a live deployment. Check `CLAIMS.md` for what is actually verified.

---

## Repository layout

```
contracts/shared/        types, scoring, Borsh hashing, golden tests
contracts/offer-book/    offer index, quote snapshot, winner
contracts/checkout-gate/ proof-gated payment
contracts/agent-account/ budget, scoped agent key, kickback forwarding
packages/verifier/       dependency-free Node argmax verifier
packages/arena/          deterministic Bribe Arena
packages/ui/             static demo UI (CP3)
docs/                    threat model, demo, worklogs
fixtures/                committed quote/arena fixtures
```

---

## Related work

- **NorthCinder** — "your shopping agent should work for you"; verifiable neutral ranking by re-execution over *disclosed* inputs, no chain. Its own docs concede that a dishonest service could curate the offer set and then rank honestly over it. Loyal Cart makes the offer set a public contract index and the ranking the payment condition, so the curated-set move cannot close a sale.
- **CheckMate** — deterministic policy engine, injection-resistant listings, signed purchase plan; the signatures are operator HMACs, so a third party cannot verify them without the operator's key. Loyal Cart's quote and winner are on chain, and the payment contract checks them.
- **arXiv 2609.11757 / A-VIP** — names the gap "signing the transaction but not the decision." Loyal Cart binds the decision (argmax under the committed policy) to settlement.
- **Gebele, Mutzel, Öz & Matthes, *Sealed-Bid Auctions via TEE-Backed Confidential Compute Blockchains* (DeFi '25, DOI 10.1145/3733815.3764043)** — already gates settlement on an argmax over a committed set. Loyal Cart differs by using a public offer book and a buyer-authored policy, with no TEE. This is why we do not claim "first."

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
- **Off-chain kickbacks to the operator/developer.** The contract catches transfers to the agent account, not a side payment to a human. Forwarding is fee capture for the user, not an anti-bribery mechanism.
- **The policy reveals the budget.** The committed policy is public in the quote, including `max_price`. The optional TEE brief exists only to hide it, and is not part of the security claim.
- **A full-access key on the agent account defeats forwarding.** A contract account with a full-access key can be deleted and its balance sent anywhere. `donate`/`sweep` only bind if no such key exists.
- **Kickback capture is NEAR-only.** A NEP-141 `ft_transfer` to a contract account does not call `ft_on_transfer`; a token plain transfer is not forwarded by `donate`.
- **The user's own key is the root of trust.** Whoever holds it can rewrite the policy, sweep the budget, or delete the agent account. No recovery, multisig or time lock in v0.1.
- **TEE trust, if the optional private brief is used.** NEAR AI Cloud or OutLayer plus a hardware vendor must be trusted. The base claim does not require it.
- **Upgrade keys.** If the deployer can upgrade the contracts, it can change the rules. The README names the key and the mitigation.
- **RPC and external services.** Testnet, the RPC and 1Click are external dependencies; a recorded artifact is a recording, not a live run.
- **1Click dry quotes.** The testnet demo shows a quote, not a mainnet execution.
- **Almost nothing is verified yet.** At CP1 the contracts are stubs; the only working code is the shared scoring/hashing and the fixture verifier/arena.

The full matrix, with attack ids and test names, is in `docs/THREAT_MODEL.md`.

---

## License

MIT. See `LICENSE`.
