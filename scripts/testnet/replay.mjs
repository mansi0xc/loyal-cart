#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const rpcUrl = value("--rpc", "https://rpc.testnet.fastnear.com");
const artifactPath = resolve(value("--artifact", "artifacts/arena-testnet.json"));
const checks = [];
const add = (ok, name, detail) => checks.push({ ok, name, detail });
const fail = (name, detail) => add(false, name, detail);

const rpc = async (method, params) => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await response.json();
  if (json.error) throw new Error(`${method}: ${json.error.message ?? JSON.stringify(json.error)}`);
  return json.result;
};
const query = (params) => rpc("query", { finality: "final", ...params });
const view = async (account_id, method_name, args = {}) => {
  const result = await query({
    request_type: "call_function",
    account_id,
    method_name,
    args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
  });
  return JSON.parse(Buffer.from(result.result).toString());
};
const tx = (hash, sender) => rpc("tx", { tx_hash: hash, sender_account_id: sender, wait_until: "FINAL" });
const events = (outcome) =>
  outcome.receipts_outcome
    .flatMap((receipt) => receipt.outcome.logs ?? [])
    .filter((log) => log.startsWith("EVENT_JSON:"))
    .map((log) => JSON.parse(log.slice("EVENT_JSON:".length)));
const findEvent = (outcome, name, predicate = () => true) =>
  events(outcome).find((event) => event.event === name && predicate(event));
const same = (a, b) => String(a) === String(b);

let artifact;
try {
  artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
} catch (error) {
  console.error(`FAIL: cannot read ${artifactPath}: ${error.message}`);
  process.exit(2);
}

try {
  const accounts = artifact.accounts;

  const offerBookCode = await query({ request_type: "view_code", account_id: accounts.offerbook });
  const checkoutCode = await query({ request_type: "view_code", account_id: accounts.checkout });
  const offerBookHash = createHash("sha256").update(Buffer.from(offerBookCode.code_base64, "base64")).digest("hex");
  const checkoutHash = createHash("sha256").update(Buffer.from(checkoutCode.code_base64, "base64")).digest("hex");
  add(offerBookHash === artifact.wasm_sha256.offer_book, "offer_book_code_hash", offerBookHash);
  add(checkoutHash === artifact.wasm_sha256.checkout_gate, "checkout_gate_code_hash", checkoutHash);

  for (const role of ["offerbook", "checkout", "agent"]) {
    const keys = await query({ request_type: "view_access_key_list", account_id: accounts[role] });
    const full = (keys.keys ?? []).filter((entry) => {
      const permission = entry.access_key.permission;
      return permission === "FullAccess" || (permission && "FullAccess" in permission);
    });
    if (role === "agent") {
      add((keys.keys ?? []).length === 2 && full.length === 1, "agent_keys", `${(keys.keys ?? []).length} keys, ${full.length} full-access`);
    } else {
      add((keys.keys ?? []).length === 0, `${role}_locked`, `${(keys.keys ?? []).length} keys`);
    }
  }

  const quote = await view(accounts.offerbook, "get_quote", { quote_id: 2 });
  add(same(quote.winner_offer_id, artifact.quote_winner.winner_offer_id), "quote_winner", `#${quote.winner_offer_id}`);
  add(
    quote.offer_ids.length === artifact.quote_winner.offer_ids.length &&
      quote.offer_ids.every((id, index) => same(id, artifact.quote_winner.offer_ids[index])),
    "quote_offer_set",
    `${quote.offer_ids.length} valid offers`,
  );

  for (const [role, offer] of Object.entries(artifact.offers)) {
    const outcome = await tx(offer.tx, offer.seller);
    const event = findEvent(outcome, "offer_posted", (entry) => same(entry.data.offer_id, offer.offer_id));
    add(
      Boolean(event) && same(event.data.seller, offer.seller) && same(event.data.price, offer.price) && event.data.item_id === artifact.item_id,
      `offer_${role}_tx`,
      event ? `#${event.data.offer_id} ${event.data.seller} ${event.data.price}` : "offer_posted event missing",
    );
  }
  add(new Set(Object.values(artifact.offers).map((offer) => offer.seller)).size === 7, "seven_distinct_sellers", "7");

  const winnerTx = await tx(artifact.tx.checkout_winner, accounts.runner);
  const purchase = findEvent(winnerTx, "purchase", (event) => same(event.data.quote_id, 2));
  add(
    Boolean(purchase) &&
      same(purchase.data.offer_id, artifact.quote_winner.winner_offer_id) &&
      same(purchase.data.seller, artifact.offers[artifact.winner_role].seller),
    "winner_checkout",
    purchase ? `offer #${purchase.data.offer_id} paid ${purchase.data.amount}` : "purchase event missing",
  );
  add(!winnerTx.receipts_outcome.some((receipt) => receipt.outcome.status.Failure), "winner_no_failure", "success");

  const refusalTx = await tx(artifact.tx.refusal, accounts.runner);
  const refusalFailure = refusalTx.receipts_outcome.find((receipt) => JSON.stringify(receipt.outcome.status).includes("NotWinner"));
  add(Boolean(refusalFailure), "refusal_names_not_winner", "Smart contract panicked: NotWinner");
  const refusedPurchase = await view(accounts.checkout, "has_purchase", { quote_id: 3 });
  add(refusedPurchase === false, "refusal_no_purchase", `has_purchase(3)=${refusedPurchase}`);

  const policyTx = await tx(artifact.tx.commit_policy, accounts.owner);
  const policyEvent = findEvent(policyTx, "policy_committed");
  add(Boolean(policyEvent), "policy_commit_event", policyEvent ? "policy_committed" : "missing");

  const donateTx = await tx(artifact.tx.donate, accounts.crooked);
  const forwarded = findEvent(donateTx, "forwarded");
  add(Boolean(forwarded), "donate_forwarded", forwarded ? `${forwarded.data.amount} to ${forwarded.data.to}` : "missing");
  const sweepTx = await tx(artifact.tx.sweep, accounts.runner);
  const swept = findEvent(sweepTx, "swept");
  add(Boolean(swept), "sweep_event", swept ? `${swept.data.amount} to ${swept.data.to}` : "missing");

  console.log(`Loyal Cart testnet replay — ${rpcUrl}`);
  console.log(`artifact=${artifactPath} item=${artifact.item_id}`);
  console.log("");
  for (const check of checks) {
    console.log(`  [${check.ok ? "PASS" : "FAIL"}] ${check.name}: ${check.detail}`);
  }
  const ok = checks.every((check) => check.ok);
  console.log("");
  console.log(ok ? "OVERALL: PASS — the recorded testnet run replays from chain data." : "OVERALL: FAIL — do not present this artifact.");
  process.exit(ok ? 0 : 1);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(2);
}
