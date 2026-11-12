const explorer = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;
const near = (yocto) => {
  const value = Number(yocto) / 1e24;
  return `${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} NEAR`;
};
const short = (value, head = 10, tail = 6) =>
  value && value.length > head + tail ? `${value.slice(0, head)}…${value.slice(-tail)}` : value || "—";

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) {
    if (text instanceof Node) node.append(text);
    else node.textContent = text;
  }
  return node;
};

const txLink = (hash, label = "tx") => {
  const link = el("a", "txline", `${label}: ${hash}`);
  link.href = explorer(hash);
  link.target = "_blank";
  link.rel = "noreferrer";
  return link;
};

const load = async () => {
  const [art, fixture] = await Promise.all([
    fetch("/artifacts/arena-testnet.json").then((response) => response.json()),
    fetch("/fixtures/arena.json").then((response) => response.json()),
  ]);
  render(art, fixture);
};

const render = (art, fixture) => {
  const quote = art.quote_winner;
  const offers = Object.entries(art.offers).map(([role, offer]) => ({ ...offer, role }));
  const byId = new Map(offers.map((offer) => [Number(offer.offer_id), offer]));
  const winner = byId.get(Number(quote.winner_offer_id));
  const naive = offers.find((offer) => offer.role === "injector_valid");
  const valid = new Set(quote.offer_ids.map(Number));
  const policyMax = BigInt(art.policy.max_price);
  const excluded = new Set(art.policy.excluded_sellers);
  const listingFor = (role) => {
    const key = role.replaceAll("_", "-");
    return fixture.offers.find((offer) => offer.seller.startsWith(key))?.listing_text ?? "";
  };

  const status = document.getElementById("status");
  const chip = (text, ok) => status.append(el("span", `chip ${ok ? "ok" : "bad"}`, text));
  chip(art.lock_check.offer_book_zero_keys ? "OfferBook: 0 keys" : "OfferBook: key present", art.lock_check.offer_book_zero_keys);
  chip(art.lock_check.checkout_zero_keys ? "CheckoutGate: 0 keys" : "CheckoutGate: key present", art.lock_check.checkout_zero_keys);
  chip(
    art.code_hashes.offerbook === art.wasm_sha256.offer_book &&
      art.code_hashes.checkout === art.wasm_sha256.checkout_gate
      ? "code hash = published wasm"
      : "code hash mismatch",
    art.code_hashes.offerbook === art.wasm_sha256.offer_book,
  );
  chip(
    art.committed_policy_hash === art.policy_hash ? "policy hash committed" : "policy mismatch",
    art.committed_policy_hash === art.policy_hash,
  );

  const moment = document.getElementById("moment");
  const winnerCard = el("article", "moment-card win");
  winnerCard.append(el("span", "tag", "Winner · paid"));
  winnerCard.append(el("h3", "", `#${winner.offer_id} ${winner.role}`));
  winnerCard.append(el("div", "big", near(winner.price)));
  winnerCard.append(
    el("p", "", `Seller ${winner.seller} was credited. The gate received the exact price and recorded the purchase.`),
  );
  winnerCard.append(txLink(art.tx.checkout_winner, "checkout"));
  const refusalCard = el("article", "moment-card refuse");
  refusalCard.append(el("span", "tag", "Non-winner · refused"));
  refusalCard.append(el("h3", "", `#${art.offers[art.refused_role].offer_id} ${art.refused_role}`));
  refusalCard.append(el("div", "big", near(art.offers[art.refused_role].price)));
  refusalCard.append(
    el(
      "p",
      "",
      `The same runner key called execute_purchase. The gate receipt failed with “Smart contract panicked: NotWinner”; no purchase was recorded.`,
    ),
  );
  refusalCard.append(txLink(art.tx.refusal, "refusal"));
  moment.append(winnerCard, refusalCard);

  const compare = document.getElementById("side-by-side");
  const naiveCard = el("article", "pick bad");
  naiveCard.append(el("div", "who", "Scripted baseline · no LLM"));
  naiveCard.append(el("h3", "", `Picks #${naive.offer_id} ${naive.role}`));
  naiveCard.append(el("div", "price", near(naive.price)));
  naiveCard.append(el("p", "", `Listing text: “${listingFor(naive.role)}”`));
  naiveCard.append(
    el("p", "", "This is 0.005 NEAR worse than the winner. On testnet this exact purchase panics NotWinner."),
  );
  const loyalCard = el("article", "pick good");
  loyalCard.append(el("div", "who", "Loyal Cart · committed policy"));
  loyalCard.append(el("h3", "", `Pays #${winner.offer_id} ${winner.role}`));
  loyalCard.append(el("div", "price", near(winner.price)));
  loyalCard.append(
    el(
      "p",
      "",
      `Best score under price 60 / delivery 20 / reputation 20. The injection text has no field in the offer struct; only its hash is committed.`,
    ),
  );
  loyalCard.append(el("p", "", "The checkout gate rechecks the winner hash, the seller and the exact price."));
  compare.append(naiveCard, loyalCard);

  const tbody = document.querySelector("#offers tbody");
  for (const offer of offers.sort((a, b) => Number(a.offer_id) - Number(b.offer_id))) {
    const row = el("tr");
    if (Number(offer.offer_id) === Number(winner.offer_id)) row.className = "winner";
    let statusCell;
    if (Number(offer.offer_id) === Number(winner.offer_id)) {
      statusCell = el("span", "tag-ok", "winner");
    } else if (valid.has(Number(offer.offer_id))) {
      statusCell = el("span", "tag-mid", "valid · ranked");
    } else if (Number(offer.expires_at_block) <= Number(quote.quote_block)) {
      statusCell = el("span", "tag-no", "filtered: expired");
    } else if (BigInt(offer.price) > policyMax) {
      statusCell = el("span", "tag-no", "filtered: over max price");
    } else if (excluded.has(offer.seller)) {
      statusCell = el("span", "tag-no", "filtered: excluded seller");
    } else {
      statusCell = el("span", "tag-no", "filtered by policy");
    }
    if (statusCell.classList.contains("tag-no")) row.classList.add("filtered");
    const link = el("a", "", short(offer.tx));
    link.href = explorer(offer.tx);
    link.target = "_blank";
    link.rel = "noreferrer";
    row.append(
      el("td", "num", `#${offer.offer_id}`),
      el("td", "", offer.role + (offer.role === "injector_valid" ? " · naive pick" : "")),
      el("td", "mono", offer.seller),
      el("td", "num", near(offer.price)),
      el("td", "num", `${offer.delivery_days}d`),
      el("td", "", statusCell),
      el("td", "", link),
    );
    tbody.append(row);
  }

  const kickback = document.getElementById("kickback");
  const donate = el("article", "card");
  donate.append(el("h3", "", "Cooperative donate()"));
  donate.append(el("div", "value", `+${near(art.donate_owner_delta_yocto)}`));
  donate.append(el("p", "", "Forwarded to the owner in the same transaction. The winner did not change."));
  donate.append(txLink(art.tx.donate, "donate"));
  const plain = el("article", "card");
  plain.append(el("h3", "", "Plain transfer"));
  plain.append(el("div", "value", "0.01 NEAR"));
  plain.append(el("p", "", "Runs no contract code. It sits in the agent until anyone calls sweep()."));
  plain.append(txLink(art.tx.plain_transfer, "transfer"));
  const sweep = el("article", "card");
  sweep.append(el("h3", "", "Permissionless sweep()"));
  sweep.append(el("div", "value", `+${near(art.sweep_owner_delta_yocto)}`));
  sweep.append(
    el("p", "", `Whole free balance minus the storage reserve. The agent kept ${near(art.agent_after_sweep_yocto)} for storage.`),
  );
  sweep.append(txLink(art.tx.sweep, "sweep"));
  kickback.append(donate, plain, sweep);

  const filters = document.getElementById("filters");
  const filtered = [
    ["Expired", art.offers.expired, "expires before the quote block"],
    ["Over max price", art.offers.injector, "2.00 NEAR > 1.00 NEAR cap"],
    ["Excluded seller", art.offers.excluded, "seller is in the committed exclusion list"],
  ];
  for (const [title, offer, reason] of filtered) {
    const card = el("article", "card");
    card.append(el("h3", "", title));
    card.append(el("div", "value", `#${offer.offer_id}`));
    card.append(el("p", "", `${reason}. It is not in the quote's offer list.`));
    card.append(txLink(offer.tx, "offer tx"));
    filters.append(card);
  }

  const proof = document.getElementById("proof");
  const rows = [
    ["Quote", `#${quote.quote_id} · ${quote.offer_ids.length} valid offers · winner #${quote.winner_offer_id}`],
    ["Policy hash", art.policy_hash],
    ["Committed hash", art.committed_policy_hash],
    ["OfferBook code", art.code_hashes.offerbook],
    ["CheckoutGate code", art.code_hashes.checkout],
    ["OfferBook keys", `${art.access_keys.offerbook.length}`],
    ["CheckoutGate keys", `${art.access_keys.checkout.length}`],
    ["Agent keys", `${art.access_keys.agent.length} (owner + runner execute_purchase)`],
    ["Verifier", "node packages/verifier/verify.mjs --rpc … --offer-book … --quote 2 [--tx … --sender …]"],
  ];
  for (const [label, value] of rows) {
    const row = el("div", "proof-row");
    row.append(el("span", "", label), el("span", "", value));
    proof.append(row);
  }

  const limits = document.getElementById("limits");
  [
    "A refusal to act leaves no on-chain trace. The design constrains what a purchase pays, not whether one happens.",
    "A full-access key on the agent account can delete it and move the balance. donate/sweep only bind while no such key exists.",
    "A 64-offer cap plus one live offer per (seller, item) blocks the trivial single-account DoS; a financed griefer with many accounts can still fill the cap. Refundable storage deposits are not implemented.",
    "NEP-141 plain transfers are not forwarded. The demo uses native NEAR.",
    "The user's own key is the root of trust. Whoever holds it can rewrite the policy or sweep the budget.",
    "The testnet contracts are locked; the code hash equals the published wasm. A byte-reproducible build is planned, not done.",
  ].forEach((text) => limits.append(el("li", "", text)));

  document.getElementById("item").textContent = `${art.item_id} · ${new Date(art.created_at).toISOString().slice(0, 10)}`;
};

load().catch((error) => {
  document.body.innerHTML = `<main><h1>Run the local UI server</h1><p class="lede">${error.message}</p><p class="lede">From the repo root: <code>npm run ui</code>, then open <code>http://localhost:4173</code>.</p></main>`;
});
