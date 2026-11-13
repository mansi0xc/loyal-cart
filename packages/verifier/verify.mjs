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
const rpcArg = argValue("--rpc", "");
const rpcCandidates = [...new Set([rpcArg, "https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org"].filter(Boolean))];
let rpc = "";
const offerBook = argValue("--offer-book", "");
const quoteArg = argValue("--quote", "");
const txHash = argValue("--tx", "");
const txSender = argValue("--sender", "");
const noTxRpc = args.includes("--no-tx-rpc");
const cachePath = resolve(argValue("--cache", "evidence/tx-cache.json"));

const callRpc = async (url, method, params) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
};
const selectRpc = async () => {
  const errors = [];
  for (const candidate of rpcCandidates) {
    try {
      const block = await callRpc(candidate, "block", { finality: "final" });
      if (!block?.header?.height) throw new Error("no final block header");
      rpc = candidate;
      console.log(`rpc=${candidate} (final block ${block.header.height})`);
      return;
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  throw new Error(`no RPC answered: ${errors.join("; ")}`);
};
const rpcCall = (method, params) => {
  if (!rpc) throw new Error("RPC not selected");
  return callRpc(rpc, method, params);
};

let txCache = null;
const loadTxCache = () => {
  if (txCache !== null) return txCache;
  try {
    txCache = JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    txCache = { txs: {} };
  }
  return txCache;
};
const getTx = async (hash, sender) => {
  let rpcError = null;
  if (!noTxRpc) {
    const txRpcCandidates = [...new Set([rpc, "https://archival-rpc.testnet.near.org", "https://rpc.testnet.fastnear.com", "https://rpc.testnet.near.org"].filter(Boolean))];
    for (const candidate of txRpcCandidates) {
      try {
        const tx = await callRpc(candidate, "tx", { tx_hash: hash, sender_account_id: sender, wait_until: "FINAL" });
        return { tx, source: `rpc ${candidate}` };
      } catch (error) {
        rpcError = error;
      }
    }
  }
  const cached = loadTxCache().txs?.[hash];
  if (cached?.tx) return { tx: cached.tx, source: "cache" };
  throw new Error(
    `${noTxRpc ? "--no-tx-rpc" : `tx RPC failed (${rpcError?.message ?? "unknown"})`}; no cached tx for ${hash} in ${cachePath}`,
  );
};

const query = async (methodName, args) => {
  const result = await rpcCall("query", {
    request_type: "call_function",
    finality: "final",
    account_id: offerBook,
    method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result.result).toString());
};

let fixture;
let source;
let txCheck = null;
if (offerBook && quoteArg) {
  try {
    await selectRpc();
    const quote = await query("get_quote", { quote_id: Number(quoteArg) });
    let chosenOfferId = quote.winner_offer_id;
    if (txHash) {
      if (!txSender) throw new Error("--tx requires --sender");
      const { tx, source: txSource } = await getTx(txHash, txSender);
      const call = tx.transaction.actions.find((action) => action.FunctionCall);
      if (!call) throw new Error("transaction has no FunctionCall action");
      const callArgs = JSON.parse(Buffer.from(call.FunctionCall.args, "base64").toString());
      chosenOfferId = callArgs.offer_id;
      const wrapped = JSON.stringify(tx);
      const expectedRefusal = chosenOfferId !== quote.winner_offer_id;
      const sawFailure = tx.receipts_outcome.some((outcome) => "Failure" in outcome.outcome.status);
      const namedRefusal = wrapped.includes("NotWinner");
      txCheck = {
        call: call.FunctionCall.method_name,
        quote_id: callArgs.quote_id,
        offer_id: chosenOfferId,
        expectedRefusal,
        sawFailure,
        namedRefusal,
        source: txSource,
        checks: [
          {
            ok: call.FunctionCall.method_name === "execute_purchase",
            name: "tx_calls_execute_purchase",
            detail: call.FunctionCall.method_name,
          },
          {
            ok: callArgs.quote_id === Number(quoteArg),
            name: "tx_quote_matches",
            detail: `quote_id=${callArgs.quote_id} expected=${quoteArg}`,
          },
          {
            ok: expectedRefusal ? sawFailure && namedRefusal : !sawFailure,
            name: "tx_outcome_matches_book",
            detail: expectedRefusal
              ? `chosen offer #${chosenOfferId} is not the winner; failure=${sawFailure}; NotWinner=${namedRefusal}`
              : `chosen offer #${chosenOfferId} is the winner; failure=${sawFailure}`,
          },
          {
            ok: true,
            name: "tx_source",
            detail: txSource === "cache" ? "SKIPPED-AGED (cached)" : txSource,
          },
        ],
      };
    }
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
      chosen_offer_id: chosenOfferId,
      checkout_allowed: chosenOfferId === quote.winner_offer_id,
      item_id: quote.item_id,
      seed: `live:${quoteArg}`,
    };
    source = `live ${rpc} ${offerBook} quote ${quoteArg}${txHash ? ` tx ${txHash}` : ""}`;
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
if (txCheck) {
  result.checks.push(...txCheck.checks);
  result.ok = result.ok && txCheck.checks.every((check) => check.ok);
}

console.log(`Loyal Cart verifier — ${source}`);
console.log(`quote_block=${fixture.quote_block} item=${fixture.item_id} seed=${fixture.seed ?? "n/a"}`);
if (txCheck) {
  console.log(
    `tx=${txHash} sender=${txSender} call=${txCheck.call} quote=${txCheck.quote_id} offer=${txCheck.offer_id} expected_refusal=${txCheck.expectedRefusal}`,
  );
}
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
