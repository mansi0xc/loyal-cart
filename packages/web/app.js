import { invalidReason, rankOffers, scoreTerms } from "./rank.mjs";

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
const explorer = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;
const nearStr = (yocto, digits = 4) => {
  const v = Number(BigInt(yocto)) / 1e24;
  return v.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "");
};
const near3 = (yocto) => (Number(BigInt(yocto)) / 1e24).toFixed(3);
const short = (v, h = 6, t = 4) => (v && v.length > h + t + 1 ? `${v.slice(0, h)}..${t ? v.slice(-t) : ""}` : v);
const label = (role) => role.replaceAll("_", "-");
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const row = (l, r, cls = "") => `<div class="row ${cls}"><span>${l}</span><span>${r}</span></div>`;
const restart = (node, cls) => {
  if (reduced) return;
  node.classList.remove(cls);
  void node.offsetWidth;
  node.classList.add(cls);
};
const toast = (() => {
  let timer;
  return (html) => {
    const t = $("#toast");
    t.innerHTML = html;
    t.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => t.classList.remove("show"), 4600);
  };
})();
const REASONS = {
  expired: "expired",
  price_above_max: "over cap",
  seller_excluded: "excluded",
  delivery_below_min: "too fast",
};
const REASONS_LONG = {
  expired: "expired before the quote",
  price_above_max: "over the 1 NEAR price cap",
  seller_excluded: "seller excluded by policy",
  delivery_below_min: "delivery below the policy minimum",
};

// ---------------------------------------------------------------- live RPC
const RPCS = ["https://rpc.testnet.near.org", "https://rpc.testnet.fastnear.com"];
let rpcUsed = null;
const rpc = async (method, params) => {
  const order = rpcUsed ? [rpcUsed, ...RPCS.filter((u) => u !== rpcUsed)] : RPCS;
  let lastError;
  for (const url of order) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "lc", method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const body = await res.json();
      if (body.error) throw new Error(body.error.cause?.name ?? body.error.message ?? "rpc error");
      rpcUsed = url;
      return body.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("no rpc");
};
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58hex = (s) => {
  let n = 0n;
  for (const c of s) n = n * 58n + BigInt(B58.indexOf(c));
  return n.toString(16).padStart(64, "0");
};

// ---------------------------------------------------------------- data
const load = async () => {
  const [art, fixture] = await Promise.all([
    fetch("../../artifacts/arena-testnet.json").then((r) => r.json()),
    fetch("../../fixtures/arena.json").then((r) => r.json()),
  ]);
  const quote = art.quote_winner;
  const quoteBlock = art.quote_txs.find((q) => q.quote_id === quote.quote_id).event.data.quote_block;
  const salesById = new Map(quote.offer_ids.map((id, i) => [Number(id), quote.seller_sales[i] ?? 0]));
  const listing = (role) => fixture.offers.find((o) => o.seller.startsWith(label(role) + "."))?.listing_text ?? "";
  const base = Object.entries(art.offers).map(([role, o]) => ({
    ...o,
    role,
    sales: salesById.get(Number(o.offer_id)) ?? 0,
    listing_text: listing(role),
  }));
  return { art, fixture, quote, quoteBlock, base };
};

// ---------------------------------------------------------------- hero receipt (the recorded quote)
const heroReceipt = ({ art, quote, quoteBlock, base }) => {
  const ranked = rankOffers(base, art.policy, quoteBlock);
  const byId = new Map(base.map((o) => [Number(o.offer_id), o]));
  const refused = Number(art.refused_offer_id);
  const date = new Date(art.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).toUpperCase();
  const lines = ranked
    .map((r, i) => {
      const o = byId.get(r.offer_id);
      const stamp = r.offer_id === refused ? ` stamped" data-stamp="NOT WINNER" style="--delay:${reduced ? 0 : 2.5}s` : "";
      return `<div class="row${stamp}"><span>#${r.offer_id} ${label(o.role)}</span><span>${r.score}${i === 0 ? " ★" : ""}</span></div>`;
    })
    .join("");
  const out = base
    .filter((o) => invalidReason(o, art.policy, quoteBlock))
    .sort((a, b) => Number(a.offer_id) - Number(b.offer_id))
    .map((o) => row(`#${o.offer_id} ${REASONS[invalidReason(o, art.policy, quoteBlock)]}`, "--", "dim"))
    .join("");
  const p = art.policy;
  const r = $("#heroReceipt");
  r.innerHTML = `
    <div class="c big">LOYAL CART</div>
    <div class="c dim">NEAR TESTNET · QUOTE #${quote.quote_id}</div>
    <div class="c dim">${date} · BLOCK ${Number(quote.quote_block).toLocaleString("en-US")}</div>
    <hr />
    ${row(`POLICY ${art.committed_policy_hash.slice(0, 6)}..`, "COMMITTED")}
    ${row(`price ×${p.price_weight}`, `delivery ×${p.delivery_weight}`)}
    ${row(`history ×${p.reputation_weight}`, "lowest wins")}
    <hr />
    ${lines}
    ${out}
    <hr />
    ${row("TIP SENT TO AGENT", `${near3(art.donate_owner_delta_yocto)} N`)}
    ${row("&nbsp;&nbsp;forwarded to buyer", `${near3(art.donate_owner_delta_yocto)} N`)}
    ${row("WINNER CHANGED?", "NO")}
    <hr />
    ${row(`PAID #${art.purchase_winner.offer_id}`, `${near3(art.purchase_winner.amount)} N`, "big")}
    <div class="c dim"><a href="${explorer(art.tx.checkout_winner)}" target="_blank" rel="noreferrer">tx ${short(art.tx.checkout_winner, 6, 6)}</a></div>
    <div class="bar-code"></div>
    <div class="c dim" id="heroKeys">GATE KEYS: 0 (RECORDED) · RE-CHECK WITHOUT A WALLET</div>`;
  restart(r, "feed");
  const printer = $(".hero-till .printer");
  if (!reduced) {
    printer.classList.add("busy");
    setTimeout(() => printer.classList.remove("busy"), 2400);
  }
};

// ---------------------------------------------------------------- arena
const setupArena = ({ art, quote, quoteBlock, base }) => {
  const policy = art.policy;
  const original = base.find((o) => o.role === "injector_valid").listing_text;

  $("#itemId").textContent = art.item_id;
  $("#policyShort").textContent = `${art.committed_policy_hash.slice(0, 6)}..`;
  $("#cmdTx").textContent = `node packages/verifier/verify.mjs --offer-book ${art.accounts.offerbook} --quote 3 --tx ${art.tx.refusal} --sender ${art.accounts.runner}`;
  $("#copyTx").dataset.copy = $("#cmdTx").textContent;

  const state = { bribe: 0, text: original, crookedPrice: 120 };
  const tallies = { bribe: 0, inject: 0, compete: 0 };
  let reprints = 0;
  let lastAnim = 0;
  const offersNow = () =>
    base.map((o) => {
      const copy = { ...o };
      if (o.role === "injector_valid") copy.listing_text = state.text;
      if (o.role === "crooked") copy.price = (BigInt(state.crookedPrice) * 10n ** 21n).toString();
      return copy;
    });
  const winnerId = () => rankOffers(offersNow(), policy, quoteBlock)[0]?.offer_id;

  const ranksEl = $("#ranks");
  const rows = new Map();
  const receipt = $("#arenaReceipt");
  const printer = $(".arena-till .printer");

  const render = () => {
    reprints += 1;
    const offers = offersNow();
    const byId = new Map(offers.map((o) => [Number(o.offer_id), o]));
    const ranked = rankOffers(offers, policy, quoteBlock);
    const first = new Map([...rows].map(([id, n]) => [id, n.getBoundingClientRect().top]));
    ranked.forEach((r, i) => {
      const o = byId.get(r.offer_id);
      let li = rows.get(r.offer_id);
      if (!li) {
        li = el("li");
        li.innerHTML = `<div class="who"><b></b><small></small></div><div class="sc"></div><button class="pay" type="button">PAY</button>`;
        li.querySelector(".pay").addEventListener("click", () => pay(r.offer_id));
        rows.set(r.offer_id, li);
      }
      const t = scoreTerms(o, policy, o.sales);
      li.classList.toggle("winner", i === 0);
      li.classList.toggle("bribed", o.role === "crooked" && state.bribe > 0);
      li.classList.toggle("injected", o.role === "injector_valid" && state.text !== original);
      li.querySelector(".who b").textContent = `#${o.offer_id} ${label(o.role)}`;
      li.querySelector(".who small").textContent =
        o.role === "injector_valid" ? `"${o.listing_text}"` : `${near3(o.price)} N · ${o.delivery_days}d · ${o.sales} sales`;
      li.querySelector(".who small").title = o.listing_text;
      li.querySelector(".sc").innerHTML = `${t.total}<small>${t.price}+${t.delivery}+${t.reputation}</small>`;
      ranksEl.append(li);
    });
    if (!reduced) {
      rows.forEach((li, id) => {
        const before = first.get(id);
        if (before === undefined) return;
        const dy = before - li.getBoundingClientRect().top;
        if (Math.abs(dy) < 1) return;
        li.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 480, easing: "steps(6)" });
      });
    }
    $("#filtered").innerHTML = offers
      .map((o) => [o, invalidReason(o, policy, quoteBlock)])
      .filter(([, why]) => why)
      .map(([o, why]) => row(`#${o.offer_id} ${label(o.role)}`, REASONS[why] ?? why))
      .join("") + `<div class="row"><span>not in the quote</span><span></span></div>`;
    $("#filtered").title = offers
      .map((o) => [o, invalidReason(o, policy, quoteBlock)])
      .filter(([, why]) => why)
      .map(([o, why]) => `#${o.offer_id}: ${REASONS_LONG[why] ?? why}`)
      .join("\n");
    $("#arExtras").innerHTML = [
      row("KICKBACK OFFERED", `<b>${state.bribe} N</b>`, state.bribe > 0 ? "hot" : ""),
      row("SCORE INPUT FOR KICKBACK", "<b>NONE</b>"),
      row("WINNER CHANGES", ""),
      row("&nbsp;&nbsp;bribe · text · price", `<b>${tallies.bribe} · ${tallies.inject} · ${tallies.compete}</b>`),
    ].join("");
    const top = byId.get(ranked[0].offer_id);
    $("#arPaid").textContent = `PAY #${top.offer_id}`;
    $("#arAmt").textContent = `${near3(top.price)} N`;
    $("#arHead").textContent = `QUOTE #${quote.quote_id} · ${reprints === 1 ? "PRINT" : `REPRINT ${reprints - 1}`}`;
    $("#lcPick").textContent = `pays #${top.offer_id}`;
    $("#naivePick").textContent = `picks #${art.offers.injector_valid.offer_id}`;
    const now = performance.now();
    if (reprints > 1 && now - lastAnim > 380) {
      lastAnim = now;
      restart(receipt, "reprint");
      printer.classList.add("busy");
      setTimeout(() => printer.classList.remove("busy"), 450);
    }
  };

  const bump = (key) => {
    const n = $(`#t${key[0].toUpperCase()}${key.slice(1)}`);
    n.textContent = String(tallies[key]);
    restart(n, "bump");
  };
  const lever = (key, mutate) => {
    const before = winnerId();
    mutate();
    const after = winnerId();
    if (after !== before) {
      tallies[key] += 1;
      bump(key);
    }
    $$(".lines .stamp").forEach((s) => s.remove());
    render();
  };

  const fill = (input) => {
    const p = ((input.value - input.min) / (input.max - input.min)) * 100;
    input.style.setProperty("--p", `${p}%`);
  };
  const bribe = $("#bribe");
  bribe.addEventListener("input", () => {
    lever("bribe", () => (state.bribe = Number(bribe.value)));
    $("#bribeOut").textContent = `${bribe.value} NEAR`;
    fill(bribe);
    const ex = $("#bribeExplain");
    ex.innerHTML =
      state.bribe === 0
        ? "The score has three inputs: price, delivery and seller history. There is no input for a kickback, so there is nothing for it to move."
        : `${state.bribe} NEAR offered. Winner: <b>#${winnerId()}</b>, unchanged. The score has no input for a kickback. Native NEAR actually sent to the agent account is forwarded by donate() or swept to the buyer by anyone.`;
    restart(ex, "flash");
  });
  const text = $("#inject");
  text.value = original;
  text.addEventListener("input", () => lever("inject", () => (state.text = text.value || " ")));
  const price = $("#price");
  price.addEventListener("input", () => {
    lever("compete", () => (state.crookedPrice = Number(price.value)));
    $("#priceOut").textContent = `${(state.crookedPrice / 1000).toFixed(3)} NEAR`;
    fill(price);
    const crooked = art.offers.crooked.offer_id;
    $("#competeExplain").innerHTML =
      winnerId() === crooked
        ? `Crooked now has the best score, so <b>it gets paid</b>. That is the rule working: better offers win; bribes don't.`
        : `Drag below about 0.099 NEAR and the crooked merchant wins, fairly.`;
  });
  fill(bribe);
  fill(price);

  $$(".tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => {
        t.classList.toggle("on", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      $$(".pane").forEach((p) => {
        const on = p.dataset.pane === tab.dataset.tab;
        p.hidden = !on;
        p.classList.toggle("on", on);
      });
      $("#arenaReceipt").classList.toggle("hide-tip", tab.dataset.tab !== "bribe");
    }),
  );

  const pay = (id) => {
    $$(".lines .stamp").forEach((s) => s.remove());
    const li = rows.get(id);
    const w = winnerId();
    const o = base.find((x) => Number(x.offer_id) === id);
    if (id === w) {
      li.append(el("span", "stamp ink", "PAID"));
      toast(`Gate check passes: <b>#${id}</b> is the quote winner, so the seller is paid. (Simulated here.)`);
    } else {
      li.append(el("span", "stamp red", "NOT WINNER"));
      const real =
        id === Number(art.refused_offer_id)
          ? ` This exact refusal happened on testnet: <a href="${explorer(art.tx.refusal)}" target="_blank" rel="noreferrer">${short(art.tx.refusal, 8, 6)}</a>.`
          : "";
      toast(`Refused: <b>#${id} ${label(o.role)}</b> is not the winner. The deposit goes back to the agent. (Simulated here.)${real}`);
    }
  };

  render();
};

// ---------------------------------------------------------------- proof (live tx read, printed)
const proof = ({ art }) => {
  const sender = art.accounts.runner;
  const write = async (term, lines) => {
    term.innerHTML = "";
    for (const [cls, text] of lines) {
      term.append(el("div", cls, esc(text)));
      await sleep(280);
    }
    term.append(el("span", "cursor"));
  };
  const parse = (res) => {
    const transfers = [];
    const refunds = [];
    for (const r of res.receipts ?? []) {
      for (const a of r.receipt?.Action?.actions ?? []) {
        if (!a?.Transfer) continue;
        (r.predecessor_id === "system" ? refunds : transfers).push({ to: r.receiver_id, amount: a.Transfer.deposit });
      }
    }
    const failures = res.receipts_outcome
      .filter((o) => o.outcome.status.Failure)
      .map((o) => ({ who: o.outcome.executor_id, msg: JSON.stringify(o.outcome.status.Failure).match(/ExecutionError":"([^"]+)/)?.[1] ?? "failure" }));
    const fc = res.transaction.actions.find((a) => a.FunctionCall)?.FunctionCall;
    let args = "";
    try { args = atob(fc.args); } catch { /* not base64 */ }
    return { transfers, refunds, failures, method: fc?.method_name, args };
  };

  const run = async (card, hash, kind) => {
    const term = $("[data-term]", card);
    const state = $("[data-state]", card);
    $("[data-link]", card).href = explorer(hash);
    state.textContent = "reading testnet...";
    let lines;
    try {
      const res = await rpc("EXPERIMENTAL_tx_status", { tx_hash: hash, sender_account_id: sender, wait_until: "NONE" });
      const p = parse(res);
      lines = [
        ["d", `tx ${short(hash, 8, 6)}`],
        ["", (() => {
          try {
            const a = JSON.parse(p.args);
            return `${p.method}(quote ${a.quote_id}, offer ${a.offer_id}, ${nearStr(a.amount)} N)`;
          } catch {
            return `${p.method}(${p.args})`;
          }
        })()],
      ];
      if (kind === "win") {
        const payTx = p.transfers.find((t) => t.to === art.purchase_winner.seller);
        lines.push(["g", p.failures.length === 0 ? "✓ every receipt succeeded" : `! ${p.failures.length} failed receipt(s)`]);
        if (payTx) lines.push(["g", `✓ ${nearStr(payTx.amount)} N → ${payTx.to.split(".")[0]}`]);
        lines.push(["d", `purchase recorded for quote ${art.purchase_winner.quote_id}`]);
        $("[data-amount]", card).textContent = payTx ? nearStr(payTx.amount) : "0.1";
      } else {
        const f = p.failures.find((x) => x.msg.includes("NotWinner")) ?? p.failures[0];
        lines.push(["r", `✗ ${(f?.who ?? "checkout").split(".")[0]}: ${f?.msg ?? "failure"}`]);
        const paidSeller = p.transfers.some((t) => t.to === art.accounts.injector_valid);
        lines.push([paidSeller ? "r" : "g", paidSeller ? "! seller received a transfer" : "✓ nothing sent to the injector"]);
        const back = [...p.transfers, ...p.refunds].filter((t) => t.to === art.accounts.agent).reduce((acc, t) => acc + BigInt(t.amount), 0n);
        if (back > 0n) lines.push(["y", `↩ ${nearStr(back.toString())} N back to ${art.accounts.agent.split(".")[0]}`]);
        $("[data-amount]", card).textContent = paidSeller ? "?" : "0";
      }
      state.textContent = `live · read now from ${new URL(rpcUsed).host}`;
      state.classList.add("ok");
    } catch {
      state.textContent = "recorded (testnet unreachable)";
      lines =
        kind === "win"
          ? [["d", `tx ${short(hash, 8, 6)} · recorded`], ["g", `✓ ${nearStr(art.winner_seller_credit_yocto)} N → ${art.purchase_winner.seller.split(".")[0]}`]]
          : [["d", `tx ${short(hash, 8, 6)} · recorded`], ["r", "✗ Smart contract panicked: NotWinner"], ["g", "✓ no purchase recorded for quote 3"]];
    }
    await write(term, lines);
    card.classList.add("done");
  };

  let started = false;
  new IntersectionObserver((entries, obs) => {
    if (started || !entries.some((e) => e.isIntersecting)) return;
    started = true;
    obs.disconnect();
    run($("#txWin"), art.tx.checkout_winner, "win");
    setTimeout(() => run($("#txRefuse"), art.tx.refusal, "refuse"), reduced ? 0 : 600);
  }, { threshold: 0.2 }).observe($("#proofGrid"));
};

// ---------------------------------------------------------------- static sections
const fillStatic = ({ art }) => {
  const a = (hash) => `<a href="${explorer(hash)}" target="_blank" rel="noreferrer">${short(hash, 8, 6)} ↗</a>`;
  $("#bribePath").innerHTML = [
    ["Cooperative donate()", `+${nearStr(art.donate_owner_delta_yocto)} N`, "Forwarded to the buyer in the same transaction. The winner did not change.", art.tx.donate],
    ["Plain transfer", "0.01 N", "Runs no contract code, so it waits in the agent account until anyone calls sweep().", art.tx.plain_transfer],
    ["Permissionless sweep()", `+${nearStr(art.sweep_owner_delta_yocto)} N`, `Anyone can call it. The whole free balance goes to the buyer; ${nearStr(art.agent_after_sweep_yocto)} NEAR stays for storage.`, art.tx.sweep],
  ]
    .map(([h, v, p, tx]) => `<div class="slip"><span>${h}</span><b>${v}</b><p>${p}</p>${a(tx)}</div>`)
    .join("");
  const rows = [
    ["Committed policy hash", art.committed_policy_hash],
    ["OfferBook", art.accounts.offerbook],
    ["OfferBook code hash", art.code_hashes.offerbook],
    ["CheckoutGate", art.accounts.checkout],
    ["CheckoutGate code hash", art.code_hashes.checkout],
    ["Agent account", `${art.accounts.agent} · owner key + runner key scoped to execute_purchase`],
    ["Winner checkout", a(art.tx.checkout_winner)],
    ["Refused purchase", a(art.tx.refusal)],
    ["Policy commit", a(art.tx.commit_policy)],
  ];
  $("#hashes").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  $$("[data-copy]").forEach((b) =>
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        b.textContent = "Copied";
      } catch {
        b.textContent = "Select it";
      }
      setTimeout(() => (b.textContent = "Copy"), 1600);
    }),
  );
};

// ---------------------------------------------------------------- live facts + block
const liveFacts = async ({ art }) => {
  const mark = (key, value, ok) => {
    const li = $(`#facts [data-live="${key}"]`);
    if (!li) return;
    $("b", li).textContent = value;
    $("i", li).textContent = ok ? "live now" : "check failed";
    li.classList.toggle("live-ok", ok);
  };
  try {
    const [ob, cg, obAcc, cgAcc] = await Promise.all([
      rpc("query", { request_type: "view_access_key_list", finality: "final", account_id: art.accounts.offerbook }),
      rpc("query", { request_type: "view_access_key_list", finality: "final", account_id: art.accounts.checkout }),
      rpc("query", { request_type: "view_account", finality: "final", account_id: art.accounts.offerbook }),
      rpc("query", { request_type: "view_account", finality: "final", account_id: art.accounts.checkout }),
    ]);
    mark("ob", String(ob.keys.length), ob.keys.length === 0);
    mark("cg", String(cg.keys.length), cg.keys.length === 0);
    const same = b58hex(obAcc.code_hash) === art.wasm_sha256.offer_book && b58hex(cgAcc.code_hash) === art.wasm_sha256.checkout_gate;
    mark("code", same ? "✓" : "✗", same);
    const keys = $("#heroKeys");
    if (keys) keys.textContent = `GATE KEYS: ${cg.keys.length} (LIVE) · RE-CHECK WITHOUT A WALLET`;
  } catch {
    /* keep recorded values */
  }
  const tick = async () => {
    try {
      const b = await rpc("block", { finality: "final" });
      const live = $("#liveBlock");
      live.classList.add("on");
      $("b", live).textContent = `#${b.header.height.toLocaleString("en-US")}`;
    } catch {
      /* offline: leave the dot grey */
    }
  };
  tick();
  setInterval(tick, 8000);
};

// ---------------------------------------------------------------- nav spy
const spy = () => {
  const links = $$(".bar nav a");
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${e.target.id}`));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("main section[id]").forEach((s) => io.observe(s));
};

// ---------------------------------------------------------------- boot
spy();
load()
  .then((data) => {
    heroReceipt(data);
    setupArena(data);
    proof(data);
    fillStatic(data);
    liveFacts(data);
  })
  .catch((error) => {
    console.error(error);
    toast("Could not load the recorded run. Serve the repo root (npm run ui) so ../../artifacts is reachable.");
  });
