# A2 — demo work log

**Did.** Wrote `docs/DEMO.md`: 120-second storyboard with timestamped beats, verbatim narration (232 words, 116 wpm), shots S0–S7, label kit L1–L9, the 20-second moment described to the receipt, a runbook with pre-flight assertions P0–P12 and placeholders, a recording gate bound to `CLAIMS.md`, an X post (272 characters), a submission `idea` draft (1,846 characters), a three-tier testnet fallback, and a recording checklist.

**Verified by running it (repo skeleton landed during the task).** `npm run arena` prints the six-offer table, `naive agent: picked #4 injector.testnet (invalid: price_above_max)`, `winner: #1 honest-a.testnet`, three `[PASS]` attacks, a built-in "kickback forwarding is SIMULATED in this fixture" note, and `OVERALL: PASS (fixture)`. `npm run verify` prints `OVERALL: PASS — the quote is valid and the chosen offer is the argmax.` and exits 0, over `fixtures/arena.json`. `npm test` passes 11 Node tests. I quoted those lines rather than paraphrasing them, and corrected the storyboard after reading the fixture: three offers are invalid, not two.

**Not verified.** No contract behaviour: `contracts/*` expose only `new`/`ping`/`version`. `scripts/e2e-testnet.sh` is a stub that prints and exits 0 without sending anything, so P1 now asserts on content, not exit code. `fixtures/quote.json` and `fixtures/policy.json` do not exist; `make verify` currently points at `fixtures/arena.json`. No testnet deployment.

**Assumed.** The six fixture sellers can be registered by the team or regenerated under `<team>-` prefixes; `e2e-testnet.sh` will grow `--print`/`--step`/`--spare` plus `artifacts/txs.json`; CP2 can export the testnet quote in the verifier's `--fixture` shape.

**Open questions.** DEMO.md §10: the storyboard delta from SPEC §8; whether `execute_purchase` attaches an exact deposit (decides `NotWinner` vs `WrongPayment`); the quote-fixture export; 1Click in or out; committing `artifacts/`.

**Files written.** `docs/DEMO.md`, `docs/worklogs/a2-demo.md`. Nothing else touched.
