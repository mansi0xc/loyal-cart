# A3 — related work & claims audit — work log

**Date:** 2026-11-12 · **Files written:** `docs/RELATED-WORK.md`, `docs/CLAIMS-REVIEW.md`, this log.
No other file touched; `CLAIMS.md` left unedited for the lead to integrate.

## Did

- Read SPEC, README, CLAIMS, the Whose Side red team, deepseek 02 §4.3 and 01 §3.
- Read the prior art **at source** rather than trusting the internal summaries: 11 systems, 1 arXiv
  paper, 1 ACM paper.
- Audited all 16 CLAIMS rows: verdict, severity and an exact rewrite for each, plus 5 systemic findings.

## Verified (read at source, 2026-11-12)

- **NorthCinder** — github.com/cinderline/northcinder, README + `docs/RANKING.md`. Its own spec concedes
  that client verification covers "the inputs the service disclosed", not offer-set honesty.
- **CheckMate** — github.com/HadiaIshtiaqq/CheckMate. Signatures are HMAC with an operator-held key.
- **A-VIP** — arxiv.org/abs/2609.11757. Abstract confirms the transaction-vs-decision gap and the
  90 / 56 / 73.3% attack rates.
- **nearcarta, Flock, CartelBreaker, AP2, Mastercard Verifiable Intent, Visa TAP, MEV Blocker** — all read.
- **Gebele et al., DeFi '25** — doi.org/10.1145/3733815.3764043. Enclave computes the argmax over a
  committed bid set and the chain enforces settlement. Strongest mechanism-level precedent found.

## Assumed

- `post_offer` is permissionless — SPEC §6.1 sets no allowlist.
- "Committed scoring" is intended as auditability, not pre-commitment. C02 shows it is same-transaction.
- Facts in the internal docs about projects I could not open are marked **[unverified]** and not repeated.

## Open questions

1. Does the lead want a separate `commit_policy` call, or accept same-transaction hashing? C13's wording
   depends on the answer.
2. Is "first" worth defending? Recommendation: drop it and add it to the banned-words list.
3. Does the arena fixture get a valid-but-injecting offer? C09 is vacuous as specified without one.
