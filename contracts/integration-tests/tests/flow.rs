use anyhow::Result;
use loyal_cart_shared::{policy_hash, Policy, NEAR_YOCTO};
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract, DevNetwork, Worker};
use serde_json::json;

fn policy() -> Policy {
    Policy {
        price_weight: 60,
        delivery_weight: 20,
        reputation_weight: 20,
        max_price: near_sdk::json_types::U128(15 * NEAR_YOCTO),
        min_delivery_days: 1,
        excluded_sellers: vec![],
    }
}

fn policy_json() -> serde_json::Value {
    json!({
        "price_weight": 60,
        "delivery_weight": 20,
        "reputation_weight": 20,
        "max_price": (15 * NEAR_YOCTO).to_string(),
        "min_delivery_days": 1,
        "excluded_sellers": []
    })
}

fn price_json(near: u128) -> String {
    (near * NEAR_YOCTO).to_string()
}

async fn post_offer(
    merchant: &Account,
    book: &Contract,
    id: u8,
    price_near: u128,
    delivery_days: u16,
) -> Result<()> {
    merchant
        .call(book.id(), "post_offer")
        .args_json(json!({
            "item_id": "gpu-hour",
            "price": price_json(price_near),
            "delivery_days": delivery_days,
            "expires_at_block": 10_000_000u64,
            "metadata_hash": vec![id; 32]
        }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn create_quote(owner: &Account, agent_account: &Contract, hash: [u8; 32]) -> Result<()> {
    owner
        .call(agent_account.id(), "create_quote")
        .args_json(json!({
            "item_id": "gpu-hour",
            "policy": policy_json(),
            "policy_hash": hash,
            "ttl_blocks": 1000u64
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn setup(
    worker: &Worker<impl DevNetwork + 'static>,
) -> Result<(Contract, Contract, Contract, Account, Account, Account)> {
    let wasm = |name: &str| -> Result<Vec<u8>> {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../target/wasm32-unknown-unknown/release")
            .join(format!("loyal_cart_{name}.wasm"));
        std::fs::read(&path).map_err(|error| {
            anyhow::anyhow!(
                "cannot read {}: {error}. Run `make build-wasm` first.",
                path.display()
            )
        })
    };
    let offer_book_wasm = wasm("offer_book")?;
    let gate_wasm = wasm("checkout_gate")?;
    let agent_wasm = wasm("agent_account")?;

    let offer_book = worker.dev_deploy(&offer_book_wasm).await?;
    let gate = worker.dev_deploy(&gate_wasm).await?;
    let agent_account = worker.dev_deploy(&agent_wasm).await?;

    let owner = worker.dev_create_account().await?;
    let agent = worker.dev_create_account().await?;
    let merchant = worker.dev_create_account().await?;

    owner
        .call(offer_book.id(), "new")
        .transact()
        .await?
        .into_result()?;
    owner
        .call(offer_book.id(), "set_checkout_gate")
        .args_json(json!({ "gate": gate.id() }))
        .transact()
        .await?
        .into_result()?;
    owner
        .call(gate.id(), "new")
        .args_json(json!({ "offer_book": offer_book.id() }))
        .transact()
        .await?
        .into_result()?;
    owner
        .call(agent_account.id(), "new")
        .args_json(json!({
            "owner": owner.id(),
            "agent": agent.id(),
            "checkout_gate": gate.id(),
            "offer_book": offer_book.id()
        }))
        .transact()
        .await?
        .into_result()?;
    owner
        .call(agent_account.id(), "deposit")
        .deposit(NearToken::from_near(50))
        .transact()
        .await?
        .into_result()?;

    Ok((offer_book, gate, agent_account, owner, agent, merchant))
}

#[ignore = "requires prebuilt wasm; run `make test-integration`"]
#[tokio::test]
async fn quote_checkout_kickback_and_non_winner_refusal() -> Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let (offer_book, gate, agent_account, owner, agent, merchant) = setup(&worker).await?;
    let seller = worker.dev_create_account().await?;

    post_offer(&seller, &offer_book, 1, 10, 2).await?;
    post_offer(&merchant, &offer_book, 2, 11, 1).await?;

    let p = policy();
    let hash = policy_hash(&p);
    owner
        .call(agent_account.id(), "commit_policy")
        .args_json(json!({ "policy_hash": hash }))
        .transact()
        .await?
        .into_result()?;
    create_quote(&owner, &agent_account, hash).await?;

    let has_quote: bool = gate
        .view("has_quote")
        .args_json(json!({ "quote_id": 1 }))
        .await?
        .json()?;
    assert!(
        has_quote,
        "the OfferBook must register the quote with the gate"
    );

    let seller_before = worker.view_account(seller.id()).await?.balance;
    agent
        .call(agent_account.id(), "execute_purchase")
        .args_json(json!({
            "quote_id": 1,
            "offer_id": 1,
            "amount": price_json(10)
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let seller_after = worker.view_account(seller.id()).await?.balance;
    assert_eq!(
        seller_after.as_yoctonear() - seller_before.as_yoctonear(),
        10 * NEAR_YOCTO,
        "the winner's seller must receive exactly the offer price"
    );

    let purchase: serde_json::Value = gate
        .view("get_purchase_by_quote")
        .args_json(json!({ "quote_id": 1 }))
        .await?
        .json()?;
    assert_eq!(purchase["seller"], json!(seller.id().to_string()));
    assert_eq!(purchase["amount"], json!(price_json(10)));

    create_quote(&owner, &agent_account, hash).await?;
    let mut quote_2_ready = false;
    for _ in 0..20 {
        quote_2_ready = gate
            .view("has_quote")
            .args_json(json!({ "quote_id": 2 }))
            .await?
            .json()?;
        if quote_2_ready {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
    }
    assert!(
        quote_2_ready,
        "the gate must register quote 2 before the refusal"
    );
    let seller_before_refusal = worker.view_account(seller.id()).await?.balance;
    let refusal = agent
        .call(agent_account.id(), "execute_purchase")
        .args_json(json!({
            "quote_id": 2,
            "offer_id": 2,
            "amount": price_json(11)
        }))
        .max_gas()
        .transact()
        .await?;
    let refusal_debug = format!("{:?}", refusal.receipt_outcomes());
    let failed = refusal
        .receipt_outcomes()
        .iter()
        .any(|outcome| format!("{:?}", outcome).contains("Failure"));
    assert!(
        failed,
        "the gate must fail the non-winner promise; receipts: {refusal_debug}"
    );
    assert!(
        refusal_debug.contains("NotWinner"),
        "the refusal must name NotWinner; receipts: {refusal_debug}"
    );
    let has_purchase: bool = gate
        .view("has_purchase")
        .args_json(json!({ "quote_id": 2 }))
        .await?
        .json()?;
    assert!(!has_purchase, "a refused checkout must not be recorded");
    let seller_after_refusal = worker.view_account(seller.id()).await?.balance;
    assert_eq!(
        seller_after_refusal.as_yoctonear(),
        seller_before_refusal.as_yoctonear(),
        "a refused checkout must not pay"
    );

    let owner_before = worker.view_account(owner.id()).await?.balance;
    merchant
        .call(agent_account.id(), "donate")
        .deposit(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;
    let owner_after = worker.view_account(owner.id()).await?.balance;
    assert_eq!(
        owner_after.as_yoctonear() - owner_before.as_yoctonear(),
        5 * NEAR_YOCTO,
        "a merchant transfer to the agent account must reach the owner"
    );

    let agent_before_plain = worker.view_account(agent_account.id()).await?.balance;
    owner
        .transfer_near(agent_account.id(), NearToken::from_millinear(10))
        .await?
        .into_result()?;
    let agent_after_transfer = worker.view_account(agent_account.id()).await?.balance;
    assert_eq!(
        agent_after_transfer.as_yoctonear() - agent_before_plain.as_yoctonear(),
        NEAR_YOCTO / 100,
        "a plain transfer must land on the agent account"
    );

    let owner_before_sweep = worker.view_account(owner.id()).await?.balance;
    agent
        .call(agent_account.id(), "sweep")
        .transact()
        .await?
        .into_result()?;
    let owner_after_sweep = worker.view_account(owner.id()).await?.balance;
    let agent_after_sweep = worker.view_account(agent_account.id()).await?.balance;
    assert!(
        owner_after_sweep.as_yoctonear() > owner_before_sweep.as_yoctonear(),
        "anyone can sweep a plain transfer to the owner"
    );
    assert!(
        agent_after_sweep.as_yoctonear() < agent_after_transfer.as_yoctonear(),
        "the sweep must move the agent balance out"
    );

    Ok(())
}
