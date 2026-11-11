#!/usr/bin/env bash
set -euo pipefail

echo "Loyal Cart testnet e2e — CP2 work in progress."
echo "At CP2 this will produce:"
echo "  - one refused checkout tx (NotWinner)"
echo "  - one forwarded kickback tx"
echo "  - one accepted checkout tx (honest-a)"
echo "and write the tx hashes to artifacts/e2e-testnet.json."
echo "No transactions are sent at CP1."
exit 0
