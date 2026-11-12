import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rankOffers as verifierRank } from "../lib/loyal.mjs";
import { rankOffers as webRank } from "../../web/rank.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const fixture = read("../../../fixtures/arena.json");
const testnet = read("../../../artifacts/arena-testnet.json");

const ids = (ranked) => ranked.map((entry) => [entry.offer_id, entry.score]);

test("web page ranker matches the verifier ranker (fixture)", () => {
  assert.deepEqual(
    ids(webRank(fixture.offers, fixture.policy, fixture.quote_block)),
    ids(verifierRank(fixture.offers, fixture.policy, fixture.quote_block)),
  );
});

test("web page ranker matches the verifier ranker (testnet offers, random prices)", () => {
  const quoteBlock = testnet.quote_txs.find((q) => q.quote_id === testnet.quote_winner.quote_id).event.data
    .quote_block;
  const base = Object.values(testnet.offers);
  let state = 0x9e3779b9;
  const next = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  for (let round = 0; round < 64; round += 1) {
    const offers = base.map((offer) => ({
      ...offer,
      price: (BigInt(Math.floor(next() * 300)) * 10n ** 21n).toString(),
      delivery_days: 1 + Math.floor(next() * 5),
    }));
    assert.deepEqual(
      ids(webRank(offers, testnet.policy, quoteBlock)),
      ids(verifierRank(offers, testnet.policy, quoteBlock)),
    );
  }
});
