import { createHash } from "node:crypto";

export const NEAR_YOCTO = 10n ** 24n;
export const PRICE_UNIT_YOCTO = 10n ** 18n;
export const PRICE_SCORE_UNIT_YOCTO = 10n ** 21n;
export const REPUTATION_CAP = 100n;

const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(Number(n));
  return b;
};

const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(Number(n));
  return b;
};

const u64 = (n) => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

const u128 = (n) => {
  const v = BigInt(n);
  const b = Buffer.alloc(16);
  b.writeBigUInt64LE(v & 0xffffffffffffffffn, 0);
  b.writeBigUInt64LE(v >> 64n, 8);
  return b;
};

const str = (s) => {
  const b = Buffer.from(s, "utf8");
  return Buffer.concat([u32(b.length), b]);
};

const vecStr = (arr) => Buffer.concat([u32(arr.length), ...arr.map(str)]);

export const borshPolicy = (policy) =>
  Buffer.concat([
    u32(policy.price_weight),
    u32(policy.delivery_weight),
    u32(policy.reputation_weight),
    u128(policy.max_price),
    u16(policy.min_delivery_days),
    vecStr(policy.excluded_sellers),
  ]);

const metadataBytes = (value) =>
  Array.isArray(value) ? Buffer.from(value) : Buffer.from(value, "hex");

export const borshOffer = (offer) =>
  Buffer.concat([
    u64(offer.offer_id),
    str(offer.item_id),
    str(offer.seller),
    u128(offer.price),
    u16(offer.delivery_days),
    u64(offer.expires_at_block),
    metadataBytes(offer.metadata_hash),
  ]);

export const sha256Hex = (buf) => createHash("sha256").update(buf).digest("hex");

export const normalizeHash = (value) =>
  Array.isArray(value) ? Buffer.from(value).toString("hex") : String(value).replace(/^0x/i, "").toLowerCase();

export const policyHash = (policy) => sha256Hex(borshPolicy(policy));
export const offerHash = (offer) => sha256Hex(borshOffer(offer));

export const offerIsValid = (offer, policy, quoteBlock) => {
  const price = BigInt(offer.price);
  const maxPrice = BigInt(policy.max_price);
  return (
    Number(offer.expires_at_block) > Number(quoteBlock) &&
    price <= maxPrice &&
    Number(offer.delivery_days) >= Number(policy.min_delivery_days) &&
    !policy.excluded_sellers.includes(offer.seller)
  );
};

export const invalidReason = (offer, policy, quoteBlock) => {
  if (Number(offer.expires_at_block) <= Number(quoteBlock)) return "expired";
  if (BigInt(offer.price) > BigInt(policy.max_price)) return "price_above_max";
  if (Number(offer.delivery_days) < Number(policy.min_delivery_days)) return "delivery_below_min";
  if (policy.excluded_sellers.includes(offer.seller)) return "seller_excluded";
  return null;
};

export const score = (offer, policy, sales) => {
  const priceUnits = BigInt(offer.price) / PRICE_SCORE_UNIT_YOCTO;
  const priceTerm = BigInt(policy.price_weight) * priceUnits;
  const deliveryTerm = BigInt(policy.delivery_weight) * BigInt(offer.delivery_days);
  const capped = BigInt(Math.min(Number(sales), Number(REPUTATION_CAP)));
  const reputationTerm = BigInt(policy.reputation_weight) * (REPUTATION_CAP - capped);
  return priceTerm + deliveryTerm + reputationTerm;
};

export const rankOffers = (offers, policy, quoteBlock) => {
  const ranked = offers
    .filter((offer) => offerIsValid(offer, policy, quoteBlock))
    .map((offer) => ({
      offer_id: offer.offer_id,
      seller: offer.seller,
      score: score(offer, policy, offer.sales ?? 0),
      price: BigInt(offer.price),
      delivery_days: Number(offer.delivery_days),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score < b.score ? -1 : 1;
      if (a.price !== b.price) return a.price < b.price ? -1 : 1;
      if (a.delivery_days !== b.delivery_days) return a.delivery_days - b.delivery_days;
      return a.offer_id - b.offer_id;
    });
  return ranked;
};

export const verifyQuote = (fixture) => {
  const checks = [];
  const actualPolicyHash = policyHash(fixture.policy);
  checks.push({
    name: "policy_hash",
    ok: actualPolicyHash === fixture.policy_hash,
    detail: `expected ${fixture.policy_hash}, got ${actualPolicyHash}`,
  });

  const ranked = rankOffers(fixture.offers, fixture.policy, fixture.quote_block);
  const winner = ranked[0] ?? null;
  checks.push({
    name: "winner_is_best_scoring",
    ok: winner !== null && winner.offer_id === fixture.winner_offer_id,
    detail: winner === null
      ? "no valid offers"
      : `expected ${fixture.winner_offer_id}, got ${winner.offer_id}`,
  });

  if (Array.isArray(fixture.offer_hashes) && fixture.offer_hashes.length > 0) {
    const hashesMatch =
      fixture.offers.length === fixture.offer_hashes.length &&
      fixture.offers.every(
        (offer, index) => offerHash(offer) === normalizeHash(fixture.offer_hashes[index]),
      );
    checks.push({
      name: "offer_hashes_match",
      ok: hashesMatch,
      detail: hashesMatch
        ? "all offers match the quote commitments"
        : "a committed offer changed",
    });
  }

  const chosen = fixture.offers.find((offer) => offer.offer_id === fixture.chosen_offer_id) ?? null;
  const chosenValid = chosen !== null && offerIsValid(chosen, fixture.policy, fixture.quote_block);
  checks.push({
    name: "chosen_offer_valid",
    ok: chosenValid,
    detail: chosen === null
      ? "chosen offer not found"
      : chosenValid
        ? "valid"
        : `invalid: ${invalidReason(chosen, fixture.policy, fixture.quote_block)}`,
  });

  const checkoutAllowed = chosenValid && winner !== null && chosen.offer_id === winner.offer_id;
  checks.push({
    name: "checkout_gate",
    ok: checkoutAllowed === (fixture.checkout_allowed ?? true),
    detail: checkoutAllowed
      ? "allowed (chosen == winner)"
      : `refused (${chosen && winner ? "NotWinner" : "no valid quote"})`,
  });

  const filtered = fixture.offers
    .map((offer) => ({
      offer_id: offer.offer_id,
      reason: invalidReason(offer, fixture.policy, fixture.quote_block),
    }))
    .filter((entry) => entry.reason !== null);

  return {
    ok: checks.every((check) => check.ok),
    checks,
    ranked,
    filtered,
    winner,
    checkoutAllowed,
  };
};

export const formatNear = (yocto) => {
  const milli = BigInt(yocto) / 10n ** 21n;
  return (Number(milli) / 1000).toFixed(2);
};
