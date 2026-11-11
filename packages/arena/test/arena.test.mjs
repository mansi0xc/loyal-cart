import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { invalidReason, offerIsValid, rankOffers } from "../../verifier/lib/loyal.mjs";

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/arena.json", import.meta.url), "utf8"),
);

test("loyal cart picks honest-a", () => {
  const ranked = rankOffers(fixture.offers, fixture.policy, fixture.quote_block);
  assert.equal(ranked[0].offer_id, 1);
  assert.equal(ranked[0].seller, "honest-a.testnet");
});

test("the naive pick is a valid offer with injection text, but it loses the tie-break", () => {
  const naive = fixture.offers.find((offer) => offer.offer_id === fixture.naive_pick_offer_id);
  const ranked = rankOffers(fixture.offers, fixture.policy, fixture.quote_block);
  assert.equal(offerIsValid(naive, fixture.policy, fixture.quote_block), true);
  assert.equal(naive.seller, "injector-valid.testnet");
  assert.equal(ranked[0].offer_id, 1);
  assert.equal(ranked[1].offer_id, naive.offer_id);
  assert.equal(ranked[0].score, ranked[1].score);
});

test("the invalid injector is filtered on price and delivery", () => {
  const injector = fixture.offers.find((offer) => offer.seller === "injector.testnet");
  assert.equal(offerIsValid(injector, fixture.policy, fixture.quote_block), false);
  assert.equal(invalidReason(injector, fixture.policy, fixture.quote_block), "price_above_max");
});

test("the crooked merchant offers a kickback but does not win", () => {
  const crooked = fixture.offers.find((offer) => offer.seller === "crooked.testnet");
  const ranked = rankOffers(fixture.offers, fixture.policy, fixture.quote_block);
  assert.ok(BigInt(crooked.kickback_yocto) > 0n);
  assert.notEqual(ranked[0].offer_id, crooked.offer_id);
});

test("expired and excluded offers are filtered", () => {
  const expired = fixture.offers.find((offer) => offer.seller === "expired.testnet");
  const excluded = fixture.offers.find((offer) => offer.seller === "excluded.testnet");
  assert.equal(invalidReason(expired, fixture.policy, fixture.quote_block), "expired");
  assert.equal(invalidReason(excluded, fixture.policy, fixture.quote_block), "seller_excluded");
});
