# API surface and fund recipients

Source audit for C17: every public method on the three contracts and the only
account that can receive funds from it. This is a source-level enumeration, not a
proof about future upgrades; the deployed contracts are locked (0 keys).

## AgentAccount

| Method | Caller | Funds in | Funds out |
|---|---|---|---|
| `new` | deployer/owner | 0 | none |
| `deposit` | owner | attached NEAR | none (balance stays) |
| `commit_policy` | owner | 0 | none |
| `create_quote` | owner | 0 | none; cross-calls OfferBook |
| `execute_purchase` | runner or owner | 0 | attached `amount` goes to CheckoutGate; the gate pays the winning seller only |
| `donate` | anyone | attached NEAR | same amount to `owner` |
| `sweep` | anyone | 0 | free balance minus computed storage reserve to `owner` |
| `get_owner` / `get_agent` / `get_checkout_gate` / `get_offer_book` / `get_committed_policy_hash` / `get_balance` | view | 0 | none |

No method names the agent, the runner or any third party as a transfer recipient.
`donate` and `sweep` name `owner`; `execute_purchase` names the CheckoutGate, which
names the seller of the winning offer.

## CheckoutGate

| Method | Caller | Funds in | Funds out |
|---|---|---|---|
| `new` | deployer/owner | 0 | none |
| `register_quote` | OfferBook only | 0 | none |
| `execute` | AgentAccount only | attached `amount` | exact `amount` to the winning `seller`; any non-winner panics |
| `quote_ok` / `get_quote` / `get_winner_offer` / `has_quote` / `get_purchase` / `get_purchase_by_quote` / `has_purchase` / `offer_book` / `owner` | view | 0 | none |

## OfferBook

| Method | Caller | Funds in | Funds out |
|---|---|---|---|
| `new` | deployer | 0 | none |
| `post_offer` | anyone | 0 | none |
| `create_quote` | anyone | 0 | none; cross-calls CheckoutGate |
| `mark_executed` | CheckoutGate only | 0 | none |
| `record_sale` | CheckoutGate only | 0 | none |
| `set_checkout_gate` | owner, once | 0 | none |
| `get_offer` / `get_offers_by_item` / `get_sales` / `get_quote` / `quote_hash` / `is_quote_executed` / `owner` / `checkout_gate` | view | 0 | none |

## Tests and testnet evidence

- `non_winner_is_refused` and the testnet refusal `4Hfakr…` show the only
  payout path rejects a non-winner.
- `a_merchant_donation_is_forwarded` and the testnet donate `4MeYcu…` show
  `donate` → owner.
- The sandbox and testnet sweep show `sweep` → owner.
- The CP3 `view_access_key_list` check shows OfferBook and CheckoutGate have no
  full-access key; AgentAccount has the owner key plus the scoped runner key.

**Limit:** this audit covers the current source. A full-access key on the
AgentAccount can delete the account and move its balance; that is a key risk,
not a method path. A future upgrade would invalidate the audit, which is why the
deployed contracts are locked.
