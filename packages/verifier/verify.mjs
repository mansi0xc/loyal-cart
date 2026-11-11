#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatNear, verifyQuote } from "./lib/loyal.mjs";

const args = process.argv.slice(2);
const argValue = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const fixturePath = resolve(argValue("--fixture", "fixtures/arena.json"));

let fixture;
try {
  fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
} catch (error) {
  console.error(`FAIL: cannot read fixture ${fixturePath}: ${error.message}`);
  process.exit(2);
}

const result = verifyQuote(fixture);

console.log(`Loyal Cart verifier — fixture ${fixturePath}`);
console.log(`quote_block=${fixture.quote_block} item=${fixture.item_id} seed=${fixture.seed ?? "n/a"}`);
console.log("");
console.log("checks:");
for (const check of result.checks) {
  console.log(`  [${check.ok ? "PASS" : "FAIL"}] ${check.name}: ${check.detail}`);
}

console.log("");
console.log("ranked valid offers:");
for (const entry of result.ranked) {
  console.log(
    `  #${entry.offer_id} ${entry.seller} score=${entry.score} price=${formatNear(entry.price)} NEAR delivery=${entry.delivery_days}d`,
  );
}

if (result.filtered.length > 0) {
  console.log("");
  console.log("filtered offers:");
  for (const entry of result.filtered) {
    console.log(`  #${entry.offer_id}: ${entry.reason}`);
  }
}

console.log("");
console.log(
  result.ok
    ? "OVERALL: PASS — the quote is valid and the chosen offer is the argmax."
    : "OVERALL: FAIL — do not settle this purchase.",
);

process.exit(result.ok ? 0 : 1);
