import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NEAR_YOCTO,
  formatNear,
  offerHash,
  policyHash,
  rankOffers,
  verifyQuote,
} from "../lib/loyal.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/arena.json", import.meta.url), "utf8"),
);

test("policy hash matches the Rust golden vector", () => {
  assert.equal(policyHash(fixture.policy), "ed2e9ddcd3c347d3221ece97651c297c6173f1618ee57db8276a284d93db77f5");
});

test("verifier accepts the committed quote fixture", () => {
  const result = verifyQuote(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.winner.offer_id, 1);
  assert.equal(result.checkoutAllowed, true);
});

test("a valid injected offer ties but loses on the lower offer id", () => {
  const result = verifyQuote(fixture);
  const injected = result.ranked.find((entry) => entry.offer_id === 7);
  assert.ok(injected);
  assert.equal(injected.score, result.ranked[0].score);
  assert.equal(result.ranked[0].offer_id, 1);
});

test("verifier rejects a non-winner checkout", () => {
  const bad = {
    ...fixture,
    chosen_offer_id: 3,
    checkout_allowed: true,
  };
  const result = verifyQuote(bad);
  assert.equal(result.ok, false);
  const gate = result.checks.find((check) => check.name === "checkout_gate");
  assert.equal(gate.ok, false);
  assert.match(gate.detail, /NotWinner/);
});

test("filtered offers are the injected, expired and excluded ones", () => {
  const result = verifyQuote(fixture);
  const reasons = new Map(result.filtered.map((entry) => [entry.offer_id, entry.reason]));
  assert.equal(reasons.get(4), "price_above_max");
  assert.equal(reasons.get(5), "expired");
  assert.equal(reasons.get(6), "seller_excluded");
});

test("offer hash changes when a field is tampered", () => {
  const original = fixture.offers[0];
  const tampered = { ...original, price: "99999999999999999999999999" };
  assert.notEqual(offerHash(original), offerHash(tampered));
});

test("tie-break uses the lower price when scores are equal", () => {
  const policy = {
    price_weight: 1,
    delivery_weight: 1000,
    reputation_weight: 0,
    max_price: (100n * NEAR_YOCTO).toString(),
    min_delivery_days: 0,
    excluded_sellers: [],
  };
  const base = {
    item_id: "gpu-hour",
    seller: "a.testnet",
    expires_at_block: 5000,
    metadata_hash: "00".repeat(32),
    sales: 0,
  };
  const offers = [
    { ...base, offer_id: 1, seller: "a.testnet", price: (10n * NEAR_YOCTO).toString(), delivery_days: 0 },
    { ...base, offer_id: 2, seller: "b.testnet", price: (5n * NEAR_YOCTO).toString(), delivery_days: 5 },
  ];
  const ranked = rankOffers(offers, policy, 1000);
  assert.equal(ranked.length, 2);
  assert.equal(ranked[0].score, ranked[1].score);
  assert.equal(ranked[0].offer_id, 2);
});

test("formatNear prints two decimals", () => {
  assert.equal(formatNear(10n * NEAR_YOCTO), "10.00");
  assert.equal(formatNear(11n * NEAR_YOCTO), "11.00");
});
