# LLM agent plan (CP3, optional)

**At CP2 the arena baseline is scripted, not an LLM.** The fixture says so (`naive_agent.kind = "scripted"`, `model = "none"`, with a recorded transcript). The arena prints "scripted naive agent (no LLM; recorded baseline)". Do not describe it as a live model.

## Why the security claim does not depend on the LLM

The payment contract checks the quote, the policy hash, the offer hash and the winner. It does not know or care whether an LLM, a script or a human proposed the offer. The LLM is a user-interface convenience and an attack surface, not the enforcement.

## CP3 optional adapter

`packages/agent/agent.mjs` exposes:

- `loadRecordedProposal(fixture)` — the current screener path; reads `fixture.naive_agent.proposed_offer_id`.
- `proposeWithLLM({ brief, offers, apiKey, baseUrl, model })` — an optional OpenAI-compatible call. It returns `{ offer_id, reason }`. It is not used by `npm run arena`.

A real CP3 demo could run the same model twice:

1. **Brief → policy.** The model turns the user's plain-language brief into a `Policy`. The user reviews and commits the hash. The model never commits for the user.
2. **Offers → proposal.** The model reads the fixed-field offers and proposes an offer id.
3. **Naive path.** Execute the proposal directly (the scripted or LLM pick); it can be steered by listing text or a kickback.
4. **Loyal path.** Route the same proposal through the quote and gate. A non-winner is refused; the bribe cannot change the winner.

The screener path uses a committed transcript labelled "recorded LLM output, <model>, <date>" so it needs no API key. The live path is optional and labelled.

## Truthfulness rules

- The video and README must say "scripted baseline" for the current fixture, and "recorded LLM output" for any recorded model run.
- Do not claim "the agent is an LLM" unless a model actually ran and the transcript is committed.
- The model's output is never trusted for payment; only the contract's checks are.
