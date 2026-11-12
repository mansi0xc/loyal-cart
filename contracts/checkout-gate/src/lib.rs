use loyal_cart_shared::{
    offer_hash, offer_is_valid, Offer, OfferId, PurchaseReceipt, Quote, QuoteId,
};
use near_sdk::store::LookupMap;
use near_sdk::{env, near, AccountId, Gas, NearToken, PanicOnDefault, Promise};
use serde_json::json;

macro_rules! require_eq {
    ($a:expr, $b:expr, $msg:literal) => {
        if $a != $b {
            near_sdk::env::panic_str($msg);
        }
    };
}

const OFFER_BOOK_GAS_TGAS: u64 = 10;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct CheckoutGate {
    owner: AccountId,
    offer_book: AccountId,
    quotes: LookupMap<QuoteId, Quote>,
    winner_offers: LookupMap<QuoteId, Offer>,
    purchases_by_quote: LookupMap<QuoteId, PurchaseReceipt>,
    receipts: LookupMap<u64, PurchaseReceipt>,
    next_purchase_id: u64,
}

#[near]
impl CheckoutGate {
    #[init]
    pub fn new(offer_book: AccountId) -> Self {
        Self {
            owner: env::predecessor_account_id(),
            offer_book,
            quotes: LookupMap::new(b"q"),
            winner_offers: LookupMap::new(b"w"),
            purchases_by_quote: LookupMap::new(b"p"),
            receipts: LookupMap::new(b"r"),
            next_purchase_id: 1,
        }
    }

    pub fn register_quote(&mut self, quote: Quote, winner_offer: Offer) {
        require_eq!(
            env::predecessor_account_id(),
            self.offer_book,
            "OnlyOfferBook"
        );
        near_sdk::require!(!quote.offer_hashes.is_empty(), "EmptyQuote");
        require_eq!(
            winner_offer.offer_id,
            quote.winner_offer_id,
            "WinnerMismatch"
        );
        require_eq!(
            offer_hash(&winner_offer),
            quote.offer_hashes[0],
            "WinnerHashMismatch"
        );
        require_eq!(winner_offer.item_id, quote.item_id, "ItemMismatch");

        let quote_id = quote.quote_id;
        self.winner_offers.insert(quote_id, winner_offer);
        self.quotes.insert(quote_id, quote);

        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "loyal-cart",
                "version": "1.0.0",
                "event": "quote_registered",
                "data": { "quote_id": quote_id }
            })
        ));
    }

    #[payable]
    pub fn execute(&mut self, quote_id: QuoteId, offer_id: OfferId) -> PurchaseReceipt {
        let quote = self
            .quotes
            .get(&quote_id)
            .unwrap_or_else(|| near_sdk::env::panic_str("QuoteNotFound"))
            .clone();
        let winner = self
            .winner_offers
            .get(&quote_id)
            .unwrap_or_else(|| near_sdk::env::panic_str("QuoteNotFound"))
            .clone();
        let caller = env::predecessor_account_id();

        require_eq!(caller, quote.buyer, "NotBuyer");
        near_sdk::require!(
            !self.purchases_by_quote.contains_key(&quote_id),
            "AlreadyPurchased"
        );
        near_sdk::require!(
            env::block_height() <= quote.expires_at_block,
            "QuoteExpired"
        );
        require_eq!(offer_id, quote.winner_offer_id, "NotWinner");
        require_eq!(winner.offer_id, offer_id, "WinnerMismatch");
        require_eq!(offer_hash(&winner), quote.offer_hashes[0], "OfferChanged");
        near_sdk::require!(
            offer_is_valid(&winner, &quote.policy, quote.quote_block),
            "OfferInvalid"
        );
        assert_ne!(winner.seller, quote.buyer, "SelfPurchase");
        let amount = env::attached_deposit();
        require_eq!(amount.as_yoctonear(), winner.price.0, "WrongPayment");

        let purchase_id = self.next_purchase_id;
        self.next_purchase_id += 1;
        let receipt = PurchaseReceipt {
            purchase_id,
            quote_id,
            offer_id,
            buyer: quote.buyer.clone(),
            seller: winner.seller.clone(),
            amount: winner.price,
            block_height: env::block_height(),
            caller,
        };
        self.purchases_by_quote.insert(quote_id, receipt.clone());
        self.receipts.insert(purchase_id, receipt.clone());

        let _ =
            Promise::new(winner.seller.clone()).transfer(NearToken::from_yoctonear(winner.price.0));

        let mark_args = serde_json::to_vec(&json!({ "quote_id": quote_id }))
            .unwrap_or_else(|_| near_sdk::env::panic_str("mark_executed args cannot fail"));
        let _ = Promise::new(self.offer_book.clone()).function_call(
            "mark_executed".to_string(),
            mark_args,
            NearToken::from_yoctonear(0),
            Gas::from_tgas(OFFER_BOOK_GAS_TGAS),
        );
        let sale_args = serde_json::to_vec(&json!({ "seller": winner.seller }))
            .unwrap_or_else(|_| near_sdk::env::panic_str("record_sale args cannot fail"));
        let _ = Promise::new(self.offer_book.clone()).function_call(
            "record_sale".to_string(),
            sale_args,
            NearToken::from_yoctonear(0),
            Gas::from_tgas(OFFER_BOOK_GAS_TGAS),
        );

        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "loyal-cart",
                "version": "1.0.0",
                "event": "purchase",
                "data": {
                    "purchase_id": purchase_id,
                    "quote_id": quote_id,
                    "offer_id": offer_id,
                    "buyer": quote.buyer,
                    "seller": winner.seller,
                    "amount": winner.price.0.to_string()
                }
            })
        ));
        receipt
    }

    pub fn quote_ok(&self, quote_id: QuoteId, offer_id: OfferId) -> bool {
        let Some(quote) = self.quotes.get(&quote_id) else {
            return false;
        };
        let Some(winner) = self.winner_offers.get(&quote_id) else {
            return false;
        };
        offer_id == quote.winner_offer_id
            && winner.offer_id == offer_id
            && !quote.offer_hashes.is_empty()
            && offer_hash(winner) == quote.offer_hashes[0]
            && offer_is_valid(winner, &quote.policy, quote.quote_block)
            && env::block_height() <= quote.expires_at_block
            && !self.purchases_by_quote.contains_key(&quote_id)
            && winner.seller != quote.buyer
    }

    pub fn get_quote(&self, quote_id: QuoteId) -> Quote {
        self.quotes
            .get(&quote_id)
            .unwrap_or_else(|| near_sdk::env::panic_str("QuoteNotFound"))
            .clone()
    }

    pub fn get_winner_offer(&self, quote_id: QuoteId) -> Offer {
        self.winner_offers
            .get(&quote_id)
            .unwrap_or_else(|| near_sdk::env::panic_str("QuoteNotFound"))
            .clone()
    }

    pub fn has_quote(&self, quote_id: QuoteId) -> bool {
        self.quotes.contains_key(&quote_id)
    }

    pub fn get_purchase(&self, purchase_id: u64) -> PurchaseReceipt {
        self.receipts
            .get(&purchase_id)
            .unwrap_or_else(|| near_sdk::env::panic_str("PurchaseNotFound"))
            .clone()
    }

    pub fn get_purchase_by_quote(&self, quote_id: QuoteId) -> PurchaseReceipt {
        self.purchases_by_quote
            .get(&quote_id)
            .unwrap_or_else(|| near_sdk::env::panic_str("PurchaseNotFound"))
            .clone()
    }

    pub fn has_purchase(&self, quote_id: QuoteId) -> bool {
        self.purchases_by_quote.contains_key(&quote_id)
    }

    pub fn offer_book(&self) -> AccountId {
        self.offer_book.clone()
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use loyal_cart_shared::{policy_hash, Policy, NEAR_YOCTO};
    use near_sdk::json_types::U128;
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

    fn winner_offer(seller: &str) -> Offer {
        Offer {
            offer_id: 1,
            item_id: "gpu-hour".to_string(),
            seller: account(seller),
            price: U128(10 * NEAR_YOCTO),
            delivery_days: 2,
            expires_at_block: 500,
            metadata_hash: [1u8; 32],
        }
    }

    fn quote(buyer: &str, seller: &str) -> Quote {
        let offer = winner_offer(seller);
        let p = policy();
        Quote {
            quote_id: 1,
            buyer: account(buyer),
            item_id: "gpu-hour".to_string(),
            offer_ids: vec![1],
            offer_hashes: vec![offer_hash(&offer)],
            seller_sales: vec![0],
            policy_hash: policy_hash(&p),
            policy: p,
            winner_offer_id: 1,
            quote_block: 100,
            expires_at_block: 200,
        }
    }

    fn gate_with_quote() -> CheckoutGate {
        testing_env!(ctx("offerbook.testnet", 0, 100));
        let mut gate = CheckoutGate::new(account("offerbook.testnet"));
        let q = quote("agent.testnet", "honest-a.testnet");
        let offer = winner_offer("honest-a.testnet");
        gate.register_quote(q, offer);
        gate
    }

    #[test]
    fn register_then_execute_pays_the_seller() {
        let mut gate = gate_with_quote();
        testing_env!(ctx("agent.testnet", 10 * NEAR_YOCTO, 100));
        let receipt = gate.execute(1, 1);
        assert_eq!(receipt.seller, account("honest-a.testnet"));
        assert_eq!(receipt.buyer, account("agent.testnet"));
        assert_eq!(receipt.amount, U128(10 * NEAR_YOCTO));
        assert_eq!(gate.get_purchase(1).seller, account("honest-a.testnet"));
        assert_eq!(gate.get_purchase_by_quote(1).purchase_id, 1);
    }

    #[test]
    #[should_panic(expected = "NotWinner")]
    fn non_winner_is_refused() {
        let mut gate = gate_with_quote();
        testing_env!(ctx("agent.testnet", 10 * NEAR_YOCTO, 100));
        gate.execute(1, 2);
    }

    #[test]
    #[should_panic(expected = "WrongPayment")]
    fn wrong_payment_is_refused() {
        let mut gate = gate_with_quote();
        testing_env!(ctx("agent.testnet", 9 * NEAR_YOCTO, 100));
        gate.execute(1, 1);
    }

    #[test]
    #[should_panic(expected = "NotBuyer")]
    fn a_non_buyer_cannot_execute() {
        let mut gate = gate_with_quote();
        testing_env!(ctx("mallory.testnet", 10 * NEAR_YOCTO, 100));
        gate.execute(1, 1);
    }

    #[test]
    #[should_panic(expected = "QuoteExpired")]
    fn an_expired_quote_is_refused() {
        let mut gate = gate_with_quote();
        testing_env!(ctx("agent.testnet", 10 * NEAR_YOCTO, 201));
        gate.execute(1, 1);
    }

    #[test]
    #[should_panic(expected = "AlreadyPurchased")]
    fn a_quote_can_only_be_purchased_once() {
        let mut gate = gate_with_quote();
        testing_env!(ctx("agent.testnet", 10 * NEAR_YOCTO, 100));
        gate.execute(1, 1);
        testing_env!(ctx("agent.testnet", 10 * NEAR_YOCTO, 101));
        gate.execute(1, 1);
    }

    #[test]
    #[should_panic(expected = "SelfPurchase")]
    fn a_seller_cannot_be_the_buyer() {
        let mut gate = gate_with_quote();
        testing_env!(ctx("offerbook.testnet", 0, 100));
        let mut q = quote("honest-a.testnet", "honest-a.testnet");
        q.quote_id = 2;
        let offer = winner_offer("honest-a.testnet");
        gate.register_quote(q, offer);
        testing_env!(ctx("honest-a.testnet", 10 * NEAR_YOCTO, 100));
        gate.execute(2, 1);
    }

    #[test]
    #[should_panic(expected = "WinnerHashMismatch")]
    fn a_tampered_winner_offer_is_refused_at_registration() {
        testing_env!(ctx("offerbook.testnet", 0, 100));
        let mut gate = CheckoutGate::new(account("offerbook.testnet"));
        let q = quote("agent.testnet", "honest-a.testnet");
        let mut offer = winner_offer("honest-a.testnet");
        offer.price = U128(9 * NEAR_YOCTO);
        gate.register_quote(q, offer);
    }

    #[test]
    fn quote_ok_is_true_for_the_winner_and_false_for_a_non_winner() {
        let gate = gate_with_quote();
        testing_env!(ctx("agent.testnet", 0, 100));
        assert!(gate.quote_ok(1, 1));
        assert!(!gate.quote_ok(1, 2));
        assert!(!gate.quote_ok(99, 1));
    }
}
