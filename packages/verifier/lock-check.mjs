#!/usr/bin/env node
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const rpc = value("--rpc", "https://rpc.testnet.near.org");
const contract = value("--contract", "");
const expected = value("--expected-code-hash", "").replace(/^0x/i, "").toLowerCase();

if (!contract) {
  console.error("usage: node packages/verifier/lock-check.mjs --contract <account> [--rpc <url>] [--expected-code-hash <sha256>]");
  process.exit(2);
}

const query = async (requestType) => {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: requestType,
        finality: "final",
        account_id: contract,
      },
    }),
  });
  const json = await response.json();
  if (json.error) {
    throw new Error(`${requestType}: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  return json.result;
};

const isFullAccess = (permission) => {
  if (permission === "FullAccess") return true;
  return typeof permission === "object" && permission !== null && "FullAccess" in permission;
};

try {
  const keys = await query("view_access_key_list");
  const full = (keys.keys ?? []).filter((entry) => isFullAccess(entry.access_key.permission));
  const code = await query("view_code");
  const codeHash = createHash("sha256")
    .update(Buffer.from(code.code_base64, "base64"))
    .digest("hex");

  console.log(`contract: ${contract}`);
  console.log(`rpc: ${rpc}`);
  console.log(`keys: ${(keys.keys ?? []).length} total, ${full.length} full-access`);
  for (const entry of keys.keys ?? []) {
    const permission = entry.access_key.permission;
    const label = isFullAccess(permission)
      ? "FullAccess"
      : `FunctionCall(${permission.FunctionCall?.receiver_id ?? "?"})`;
    console.log(`  ${entry.public_key} ${label}`);
  }
  console.log(`wasm_sha256: ${codeHash}`);

  const noFullAccess = full.length === 0;
  const hashMatches = expected === "" || expected === codeHash;

  if (!noFullAccess) {
    console.error("FAIL: the contract still has a full-access key; the deployer can change the rules.");
  }
  if (!hashMatches) {
    console.error(`FAIL: wasm hash ${codeHash} does not match the published ${expected}.`);
  }
  if (noFullAccess && hashMatches) {
    console.log("PASS: no full-access key; wasm hash matches the published build.");
    process.exit(0);
  }
  process.exit(1);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(2);
}
