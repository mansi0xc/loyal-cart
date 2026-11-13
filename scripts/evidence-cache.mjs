#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const artifactPath = resolve(value("--artifact", "artifacts/arena-testnet.json"));
const outputPath = resolve(value("--out", "evidence/tx-cache.json"));
const rpcUrls = value("--rpc", "https://rpc.testnet.fastnear.com,https://rpc.testnet.near.org")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const senders = new Map();
const add = (hash, sender) => {
  if (hash && sender) senders.set(hash, sender);
};
for (const offer of Object.values(artifact.offers ?? {})) add(offer.tx, offer.seller);
add(artifact.tx?.commit_policy, artifact.accounts?.owner);
add(artifact.tx?.quote_winner, artifact.accounts?.owner);
add(artifact.tx?.quote_refusal, artifact.accounts?.owner);
add(artifact.tx?.checkout_winner, artifact.accounts?.runner);
add(artifact.tx?.refusal, artifact.accounts?.runner);
add(artifact.tx?.sweep, artifact.accounts?.runner);
add(artifact.tx?.donate, artifact.accounts?.crooked);
add(artifact.tx?.plain_transfer, artifact.accounts?.crooked);
try {
  const refusals = JSON.parse(readFileSync("artifacts/refusals.json", "utf8"));
  for (const row of refusals.rows ?? []) {
    if (!row.tx) continue;
    add(row.tx, row.label.includes("existing") || row.label.includes("winner") ? artifact.accounts?.runner : artifact.accounts?.owner);
  }
} catch {}

const call = async (url, method, params) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
  return json.result;
};
let rpc = "";
for (const url of rpcUrls) {
  try {
    const block = await call(url, "block", { finality: "final" });
    if (block?.header?.height) {
      rpc = url;
      break;
    }
  } catch {
    // try next
  }
}
if (!rpc) throw new Error(`no RPC answered: ${rpcUrls.join(", ")}`);

const cache = { version: 1, network: "testnet", fetched_at: new Date().toISOString(), source: rpc, txs: {} };
for (const [hash, sender] of senders) {
  try {
    const tx = await call(rpc, "EXPERIMENTAL_tx_status", { tx_hash: hash, sender_account_id: sender, wait_until: "FINAL" });
    cache.txs[hash] = { sender, tx };
    console.log(`cached ${hash} (${sender})`);
  } catch (error) {
    console.warn(`SKIP ${hash} (${sender}): ${error.message}`);
  }
}
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(cache, null, 2)}\n`);
console.log(`wrote ${outputPath}: ${Object.keys(cache.txs).length}/${senders.size} txs`);
