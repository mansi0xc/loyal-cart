use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::AccountId;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub type OfferId = u64;
pub type QuoteId = u64;

pub const NEAR_YOCTO: u128 = 1_000_000_000_000_000_000_000_000;
pub const PRICE_UNIT_YOCTO: u128 = 1_000_000_000_000_000_000;
pub const PRICE_SCORE_UNIT_YOCTO: u128 = 1_000_000_000_000_000_000_000;
pub const REPUTATION_CAP: u64 = 100;
pub const MAX_OFFERS_PER_QUOTE: usize = 64;
pub const MAX_ITEM_ID_LEN: usize = 64;
pub const MAX_DELIVERY_DAYS: u16 = 365;
pub const MAX_TTL_BLOCKS: u64 = 10_000;

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Offer {
    pub offer_id: OfferId,
    pub item_id: String,
    pub seller: AccountId,
    pub price: u128,
    pub delivery_days: u16,
    pub expires_at_block: u64,
    pub metadata_hash: [u8; 32],
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Policy {
    pub price_weight: u32,
    pub delivery_weight: u32,
    pub reputation_weight: u32,
    pub max_price: u128,
    pub min_delivery_days: u16,
    pub excluded_sellers: Vec<AccountId>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Quote {
    pub quote_id: QuoteId,
    pub buyer: AccountId,
    pub item_id: String,
    pub offer_ids: Vec<OfferId>,
    pub offer_hashes: Vec<[u8; 32]>,
    pub seller_sales: Vec<u64>,
    pub policy: Policy,
    pub policy_hash: [u8; 32],
    pub winner_offer_id: OfferId,
    pub quote_block: u64,
    pub expires_at_block: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct PurchaseReceipt {
    pub purchase_id: u64,
    pub quote_id: QuoteId,
    pub offer_id: OfferId,
    pub buyer: AccountId,
    pub seller: AccountId,
    pub amount: u128,
    pub block_height: u64,
    pub caller: AccountId,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RankedOffer {
    pub offer_id: OfferId,
    pub score: u128,
    pub price: u128,
    pub delivery_days: u16,
}

pub fn sha256(bytes: &[u8]) -> [u8; 32] {
    let digest = Sha256::digest(bytes);
    let mut out = [0u8; 32];
    out.copy_from_slice(&digest);
    out
}

pub fn policy_bytes(policy: &Policy) -> Vec<u8> {
    borsh::to_vec(policy).expect("policy borsh serialization cannot fail")
}

pub fn policy_hash(policy: &Policy) -> [u8; 32] {
    sha256(&policy_bytes(policy))
}

pub fn offer_bytes(offer: &Offer) -> Vec<u8> {
    borsh::to_vec(offer).expect("offer borsh serialization cannot fail")
}

pub fn offer_hash(offer: &Offer) -> [u8; 32] {
    sha256(&offer_bytes(offer))
}

pub fn quote_bytes(quote: &Quote) -> Vec<u8> {
    borsh::to_vec(quote).expect("quote borsh serialization cannot fail")
}

pub fn quote_hash(quote: &Quote) -> [u8; 32] {
    sha256(&quote_bytes(quote))
}

pub fn valid_item_id(item_id: &str) -> bool {
    let len = item_id.len();
    if len == 0 || len > MAX_ITEM_ID_LEN {
        return false;
    }
    item_id
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
}

pub fn valid_price(price: u128) -> bool {
    price > 0 && price.is_multiple_of(PRICE_UNIT_YOCTO)
}

pub fn valid_policy(policy: &Policy) -> bool {
    let weight_sum = policy.price_weight as u64
        + policy.delivery_weight as u64
        + policy.reputation_weight as u64;
    weight_sum > 0
        && policy.max_price > 0
        && policy.max_price.is_multiple_of(PRICE_UNIT_YOCTO)
        && policy.min_delivery_days <= MAX_DELIVERY_DAYS
}

pub fn offer_is_valid(offer: &Offer, policy: &Policy, quote_block: u64) -> bool {
    offer.expires_at_block > quote_block
        && offer.price <= policy.max_price
        && offer.delivery_days >= policy.min_delivery_days
        && !policy.excluded_sellers.contains(&offer.seller)
}

pub fn score(offer: &Offer, policy: &Policy, sales: u64) -> Option<u128> {
    let price_units = offer.price / PRICE_SCORE_UNIT_YOCTO;
    let price_term = (policy.price_weight as u128).checked_mul(price_units)?;
    let delivery_term =
        (policy.delivery_weight as u128).checked_mul(offer.delivery_days as u128)?;
    let capped_sales = sales.min(REPUTATION_CAP);
    let reputation_term =
        (policy.reputation_weight as u128).checked_mul((REPUTATION_CAP - capped_sales) as u128)?;
    price_term
        .checked_add(delivery_term)?
        .checked_add(reputation_term)
}

pub fn rank_offers(offers: &[(Offer, u64)], policy: &Policy, quote_block: u64) -> Vec<RankedOffer> {
    let mut ranked: Vec<RankedOffer> = offers
        .iter()
        .filter(|(offer, _)| offer_is_valid(offer, policy, quote_block))
        .filter_map(|(offer, sales)| {
            score(offer, policy, *sales).map(|score| RankedOffer {
                offer_id: offer.offer_id,
                score,
                price: offer.price,
                delivery_days: offer.delivery_days,
            })
        })
        .collect();
    ranked.sort_by(|a, b| {
        a.score
            .cmp(&b.score)
            .then(a.price.cmp(&b.price))
            .then(a.delivery_days.cmp(&b.delivery_days))
            .then(a.offer_id.cmp(&b.offer_id))
    });
    ranked
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account(name: &str) -> AccountId {
        name.parse().unwrap()
    }

    fn offer(id: u64, seller: &str, price_near: u128, delivery_days: u16) -> Offer {
        Offer {
            offer_id: id,
            item_id: "gpu-hour".to_string(),
            seller: account(seller),
            price: price_near * NEAR_YOCTO,
            delivery_days,
            expires_at_block: 1_000,
            metadata_hash: [0u8; 32],
        }
    }

    fn policy() -> Policy {
        Policy {
            price_weight: 60,
            delivery_weight: 20,
            reputation_weight: 20,
            max_price: 15 * NEAR_YOCTO,
            min_delivery_days: 1,
            excluded_sellers: vec![account("excluded.testnet")],
        }
    }

    #[test]
    fn valid_item_ids() {
        assert!(valid_item_id("gpu-hour_1"));
        assert!(!valid_item_id(""));
        assert!(!valid_item_id("GPU"));
        assert!(!valid_item_id("has space"));
        assert!(!valid_item_id(&"a".repeat(65)));
    }

    #[test]
    fn price_must_be_a_multiple_of_the_unit() {
        assert!(valid_price(PRICE_UNIT_YOCTO));
        assert!(!valid_price(0));
        assert!(!valid_price(PRICE_UNIT_YOCTO + 1));
    }

    #[test]
    fn policy_weights_must_not_all_be_zero() {
        let mut p = policy();
        p.price_weight = 0;
        p.delivery_weight = 0;
        p.reputation_weight = 0;
        assert!(!valid_policy(&p));
        assert!(valid_policy(&policy()));
    }

    #[test]
    fn policy_hash_is_deterministic() {
        let p = policy();
        assert_eq!(policy_hash(&p), policy_hash(&p.clone()));
        assert_eq!(policy_bytes(&p).len(), 4 + 4 + 4 + 16 + 2 + 4 + 20);
    }

    #[test]
    fn rank_prefers_lower_score_then_price_then_delivery_then_id() {
        let p = policy();
        let offers = vec![
            (offer(1, "honest-a.testnet", 10, 2), 50),
            (offer(2, "honest-b.testnet", 11, 1), 20),
            (offer(3, "crooked.testnet", 12, 3), 0),
        ];
        let ranked = rank_offers(&offers, &p, 100);
        assert_eq!(ranked.len(), 3);
        assert_eq!(ranked[0].offer_id, 1);
        assert_eq!(ranked[1].offer_id, 2);
        assert_eq!(ranked[2].offer_id, 3);
    }

    #[test]
    fn invalid_offers_are_filtered_out() {
        let p = policy();
        let mut expired = offer(4, "expired.testnet", 8, 1);
        expired.expires_at_block = 100;
        let mut over_price = offer(5, "injector.testnet", 20, 30);
        over_price.expires_at_block = 1_000;
        let excluded = offer(6, "excluded.testnet", 7, 1);
        let offers = vec![
            (offer(1, "honest-a.testnet", 10, 2), 50),
            (expired, 100),
            (over_price, 10),
            (excluded, 100),
        ];
        let ranked = rank_offers(&offers, &p, 100);
        assert_eq!(ranked.len(), 1);
        assert_eq!(ranked[0].offer_id, 1);
    }

    #[test]
    fn offer_hash_changes_when_a_field_changes() {
        let o = offer(1, "honest-a.testnet", 10, 2);
        let mut changed = o.clone();
        changed.price += PRICE_UNIT_YOCTO;
        assert_ne!(offer_hash(&o), offer_hash(&changed));
    }

    #[test]
    fn print_policy_hash_golden_vector() {
        let p = policy();
        let hex: String = policy_hash(&p)
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect();
        println!("POLICY_HASH={}", hex);
        assert_eq!(
            hex,
            "ed2e9ddcd3c347d3221ece97651c297c6173f1618ee57db8276a284d93db77f5"
        );
    }
}
