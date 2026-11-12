#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WASM_DIR="target/wasm32-unknown-unknown/release"
echo "Loyal Cart testnet deployment plan (CP2)."
echo "This script is a checklist, not an automatic deploy. It sends nothing unless CONFIRM_DEPLOY=yes."
echo ""

if ! command -v near >/dev/null 2>&1; then
  echo "near-cli-rs is not installed. Install it, then re-run:"
  echo "  cargo install cargo-near --locked   # or the near-cli-rs binary"
  echo ""
fi

echo "1. Build the three contracts:"
echo "   cargo build --workspace --target wasm32-unknown-unknown --release"
echo ""
echo "2. Hash the wasm (macOS: shasum -a 256; Linux: sha256sum):"
echo "   shasum -a 256 $WASM_DIR/loyal_cart_offer_book.wasm"
echo "   shasum -a 256 $WASM_DIR/loyal_cart_checkout_gate.wasm"
echo "   shasum -a 256 $WASM_DIR/loyal_cart_agent_account.wasm"
echo ""
echo "3. Create a funded parent and three sub-accounts:"
echo "   near account create-account sponsor-by-faucet-service <parent>.testnet autogenerate-new-keypair save-to-keychain network-config testnet create"
echo "   near account create-account fund-myself offerbook.<parent>.testnet '2 NEAR' autogenerate-new-keypair save-to-keychain sign-with-keychain send"
echo "   near account create-account fund-myself checkout.<parent>.testnet '2 NEAR' autogenerate-new-keypair save-to-keychain sign-with-keychain send"
echo "   near account create-account fund-myself agent.<parent>.testnet '2 NEAR' autogenerate-new-keypair save-to-keychain sign-with-keychain send"
echo ""
echo "4. Deploy and initialize (owner is the human owner):"
echo "   near contract deploy offerbook.<parent>.testnet use-file $WASM_DIR/loyal_cart_offer_book.wasm with-init-call new json-args '{}' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send"
echo "   near contract deploy checkout.<parent>.testnet use-file $WASM_DIR/loyal_cart_checkout_gate.wasm with-init-call new json-args '{\"offer_book\":\"offerbook.<parent>.testnet\"}' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send"
echo "   near contract deploy agent.<parent>.testnet use-file $WASM_DIR/loyal_cart_agent_account.wasm with-init-call new json-args '{\"owner\":\"<owner>.testnet\",\"agent\":\"<agent>.testnet\",\"checkout_gate\":\"checkout.<parent>.testnet\",\"offer_book\":\"offerbook.<parent>.testnet\"}' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send"
echo "   near contract call-function as-transaction offerbook.<parent>.testnet set_checkout_gate json-args '{\"gate\":\"checkout.<parent>.testnet\"}' prepaid-gas '30 Tgas' attached-deposit '0 NEAR' sign-with-keychain send"
echo ""
echo "5. Delete the deployer's full-access keys on OfferBook and CheckoutGate."
echo "   Keep the AgentAccount owner key: the owner is the principal."
echo "   near account delete-key offerbook.<parent>.testnet <deployer-public-key> network-config testnet sign-with-keychain send"
echo "   near account delete-key checkout.<parent>.testnet <deployer-public-key> network-config testnet sign-with-keychain send"
echo ""
echo "6. Publish and verify the lock:"
echo "   node packages/verifier/lock-check.mjs --contract offerbook.<parent>.testnet --expected-code-hash <offer_book_sha256>"
echo "   node packages/verifier/lock-check.mjs --contract checkout.<parent>.testnet --expected-code-hash <checkout_sha256>"
echo ""
echo "7. Write deployments.json from deployments.example.json with the real accounts and hashes."
echo ""
echo "No transactions were sent."

if [ "${CONFIRM_DEPLOY:-}" != "yes" ]; then
  exit 0
fi

echo "CONFIRM_DEPLOY=yes is set, but the automatic path is intentionally not implemented yet."
echo "Run the steps above manually and record the tx hashes in the CP2 report."
exit 1
