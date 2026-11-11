# A1 — Threat model work log

**Date:** 2026-11-12 · **Scope:** `docs/THREAT_MODEL.md` only.

## What I did
Wrote `docs/THREAT_MODEL.md` (CP1): a precise claim statement (C-SEC) with six explicit non-claims; a 13-actor trust table graded T/V/X; a 26-row attack/defense matrix (the 18 required rows + 8 added); README-ready "What this does not stop" (20 items, 8 flagged NEW); a test plan mapping every refusal to a named placeholder test, plus gap tests, plus an explicit local-vs-testnet split; Haseeb/Eddy/Mert objections answered by conceding first; 11 open questions with "what would change my mind"; Appendix A, nine defects found by reading the spec **and** the code.

## Verified
Only facts that can be read in the repo today:
- `contracts/shared/src/lib.rs` is real; the three contract crates are 44-line stubs (`ping`/`version`), so gate/agent rows describe intent, not behaviour.
- `active` is a hashed field (`:27`, `:94`) → A02 and AS2 confirmed.
- `Offer` has no `posted_at_block` (`:19-28`) → A08 and AS3 confirmed.
- **SPEC §5 and the code disagree**: 1e18 vs 1e21 price unit, `REPUTATION_CAP` 1 000 000 vs 100. The JS verifier sides with the code, so both implementations disagree with the only public spec → A8, Q11.
- `print_policy_hash_golden_vector` asserts `len == 32`, not a value; CLAIMS C02 cites a golden vector that does not exist → A9.
- `invalid_offers_are_filtered_out` omits under-delivery and `active == false`.

No tx, no test run, no measurement, no fabricated evidence.

## Assumed (AS1–AS6)
No foreign full-access key on the agent account; NEAR-only payments; atomic deploy+init; finite agent-key allowance; and "buyer with 3–10 suppliers" as an acceptable realworld framing.

## Open questions
Q11 (scoring constants) and Q1 (`active` in the hash) block CP2. Then Q2, Q3, Q4, Q5, Q7.

## Files written
- `docs/THREAT_MODEL.md`
- `docs/worklogs/a1-threat-model.md`
