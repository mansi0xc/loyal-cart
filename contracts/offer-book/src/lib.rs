use loyal_cart_shared::{
    offer_hash, offer_is_valid, quote_hash as compute_quote_hash, rank_offers, valid_item_id,
    valid_policy, valid_price, Offer, OfferId, Policy, Quote, QuoteId, MAX_DELIVERY_DAYS,
    MAX_OFFERS_PER_QUOTE, MAX_TTL_BLOCKS,
};
use near_sdk::json_types::U128;
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

const MIN_EXPIRY_BLOCKS: u64 = 10;
const GATE_GAS_TGAS: u64 = 20;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OfferBook {
    owner: AccountId,
    checkout_gate: Option<AccountId>,
    offers: LookupMap<OfferId, Offer>,
    offers_by_item: LookupMap<String, Vec<OfferId>>,
    quotes: LookupMap<QuoteId, Quote>,
    executed_quotes: LookupMap<QuoteId, bool>,
    sales: LookupMap<AccountId, u64>,
    next_offer_id: OfferId,
    next_quote_id: QuoteId,
}

#[near]
impl OfferBook {
    #[init]
    pub fn new() -> Self {
        Self {
            owner: env::predecessor_account_id(),
            checkout_gate: None,
            offers: LookupMap::new(b"o"),
            offers_by_item: LookupMap::new(b"i"),
            quotes: LookupMap::new(b"q"),
            executed_quotes: LookupMap::new(b"e"),
            sales: LookupMap::new(b"s"),
            next_offer_id: 1,
            next_quote_id: 1,
        }
    }

    pub fn post_offer(
        &mut self,
        item_id: String,
        price: U128,
        delivery_days: u16,
        expires_at_block: u64,
        metadata_hash: [u8; 32],
    ) -> OfferId {
        near_sdk::require!(valid_item_id(&item_id), "InvalidItemId");
        near_sdk::require!(valid_price(price.0), "InvalidPrice");
        near_sdk::require!(delivery_days <= MAX_DELIVERY_DAYS, "InvalidDelivery");
        near_sdk::require!(
            expires_at_block > env::block_height() + MIN_EXPIRY_BLOCKS,
            "ExpiryTooSoon"
        );

        let seller = env::predecessor_account_id();
        let mut ids = self
            .offers_by_item
            .get(&item_id)
            .cloned()
            .unwrap_or_default();
        for existing_id in &ids {
            let existing = self
                .offers
                .get(existing_id)
                .unwrap_or_else(|| near_sdk::env::panic_str("OfferNotFound"));
            near_sdk::require!(
                !(existing.seller == seller && existing.expires_at_block > env::block_height()),
                "OfferAlreadyLive"
            );
        }
        let offer_id = self.next_offer_id;
        self.next_offer_id += 1;
        let offer = Offer {
            offer_id,
            item_id: item_id.clone(),
            seller: seller.clone(),
            price,
            delivery_days,
            expires_at_block,
            metadata_hash,
        };
        self.offers.insert(offer_id, offer.clone());
        ids.push(offer_id);
        self.offers_by_item.insert(item_id, ids);

        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "loyal-cart",
                "version": "1.0.0",
                "event": "offer_posted",
                "data": {
                    "offer_id": offer_id,
                    "seller": seller,
                    "item_id": offer.item_id,
                    "price": offer.price.0.to_string(),
                    "delivery_days": offer.delivery_days,
                    "expires_at_block": offer.expires_at_block
                }
            })
        ));
        offer_id
    }

    pub fn create_quote(
        &mut self,
        item_id: String,
        policy: Policy,
        policy_hash: [u8; 32],
        ttl_blocks: u64,
    ) -> QuoteId {
        require_eq!(
            policy_hash,
            loyal_cart_shared::policy_hash(&policy),
            "PolicyHashMismatch"
        );
        near_sdk::require!(valid_policy(&policy), "InvalidPolicy");
        near_sdk::require!(ttl_blocks > 0 && ttl_blocks <= MAX_TTL_BLOCKS, "InvalidTtl");
        let gate = self
            .checkout_gate
            .clone()
            .unwrap_or_else(|| near_sdk::env::panic_str("GateNotSet"));
        let buyer = env::predecessor_account_id();
        let quote_block = env::block_height();

        let ids = self
            .offers_by_item
            .get(&item_id)
            .cloned()
            .unwrap_or_default();
        let mut valid: Vec<(Offer, u64)> = Vec::new();
        for id in ids {
            let offer = self
                .offers
                .get(&id)
                .unwrap_or_else(|| near_sdk::env::panic_str("OfferNotFound"))
                .clone();
            if offer_is_valid(&offer, &policy, quote_block) {
                let sales = *self.sales.get(&offer.seller).unwrap_or(&0);
                valid.push((offer, sales));
            }
        }
        near_sdk::require!(!valid.is_empty(), "NoValidOffers");
        near_sdk::require!(valid.len() <= MAX_OFFERS_PER_QUOTE, "TooManyOffers");

        let ranked = rank_offers(&valid, &policy, quote_block);
        near_sdk::require!(!ranked.is_empty(), "NoValidOffers");

        let mut offer_ids = Vec::with_capacity(ranked.len());
        let mut offer_hashes = Vec::with_capacity(ranked.len());
        let mut seller_sales = Vec::with_capacity(ranked.len());
        for ranked_offer in &ranked {
            let (offer, sales) = valid
                .iter()
                .find(|(offer, _)| offer.offer_id == ranked_offer.offer_id)
                .unwrap_or_else(|| near_sdk::env::panic_str("ranked offer missing"));
            offer_ids.push(offer.offer_id);
            offer_hashes.push(offer_hash(offer));
            seller_sales.push(*sales);
        }
        let winner_offer_id = offer_ids[0];
        let winner_offer = valid
            .iter()
            .find(|(offer, _)| offer.offer_id == winner_offer_id)
            .unwrap_or_else(|| near_sdk::env::panic_str("winner missing"))
            .0
            .clone();

        let quote_id = self.next_quote_id;
        self.next_quote_id += 1;
        let quote = Quote {
            quote_id,
            buyer: buyer.clone(),
            item_id,
            offer_ids,
            offer_hashes,
            seller_sales,
            policy,
            policy_hash,
            winner_offer_id,
            quote_block,
            expires_at_block: quote_block + ttl_blocks,
        };
        self.quotes.insert(quote_id, quote.clone());

        let args = serde_json::to_vec(&json!({
            "quote": quote,
            "winner_offer": winner_offer
        }))
        .unwrap_or_else(|_| near_sdk::env::panic_str("quote serialization cannot fail"));
        let _ = Promise::new(gate).function_call(
            "register_quote".to_string(),
            args,
            NearToken::from_yoctonear(0),
            Gas::from_tgas(GATE_GAS_TGAS),
        );

        env::log_str(&format!(
            "EVENT_JSON:{}",
            json!({
                "standard": "loyal-cart",
                "version": "1.0.0",
                "event": "quote_created",
                "data": {
                    "quote_id": quote_id,
                    "buyer": buyer,
                    "item_id": quote.item_id,
                    "winner_offer_id": winner_offer_id,
                    "offer_count": quote.offer_ids.len(),
                    "quote_block": quote.quote_block,
                    "expires_at_block": quote.expires_at_block
                }
            })
        ));
        quote_id
    }

    pub fn mark_executed(&mut self, quote_id: QuoteId) {
        require_eq!(
            env::predecessor_account_id(),
            self.checkout_gate
                .clone()
                .unwrap_or_else(|| near_sdk::env::panic_str("GateNotSet")),
            "OnlyCheckoutGate"
        );
        self.executed_quotes.insert(quote_id, true);
    }

    pub fn record_sale(&mut self, seller: AccountId) {
        require_eq!(
            env::predecessor_account_id(),
            self.checkout_gate
                .clone()
                .unwrap_or_else(|| near_sdk::env::panic_str("GateNotSet")),
            "OnlyCheckoutGate"
        );
        let count = *self.sales.get(&seller).unwrap_or(&0);
        self.sales.insert(seller, count + 1);
    }

    pub fn set_checkout_gate(&mut self, gate: AccountId) {
        require_eq!(env::predecessor_account_id(), self.owner, "OnlyOwner");
        near_sdk::require!(self.checkout_gate.is_none(), "GateAlreadySet");
        self.checkout_gate = Some(gate);
    }

    pub fn get_offer(&self, offer_id: OfferId) -> Offer {
        self.offers
            .get(&offer_id)
            .unwrap_or_else(|| near_sdk::env::panic_str("OfferNotFound"))
            .clone()
    }

    pub fn get_offers_by_item(&self, item_id: String) -> Vec<OfferId> {
        self.offers_by_item
            .get(&item_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn get_sales(&self, seller: AccountId) -> u64 {
        *self.sales.get(&seller).unwrap_or(&0)
    }

    pub fn get_quote(&self, quote_id: QuoteId) -> Quote {
        self.quotes
            .get(&quote_id)
            .unwrap_or_else(|| near_sdk::env::panic_str("QuoteNotFound"))
            .clone()
    }

    pub fn quote_hash(&self, quote_id: QuoteId) -> [u8; 32] {
        compute_quote_hash(&self.get_quote(quote_id))
    }

    pub fn is_quote_executed(&self, quote_id: QuoteId) -> bool {
        *self.executed_quotes.get(&quote_id).unwrap_or(&false)
    }

    pub fn owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn checkout_gate(&self) -> Option<AccountId> {
        self.checkout_gate.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use loyal_cart_shared::{policy_hash, NEAR_YOCTO, PRICE_UNIT_YOCTO};
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::{testing_env, NearToken, VMContext};

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
            excluded_sellers: vec![account("excluded.testnet")],
        }
    }

    fn book_with_gate() -> OfferBook {
        testing_env!(ctx("owner.testnet", 0, 100));
        let mut book = OfferBook::new();
        book.set_checkout_gate(account("gate.testnet"));
        book
    }

    fn post(book: &mut OfferBook, seller: &str, id: u64, price: U128, delivery: u16) {
        testing_env!(ctx(seller, 0, 100));
        let posted = book.post_offer("gpu-hour".to_string(), price, delivery, 500, [id as u8; 32]);
        assert_eq!(posted, id);
    }

    #[test]
    fn post_offer_stores_an_immutable_offer() {
        let mut book = book_with_gate();
        post(&mut book, "honest-a.testnet", 1, U128(10 * NEAR_YOCTO), 2);
        let offer = book.get_offer(1);
        assert_eq!(offer.seller, account("honest-a.testnet"));
        assert_eq!(offer.price, U128(10 * NEAR_YOCTO));
        assert_eq!(offer.delivery_days, 2);
        assert_eq!(book.get_offers_by_item("gpu-hour".to_string()), vec![1]);
    }

    #[test]
    #[should_panic(expected = "InvalidItemId")]
    fn post_offer_rejects_a_bad_slug() {
        let mut book = book_with_gate();
        testing_env!(ctx("seller.testnet", 0, 100));
        book.post_offer(
            "GPU Hour".to_string(),
            U128(10 * NEAR_YOCTO),
            2,
            500,
            [1u8; 32],
        );
    }

    #[test]
    #[should_panic(expected = "InvalidPrice")]
    fn post_offer_rejects_a_sub_unit_price() {
        let mut book = book_with_gate();
        testing_env!(ctx("seller.testnet", 0, 100));
        book.post_offer(
            "gpu-hour".to_string(),
            U128(PRICE_UNIT_YOCTO + 1),
            2,
            500,
            [1u8; 32],
        );
    }

    #[test]
    fn create_quote_snapshots_all_valid_offers_and_picks_the_winner() {
        let mut book = book_with_gate();
        post(&mut book, "honest-a.testnet", 1, U128(10 * NEAR_YOCTO), 2);
        post(&mut book, "honest-b.testnet", 2, U128(11 * NEAR_YOCTO), 1);
        post(&mut book, "crooked.testnet", 3, U128(12 * NEAR_YOCTO), 3);
        let p = policy();
        let hash = policy_hash(&p);
        testing_env!(ctx("agent.testnet", 0, 100));
        let quote_id = book.create_quote("gpu-hour".to_string(), p.clone(), hash, 100);
        let quote = book.get_quote(quote_id);
        assert_eq!(quote.buyer, account("agent.testnet"));
        assert_eq!(quote.offer_ids.len(), 3);
        assert_eq!(quote.winner_offer_id, 1);
        assert_eq!(quote.offer_ids[0], 1);
        assert_eq!(quote.offer_hashes[0], offer_hash(&book.get_offer(1)));
        assert_eq!(quote.seller_sales[0], 0);
        assert_eq!(quote.expires_at_block, 200);
    }

    #[test]
    fn create_quote_filters_expired_excluded_and_over_price_offers() {
        let mut book = book_with_gate();
        post(&mut book, "honest-a.testnet", 1, U128(10 * NEAR_YOCTO), 2);
        post(&mut book, "excluded.testnet", 2, U128(7 * NEAR_YOCTO), 1);
        post(&mut book, "injector.testnet", 3, U128(20 * NEAR_YOCTO), 30);
        let p = policy();
        let hash = policy_hash(&p);
        testing_env!(ctx("agent.testnet", 0, 100));
        let quote_id = book.create_quote("gpu-hour".to_string(), p, hash, 100);
        let quote = book.get_quote(quote_id);
        assert_eq!(quote.offer_ids, vec![1]);
    }

    #[test]
    #[should_panic(expected = "PolicyHashMismatch")]
    fn create_quote_rejects_a_policy_hash_mismatch() {
        let mut book = book_with_gate();
        post(&mut book, "honest-a.testnet", 1, U128(10 * NEAR_YOCTO), 2);
        let p = policy();
        testing_env!(ctx("agent.testnet", 0, 100));
        book.create_quote("gpu-hour".to_string(), p, [0u8; 32], 100);
    }

    #[test]
    #[should_panic(expected = "NoValidOffers")]
    fn create_quote_with_no_valid_offers_panics() {
        let book = {
            let mut book = book_with_gate();
            post(&mut book, "injector.testnet", 1, U128(20 * NEAR_YOCTO), 30);
            book
        };
        let p = policy();
        let hash = policy_hash(&p);
        testing_env!(ctx("agent.testnet", 0, 100));
        let mut book = book;
        book.create_quote("gpu-hour".to_string(), p, hash, 100);
    }

    #[test]
    #[should_panic(expected = "OfferAlreadyLive")]
    fn one_live_offer_per_seller_per_item() {
        let mut book = book_with_gate();
        post(&mut book, "honest.testnet", 1, U128(10 * NEAR_YOCTO), 2);
        post(&mut book, "honest.testnet", 2, U128(11 * NEAR_YOCTO), 2);
    }

    #[test]
    #[should_panic(expected = "TooManyOffers")]
    fn create_quote_panics_above_the_offer_cap() {
        let mut book = book_with_gate();
        for id in 1..=65 {
            post(
                &mut book,
                &format!("seller-{id}.testnet"),
                id,
                U128(10 * NEAR_YOCTO),
                2,
            );
        }
        let p = policy();
        let hash = policy_hash(&p);
        testing_env!(ctx("agent.testnet", 0, 100));
        book.create_quote("gpu-hour".to_string(), p, hash, 100);
    }

    #[test]
    fn only_the_gate_can_mark_executed_and_record_sales() {
        let mut book = book_with_gate();
        post(&mut book, "honest-a.testnet", 1, U128(10 * NEAR_YOCTO), 2);
        let p = policy();
        let hash = policy_hash(&p);
        testing_env!(ctx("agent.testnet", 0, 100));
        let quote_id = book.create_quote("gpu-hour".to_string(), p, hash, 100);

        testing_env!(ctx("gate.testnet", 0, 100));
        book.mark_executed(quote_id);
        book.record_sale(account("honest-a.testnet"));
        assert!(book.is_quote_executed(quote_id));
        assert_eq!(book.get_sales(account("honest-a.testnet")), 1);
    }

    #[test]
    #[should_panic(expected = "OnlyCheckoutGate")]
    fn a_non_gate_cannot_mark_executed() {
        let mut book = book_with_gate();
        testing_env!(ctx("mallory.testnet", 0, 100));
        book.mark_executed(1);
    }

    #[test]
    #[should_panic(expected = "GateAlreadySet")]
    fn the_gate_can_only_be_set_once() {
        let mut book = book_with_gate();
        testing_env!(ctx("owner.testnet", 0, 100));
        book.set_checkout_gate(account("other.testnet"));
    }
}
