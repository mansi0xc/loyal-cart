# `deploy-and-demo.mjs`

One re-runnable command for the final Loyal Cart run: fresh accounts, fresh contracts, the arena,
the named refusals, the artifacts, the evidence cache, and the keyless verifier — on NEAR testnet.

```sh
node scripts/deploy-and-demo.mjs --run-id final --dry-run   # plan + funding preflight, sends nothing
node scripts/deploy-and-demo.mjs --run-id final             # the real run
npm run deploy-and-demo -- --run-id final                   # same, via npm
```

The script has **no npm dependencies**: base58, borsh and ed25519 signing are implemented on
`node:crypto` and the RPC is plain `fetch`. `near-api-js` is not needed and nothing has to be
installed (`npm install` is not part of the flow).

## Prerequisites

- **Node >= 20** (`node --test`, `fetch`, `node:crypto` ed25519).
- **Rust + the wasm target** for `cargo build --workspace --target wasm32-unknown-unknown --release`
  (`rustup target add wasm32-unknown-unknown`). Use `--skip-build` to reuse an existing build.
- **A funded testnet parent account and its full-access key**, in a keys file:
  - default `.keys/deploy.json` (gitignored), or `DEPLOY_KEYS`, or `--keys <path-or-json>`;
  - minimum shape:

    ```json
    { "parent": { "accountId": "my-funder.testnet", "secretKey": "ed25519:..." } }
    ```

  - a `pinned3-keys.json`-style file (`accounts` + `keys.funder`) is accepted as-is; the script
    picks `parent` → `funder` → `keys.*` → top-level, and extends the file in place with a
    `runs.<run-id>` block holding every key it generates;
  - if no file exists and `.env` has `OWNER_ACCOUNT` + `NEAR_PRIVATE_KEY`, the script bootstraps
    `.keys/deploy.json` from `.env`;
  - the file is written atomically with mode **0600** (the directory with 0700) and is never printed.
- **~13 NEAR** on the parent: 12.4 NEAR of subaccount funding plus a gas margin. A testnet faucet
  (`https://helper.testnet.near.org/account`) funds a new account with 10 NEAR, so two faucet
  accounts are enough. If the parent is short, step 1 fails with the exact numbers before any
  transaction is sent; nothing is faked.

## Flags

| flag | meaning |
|---|---|
| `--run-id <id>` | run label (default: a timestamp). Scopes every account (`<role>.<run-id>.<parent>`), the item id (`gpu-hour-<run-id>`) and the refusal item. Run ids are never reused. |
| `--keys <value>` | path to the keys file, or inline JSON (written back to `.keys/deploy.json` if inline). Env: `DEPLOY_KEYS`. |
| `--rpc <url>` | RPC endpoint (default `https://rpc.testnet.fastnear.com`). |
| `--dry-run` | print the full step plan, the funding plan and a read-only preflight (parent balance, key permission, whether the new accounts are free). Sends nothing, writes nothing. |
| `--skip-build` | reuse `target/wasm32-unknown-unknown/release/*.wasm`. |
| `--help` | usage. |

## What it does (57 steps, one printed line each)

1. read the keys file; check the parent account, that its key is full-access, that the parent can
   pay for the run, and that the gas price leaves every signer enough for its prepaid gas;
2. `cargo build --workspace --target wasm32-unknown-unknown --release`; hash the three wasm files;
3. create the run account and fresh subaccounts for **owner, offerbook, checkout, agent, runner,
   honest-a, injector-valid, crooked** — each key is generated, saved to the keys file (0600) and
   only then used;
4. deploy **OfferBook** (+ `new`, + `set_checkout_gate`), **CheckoutGate** (+ `new`),
   **AgentAccount** (+ `new`), add the owner's full-access key to the agent account, delete the
   agent deployer key, delete the OfferBook and CheckoutGate deployer keys (both end with **0 keys**),
   add the runner's function-call key scoped to `execute_purchase` with a 0.25 NEAR allowance, and
   deposit 0.5 NEAR into the agent account;
5. commit the policy hash, post the three offers on `gpu-hour-<run-id>` (honest 0.10, injector-valid
   0.105, crooked 0.12), create quote #1 and execute the winner, create quote #2 and execute a
   non-winner (the gate refuses with `NotWinner`), then `donate`, a plain transfer and a
   permissionless `sweep`;
6. run the named refusals that only need the contracts from this run: `InvalidItemId`,
   `InvalidPrice`, `InvalidDelivery`, `ExpiryTooSoon`, a valid-offer control, `OfferAlreadyLive`,
   `PolicyHashMismatch`, `InvalidPolicy`, `InvalidTtl`, `NoValidOffers`, `NotBuyer`, `QuoteNotFound`,
   `OnlyAgent`, `AlreadyPurchased` — plus the `NotWinner` and winner-checkout rows from step 5;
7. read the access-key lists back and assert the lock state;
8. write `artifacts/arena-testnet.json`, `fixtures/arena.json` and `artifacts/refusals.json`, run
   `scripts/evidence-cache.mjs` (→ `evidence/tx-cache.json`), run the keyless verifier on the new
   quote, and record the verifier result in the artifact.

Every action prints a plain-English line with its transaction hash and explorer link:

```
[31/57] execute the winner purchase (runner → agent → gate pays the seller) … offer #1 paid 0.100 NEAR to honest-a.demo3.…  tx 5Kd…  https://testnet.nearblocks.io/txns/5Kd…
```

and the run ends with:

```
PASS 57/57 steps in 214.3s
  refusals: 16/16 matched (artifacts/refusals.json)
  verifier: PASS 9/9 (keyless, on quote #1)
```

## What it writes

| file | contents |
|---|---|
| `artifacts/arena-testnet.json` | the whole run: accounts, wasm/code hashes, a tx hash per action, policy + committed hash + commit event, the three offers, both quotes, the purchase, the refusal failure, the donate/transfer/sweep deltas, the access-key lists, the lock check, the refusal summary, the verifier result. Every field the page reads is kept (and the shape `packages/verifier/test/web-ranker.test.mjs` reads). |
| `artifacts/refusals.json` | one row per refusal: label, expected error, tx hash, actual error, matched. |
| `fixtures/arena.json` | the committed sandbox demo (`offers`, `policy`, `naive_agent`, `attacks`) is kept — `npm test`, `npm run verify` and `packages/arena` read it — and a `live` block records this run: item, quote, policy, accounts, and the three offers with listing text. |
| `evidence/tx-cache.json` | every tx in the artifact, fetched by `scripts/evidence-cache.mjs`, for the keyless verifier. |
| `.keys/deploy.json` | the parent key plus a `runs.<run-id>` block with every generated key, mode 0600. Gitignored; never printed; never committed. |

## Failure behaviour

- The run stops at the failing step and prints exactly which one:

  ```
  FAILED at [31/57] execute the winner purchase (runner → agent → gate pays the seller)
    reason: …
    keys file kept: /…/.keys/deploy.json (mode 600) — every key generated before this point is saved there
    artifacts: not written
  ```

- The keys file is kept and updated with `status: "failed"` and the failed step, so nothing is lost.
- No secret is ever printed: error text is redacted (`ed25519:<redacted>`), and only account ids, tx
  hashes and amounts appear in the output.
- A run id already present in the keys file is refused, so a failed or finished run cannot be
  silently overwritten. Re-run with a new `--run-id` to get a completely fresh set of accounts,
  contracts, offers and quotes.

## Notes and limits

- `npm run arena:testnet` (`scripts/testnet/replay.mjs`) replays the **committed artifact shape**
  (7 offers, quotes 2/3). It is not the verifier for a 3-offer run; the keyless check for this run is
  the verifier step at the end of the script (and the `verification` block it records).
- `sweep()` only moves funds when the agent account holds more than its storage reserve
  (`storage_usage × 10^19 yocto` + 0.5 NEAR). With the default 4 NEAR funding for the agent account
  it does; the step line reports the swept amount either way.
- Everything here is testnet. The run proves the mechanism on testnet; it is not a mainnet
  deployment and not a reproducible-build claim.
