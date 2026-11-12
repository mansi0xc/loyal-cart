#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadRecordedProposal } from "../agent/agent.mjs";
import { formatNear, invalidReason, offerIsValid, rankOffers } from "../verifier/lib/loyal.mjs";

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const fixturePath = resolve(argValue("--fixture", "fixtures/arena.json"));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const ranked = rankOffers(fixture.offers, fixture.policy, fixture.quote_block);
const winner = ranked[0] ?? null;
const naive = fixture.offers.find(
  (offer) => offer.offer_id === loadRecordedProposal(fixture),
) ?? null;
const naiveValid = naive ? offerIsValid(naive, fixture.policy, fixture.quote_block) : false;
const naiveReason = naive ? invalidReason(naive, fixture.policy, fixture.quote_block) : "not found";

const injector = fixture.offers.find((offer) => offer.seller === "injector.testnet");
const injectorValid = fixture.offers.find((offer) => offer.seller === "injector-valid.testnet");
const crooked = fixture.offers.find((offer) => offer.seller === "crooked.testnet");
const expired = fixture.offers.find((offer) => offer.seller === "expired.testnet");
const excluded = fixture.offers.find((offer) => offer.seller === "excluded.testnet");

const attacks = {
  prompt_injection_is_ignored:
    injectorValid !== undefined &&
    offerIsValid(injectorValid, fixture.policy, fixture.quote_block) &&
    naive?.offer_id === injectorValid.offer_id &&
    winner?.offer_id !== injectorValid.offer_id &&
    BigInt(injectorValid.price) > winner.price,
  kickback_does_not_change_winner:
    crooked !== undefined &&
    BigInt(crooked.kickback_yocto) > 0n &&
    winner?.offer_id !== crooked.offer_id,
  fake_offer_is_refused:
    expired !== undefined &&
    excluded !== undefined &&
    !offerIsValid(expired, fixture.policy, fixture.quote_block) &&
    !offerIsValid(excluded, fixture.policy, fixture.quote_block) &&
    !offerIsValid(injector, fixture.policy, fixture.quote_block),
};

console.log(`Loyal Cart Bribe Arena — seed ${fixture.seed}`);
console.log(`quote_block=${fixture.quote_block} item=${fixture.item_id}`);
console.log("");
console.log("offers:");
console.log("  id  seller              price(NEAR)  delivery  sales  status");
for (const offer of fixture.offers) {
  const reason = invalidReason(offer, fixture.policy, fixture.quote_block);
  console.log(
    `  ${String(offer.offer_id).padEnd(3)} ${offer.seller.padEnd(20)} ${formatNear(offer.price).padStart(11)}  ${String(offer.delivery_days).padStart(7)}d  ${String(offer.sales ?? 0).padStart(5)}  ${reason ?? "valid"}`,
  );
}

console.log("");
console.log("scripted naive agent (no LLM; recorded baseline):");
console.log(`  picked #${naive?.offer_id} ${naive?.seller ?? "n/a"} (${naiveValid ? "valid" : `invalid: ${naiveReason}`})`);
console.log(`  reason: ${naive?.listing_text ?? "n/a"}`);
console.log(`  transcript: ${fixture.naive_agent?.transcript ?? "n/a"}`);

console.log("");
console.log("loyal cart:");
for (const entry of ranked) {
  console.log(`  #${entry.offer_id} ${entry.seller} score=${entry.score}`);
}
console.log(`  winner: #${winner?.offer_id} ${winner?.seller ?? "none"}`);

console.log("");
console.log("attacks:");
for (const [name, passed] of Object.entries(attacks)) {
  console.log(`  [${passed ? "PASS" : "FAIL"}] ${name}`);
}
if (attacks.kickback_does_not_change_winner) {
  console.log(
    `  note: the bribe cannot change the winner. The fixture's ${formatNear(crooked.kickback_yocto)} NEAR is a cooperative donate(); a plain transfer does not run contract code and needs anyone to call sweep. The sandbox integration test covers both.`,
  );
}

const allPassed = Object.values(attacks).every(Boolean);
console.log("");
console.log(allPassed ? "OVERALL: PASS (fixture)" : "OVERALL: FAIL (fixture)");
process.exit(allPassed ? 0 : 1);
