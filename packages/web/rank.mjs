// Browser copy of the ranking rule in packages/verifier/lib/loyal.mjs (which imports node:crypto
// and so cannot load in a browser). packages/verifier/test/web-ranker.test.mjs asserts that the two
// give identical rankings, so the page can't drift from the verifier.

const PRICE_SCORE_UNIT_YOCTO = 10n ** 21n;
const REPUTATION_CAP = 100n;

export const invalidReason = (offer, policy, quoteBlock) => {
  if (Number(offer.expires_at_block) <= Number(quoteBlock)) return "expired";
  if (BigInt(offer.price) > BigInt(policy.max_price)) return "price_above_max";
  if (Number(offer.delivery_days) < Number(policy.min_delivery_days)) return "delivery_below_min";
  if (policy.excluded_sellers.includes(offer.seller)) return "seller_excluded";
  return null;
};

export const scoreTerms = (offer, policy, sales = 0) => {
  const price = BigInt(policy.price_weight) * (BigInt(offer.price) / PRICE_SCORE_UNIT_YOCTO);
  const delivery = BigInt(policy.delivery_weight) * BigInt(offer.delivery_days);
  const capped = BigInt(Math.min(Number(sales), Number(REPUTATION_CAP)));
  const reputation = BigInt(policy.reputation_weight) * (REPUTATION_CAP - capped);
  return { price, delivery, reputation, total: price + delivery + reputation };
};

export const rankOffers = (offers, policy, quoteBlock) =>
  offers
    .filter((offer) => invalidReason(offer, policy, quoteBlock) === null)
    .map((offer) => ({
      offer_id: offer.offer_id,
      seller: offer.seller,
      score: scoreTerms(offer, policy, offer.sales ?? 0).total,
      price: BigInt(offer.price),
      delivery_days: Number(offer.delivery_days),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score < b.score ? -1 : 1;
      if (a.price !== b.price) return a.price < b.price ? -1 : 1;
      if (a.delivery_days !== b.delivery_days) return a.delivery_days - b.delivery_days;
      return a.offer_id - b.offer_id;
    });
