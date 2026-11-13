# History

The README previously carried the CP3 accounts and transactions. They are superseded by demo3; the full record remains in `../deepseek_mds/build/CP3-report.md`. The old section is kept here only for audit.

## Live testnet (CP3, historical)

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

