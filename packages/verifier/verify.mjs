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
const rpc = argValue("--rpc", "");
const offerBook = argValue("--offer-book", "");
const quoteArg = argValue("--quote", "");

const query = async (methodName, args) => {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: offerBook,
        method_name: methodName,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return JSON.parse(Buffer.from(json.result.result).toString());
};

let fixture;
let source;
if (rpc && offerBook && quoteArg) {
  try {
    const quote = await query("get_quote", { quote_id: Number(quoteArg) });
    const offers = [];
    for (let index = 0; index < quote.offer_ids.length; index += 1) {
      const offer = await query("get_offer", { offer_id: quote.offer_ids[index] });
      offers.push({ ...offer, sales: quote.seller_sales[index], listing_text: "" });
    }
    fixture = {
      policy: quote.policy,
      policy_hash: Buffer.from(quote.policy_hash).toString("hex"),
      offer_hashes: quote.offer_hashes.map((hash) => Buffer.from(hash).toString("hex")),
      offers,
      quote_block: quote.quote_block,
      winner_offer_id: quote.winner_offer_id,
      chosen_offer_id: quote.winner_offer_id,
      checkout_allowed: true,
      item_id: quote.item_id,
      seed: `live:${quoteArg}`,
    };
    source = `live ${rpc} ${offerBook} quote ${quoteArg}`;
  } catch (error) {
    console.error(`FAIL: cannot read the live quote: ${error.message}`);
    process.exit(2);
  }
} else {
  try {
    fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    source = fixturePath;
  } catch (error) {
    console.error(`FAIL: cannot read fixture ${fixturePath}: ${error.message}`);
    process.exit(2);
  }
}

const result = verifyQuote(fixture);

console.log(`Loyal Cart verifier — ${source}`);
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
    ? "OVERALL: PASS — the quote is valid and the chosen offer is the best-scoring (lowest cost)."
    : "OVERALL: FAIL — do not settle this purchase.",
);

process.exit(result.ok ? 0 : 1);
