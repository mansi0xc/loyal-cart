use loyal_cart_shared::{OfferId, Policy, QuoteId};
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};
use serde_json::json;

const STORAGE_RESERVE_YOCTO: u128 = 50_000_000_000_000_000_000_000;
const OFFER_BOOK_GAS_TGAS: u64 = 30;
const CHECKOUT_GATE_GAS_TGAS: u64 = 50;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct AgentAccount {
    owner: AccountId,
    agent: AccountId,
    checkout_gate: AccountId,
    offer_book: AccountId,
    committed_policy_hash: Option<[u8; 32]>,
}

#[near]
impl AgentAccount {
    #[init]
    pub fn new(
        owner: AccountId,
        agent: AccountId,
        checkout_gate: AccountId,
        offer_book: AccountId,
    ) -> Self {
        Self {
            owner,
            agent,
            checkout_gate,
            offer_book,
            committed_policy_hash: None,
        }
    }

    #[payable]
    pub fn deposit(&mut self) {
        assert_eq!(env::predecessor_account_id(), self.owner, "OnlyOwner");
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "loyal-cart",
                "version": "1.0.0",
                "event": "deposit",
                "data": {
                    "owner": self.owner,
                    "amount": env::attached_deposit().as_yoctonear().to_string()
                }
            })
        ));
    }

    pub fn commit_policy(&mut self, policy_hash: [u8; 32]) {
        assert_eq!(env::predecessor_account_id(), self.owner, "OnlyOwner");
        assert!(
            self.committed_policy_hash.is_none(),
            "PolicyAlreadyCommitted"
        );
        self.committed_policy_hash = Some(policy_hash);
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "loyal-cart",
                "version": "1.0.0",
                "event": "policy_committed",
                "data": { "policy_hash": policy_hash }
            })
        ));
    }

    pub fn create_quote(
        &self,
        item_id: String,
        policy: Policy,
        policy_hash: [u8; 32],
        ttl_blocks: u64,
    ) -> Promise {
        assert_eq!(env::predecessor_account_id(), self.owner, "OnlyOwner");
        let committed = self.committed_policy_hash.expect("PolicyNotCommitted");
        assert_eq!(committed, policy_hash, "PolicyMismatch");
        let args = serde_json::to_vec(&json!({
            "item_id": item_id,
            "policy": policy,
            "policy_hash": policy_hash,
            "ttl_blocks": ttl_blocks
        }))
        .expect("create_quote args cannot fail");
        Promise::new(self.offer_book.clone()).function_call(
            "create_quote".to_string(),
            args,
            NearToken::from_yoctonear(0),
            Gas::from_tgas(OFFER_BOOK_GAS_TGAS),
        )
    }

    pub fn execute_purchase(&self, quote_id: QuoteId, offer_id: OfferId, amount: U128) -> Promise {
        assert_eq!(env::predecessor_account_id(), self.agent, "OnlyAgent");
        let args = serde_json::to_vec(&json!({
            "quote_id": quote_id,
            "offer_id": offer_id
        }))
        .expect("execute_purchase args cannot fail");
        Promise::new(self.checkout_gate.clone()).function_call(
            "execute".to_string(),
            args,
            NearToken::from_yoctonear(amount.0),
            Gas::from_tgas(CHECKOUT_GATE_GAS_TGAS),
        )
    }

    #[payable]
    pub fn donate(&mut self) {
        let amount = env::attached_deposit();
        if amount.as_yoctonear() > 0 {
            let _ = Promise::new(self.owner.clone()).transfer(amount);
        }
        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "loyal-cart",
                "version": "1.0.0",
                "event": "forwarded",
                "data": {
                    "from": env::predecessor_account_id(),
                    "to": self.owner,
                    "amount": amount.as_yoctonear().to_string()
                }
            })
        ));
    }

    pub fn sweep(&mut self) {
        let balance = env::account_balance().as_yoctonear();
        let sweepable = balance.saturating_sub(STORAGE_RESERVE_YOCTO);
        if sweepable > 0 {
            let _ = Promise::new(self.owner.clone()).transfer(NearToken::from_yoctonear(sweepable));
            env::log_str(&format!(
                "EVENT_JSON:{}",
                json!({
                    "standard": "loyal-cart",
                    "version": "1.0.0",
                    "event": "swept",
                    "data": {
                        "to": self.owner,
                        "amount": sweepable.to_string()
                    }
                })
            ));
        }
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_agent(&self) -> AccountId {
        self.agent.clone()
    }

    pub fn get_checkout_gate(&self) -> AccountId {
        self.checkout_gate.clone()
    }

    pub fn get_offer_book(&self) -> AccountId {
        self.offer_book.clone()
    }

    pub fn get_committed_policy_hash(&self) -> Option<[u8; 32]> {
        self.committed_policy_hash
    }

    pub fn get_balance(&self) -> U128 {
        U128(env::account_balance().as_yoctonear())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use loyal_cart_shared::{policy_hash, NEAR_YOCTO};
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, VMContext};

    fn account(id: &str) -> AccountId {
        id.parse().unwrap()
    }

    fn ctx(predecessor: &str, deposit: u128, block_height: u64) -> VMContext {
        VMContextBuilder::new()
            .predecessor_account_id(account(predecessor))
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_height(block_height)
            .account_balance(NearToken::from_yoctonear(100 * NEAR_YOCTO))
            .build()
    }

    fn policy() -> Policy {
        Policy {
            price_weight: 60,
            delivery_weight: 20,
            reputation_weight: 20,
            max_price: U128(15 * NEAR_YOCTO),
            min_delivery_days: 1,
            excluded_sellers: vec![],
        }
    }

    fn account_contract() -> AgentAccount {
        testing_env!(ctx("owner.testnet", 0, 100));
        AgentAccount::new(
            account("owner.testnet"),
            account("agent.testnet"),
            account("gate.testnet"),
            account("offerbook.testnet"),
        )
    }

    #[test]
    fn owner_commits_a_policy_one_way() {
        let mut acct = account_contract();
        let hash = policy_hash(&policy());
        acct.commit_policy(hash);
        assert_eq!(acct.get_committed_policy_hash(), Some(hash));
    }

    #[test]
    #[should_panic(expected = "PolicyAlreadyCommitted")]
    fn a_policy_cannot_be_committed_twice() {
        let mut acct = account_contract();
        let hash = policy_hash(&policy());
        acct.commit_policy(hash);
        acct.commit_policy(hash);
    }

    #[test]
    #[should_panic(expected = "OnlyOwner")]
    fn the_agent_cannot_commit_the_policy() {
        let mut acct = account_contract();
        testing_env!(ctx("agent.testnet", 0, 100));
        acct.commit_policy(policy_hash(&policy()));
    }

    #[test]
    #[should_panic(expected = "PolicyNotCommitted")]
    fn create_quote_requires_a_commitment() {
        let acct = account_contract();
        let p = policy();
        let _ = acct.create_quote("gpu-hour".to_string(), p.clone(), policy_hash(&p), 100);
    }

    #[test]
    #[should_panic(expected = "PolicyMismatch")]
    fn create_quote_rejects_a_different_hash() {
        let mut acct = account_contract();
        let p = policy();
        acct.commit_policy(policy_hash(&p));
        let _ = acct.create_quote("gpu-hour".to_string(), p, [0u8; 32], 100);
    }

    #[test]
    fn owner_creates_a_quote_after_commitment() {
        let mut acct = account_contract();
        let p = policy();
        let hash = policy_hash(&p);
        acct.commit_policy(hash);
        let _ = acct.create_quote("gpu-hour".to_string(), p, hash, 100);
    }

    #[test]
    fn the_agent_can_execute_a_purchase() {
        let acct = account_contract();
        testing_env!(ctx("agent.testnet", 0, 100));
        let _ = acct.execute_purchase(1, 1, U128(10 * NEAR_YOCTO));
    }

    #[test]
    #[should_panic(expected = "OnlyAgent")]
    fn a_non_agent_cannot_execute() {
        let acct = account_contract();
        testing_env!(ctx("mallory.testnet", 0, 100));
        let _ = acct.execute_purchase(1, 1, U128(10 * NEAR_YOCTO));
    }

    #[test]
    fn a_merchant_donation_is_forwarded() {
        let mut acct = account_contract();
        testing_env!(ctx("crooked.testnet", 5 * NEAR_YOCTO, 100));
        acct.donate();
    }

    #[test]
    #[should_panic(expected = "OnlyOwner")]
    fn a_non_owner_cannot_deposit() {
        let mut acct = account_contract();
        testing_env!(ctx("mallory.testnet", 5 * NEAR_YOCTO, 100));
        acct.deposit();
    }

    #[test]
    fn the_owner_can_deposit() {
        let mut acct = account_contract();
        testing_env!(ctx("owner.testnet", 5 * NEAR_YOCTO, 100));
        acct.deposit();
    }

    #[test]
    fn anyone_can_sweep_to_the_owner() {
        let mut acct = account_contract();
        testing_env!(ctx("mallory.testnet", 0, 100));
        acct.sweep();
    }
}
