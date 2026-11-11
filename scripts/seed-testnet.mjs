#!/usr/bin/env node
import { readFileSync } from "node:fs";

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/arena.json", import.meta.url), "utf8"),
);

console.log("Loyal Cart testnet seed — CP2 work in progress.");
console.log(`Fixture: seed=${fixture.seed} item=${fixture.item_id} offers=${fixture.offers.length}`);
console.log("This script will post offers and create a quote on testnet at CP2.");
console.log("No transactions are sent at CP1.");
