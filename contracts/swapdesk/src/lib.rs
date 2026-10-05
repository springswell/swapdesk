#![no_std]

//! Swapdesk: trustless over-the-counter token swaps on Stellar.
//!
//! Two parties agree off-chain ("10,000 USDC for 85,000 XLM"). Instead of
//! one of them sending first and hoping, the **maker** posts an offer and
//! the contract escrows their side. The **taker** fills it in a single
//! atomic step: their payment goes to the maker and the escrowed tokens go
//! to them in the same transaction, or nothing happens at all.
//!
//! - **Private offers** name the only address allowed to take them.
//! - **Partial fills** (opt-in) let several takers fill one offer at the
//!   offer's fixed price. Rounding always favours the maker, never the
//!   escrow balance, so the contract can't end up short.
//! - **Expiry and cancellation**: the maker can cancel any time, and after
//!   expiry anyone can return the remaining escrow to the maker, so
//!   tokens are never stranded.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
};

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OfferStatus {
    Open = 0,
    Filled = 1,
    Cancelled = 2,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Offer {
    pub id: u64,
    pub maker: Address,
    pub sell_token: Address,
    /// Total amount the maker sells (escrowed).
    pub sell_amount: i128,
    pub buy_token: Address,
    /// Total amount the maker wants in return.
    pub buy_amount: i128,
    /// Escrowed `sell_token` not yet delivered to takers.
    pub sell_remaining: i128,
    /// `buy_token` still owed to complete the offer.
    pub buy_remaining: i128,
    /// If set, only this address may fill.
    pub taker: Option<Address>,
    pub allow_partial: bool,
    pub expires_at: u64,
    pub status: OfferStatus,
}

#[contracttype]
pub enum DataKey {
    NextId,
    Offer(u64),
    /// Smallest partial fill (in buy-token units) the maker accepts.
    MinFill(u64),
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    OfferNotFound = 1,
    InvalidOffer = 2,
    NotOpen = 3,
    Expired = 4,
    NotYourOffer = 5,
    PrivateOffer = 6,
    PartialNotAllowed = 7,
    InvalidAmount = 8,
    NotExpired = 9,
    /// A partial fill below the maker's minimum (the final remainder is exempt).
    FillTooSmall = 10,
}

#[contractevent(topics = ["swap", "offered"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Offered {
    #[topic]
    pub offer_id: u64,
    pub maker: Address,
}

#[contractevent(topics = ["swap", "filled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Filled {
    #[topic]
    pub offer_id: u64,
    pub taker: Address,
    pub paid: i128,
    pub received: i128,
}

#[contractevent(topics = ["swap", "repriced"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Repriced {
    #[topic]
    pub offer_id: u64,
    pub buy_amount: i128,
}

#[contractevent(topics = ["swap", "closed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Closed {
    #[topic]
    pub offer_id: u64,
    pub refunded: i128,
}

const DAY_IN_LEDGERS: u32 = 17_280;
const BUMP_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;
const BUMP_TO: u32 = 120 * DAY_IN_LEDGERS;

#[contract]
pub struct Swapdesk;

#[contractimpl]
impl Swapdesk {
    /// Post an offer and escrow `sell_amount` of `sell_token` from the maker.
    #[allow(clippy::too_many_arguments)]
    pub fn create_offer(
        env: Env,
        maker: Address,
        sell_token: Address,
        sell_amount: i128,
        buy_token: Address,
        buy_amount: i128,
        taker: Option<Address>,
        allow_partial: bool,
        expires_at: u64,
    ) -> Result<u64, Error> {
        maker.require_auth();
        if sell_amount <= 0
            || buy_amount <= 0
            || sell_token == buy_token
            || expires_at <= env.ledger().timestamp()
            || taker.as_ref() == Some(&maker)
        {
            return Err(Error::InvalidOffer);
        }
        // Partial fills compute `sell * paid`, which must not overflow.
        if allow_partial && sell_amount.checked_mul(buy_amount).is_none() {
            return Err(Error::InvalidOffer);
        }

        token::Client::new(&env, &sell_token).transfer(
            &maker,
            env.current_contract_address(),
            &sell_amount,
        );

        let id = next_id(&env);
        let offer = Offer {
            id,
            maker: maker.clone(),
            sell_token,
            sell_amount,
            buy_token,
            buy_amount,
            sell_remaining: sell_amount,
            buy_remaining: buy_amount,
            taker,
            allow_partial,
            expires_at,
            status: OfferStatus::Open,
        };
        save(&env, &offer);
        Offered {
            offer_id: id,
            maker,
        }
        .publish(&env);
        Ok(id)
    }

    /// Pay `pay_amount` of the buy token and receive the matching share of
    /// the escrow. Pass the full `buy_remaining` to fill completely.
    pub fn fill(env: Env, offer_id: u64, taker: Address, pay_amount: i128) -> Result<i128, Error> {
        taker.require_auth();
        let mut offer = load(&env, offer_id)?;
        if offer.status != OfferStatus::Open {
            return Err(Error::NotOpen);
        }
        if env.ledger().timestamp() >= offer.expires_at {
            return Err(Error::Expired);
        }
        if let Some(allowed) = &offer.taker {
            if *allowed != taker {
                return Err(Error::PrivateOffer);
            }
        }
        if taker == offer.maker {
            return Err(Error::InvalidAmount);
        }
        if pay_amount <= 0 || pay_amount > offer.buy_remaining {
            return Err(Error::InvalidAmount);
        }
        if pay_amount < offer.buy_remaining && !offer.allow_partial {
            return Err(Error::PartialNotAllowed);
        }
        // Dust fills can't fragment an offer; the last remainder is always fillable.
        if pay_amount < offer.buy_remaining && pay_amount < min_fill(&env, offer_id) {
            return Err(Error::FillTooSmall);
        }

        // The final fill takes whatever escrow is left, so rounding dust
        // never gets stuck. Partial fills round down (in the maker's favour).
        let receive = if pay_amount == offer.buy_remaining {
            offer.sell_remaining
        } else {
            offer.sell_amount * pay_amount / offer.buy_amount
        };
        if receive <= 0 {
            return Err(Error::InvalidAmount);
        }

        offer.buy_remaining -= pay_amount;
        offer.sell_remaining -= receive;
        if offer.buy_remaining == 0 {
            offer.status = OfferStatus::Filled;
        }
        save(&env, &offer);

        token::Client::new(&env, &offer.buy_token).transfer(&taker, &offer.maker, &pay_amount);
        token::Client::new(&env, &offer.sell_token).transfer(
            &env.current_contract_address(),
            &taker,
            &receive,
        );
        Filled {
            offer_id,
            taker,
            paid: pay_amount,
            received: receive,
        }
        .publish(&env);
        Ok(receive)
    }

    /// Maker withdraws an open offer; the remaining escrow is returned.
    pub fn cancel(env: Env, offer_id: u64) -> Result<i128, Error> {
        let offer = load(&env, offer_id)?;
        offer.maker.require_auth();
        close(&env, offer)
    }

    /// After expiry, anyone can return the remaining escrow to the maker.
    pub fn reclaim_expired(env: Env, offer_id: u64) -> Result<i128, Error> {
        let offer = load(&env, offer_id)?;
        if env.ledger().timestamp() < offer.expires_at {
            return Err(Error::NotExpired);
        }
        close(&env, offer)
    }

    pub fn get_offer(env: Env, offer_id: u64) -> Result<Offer, Error> {
        load(&env, offer_id)
    }

    /// Set the smallest partial fill (in buy-token units). Maker only.
    pub fn set_min_fill(env: Env, offer_id: u64, min_fill: i128) -> Result<(), Error> {
        let offer = load(&env, offer_id)?;
        offer.maker.require_auth();
        if offer.status != OfferStatus::Open {
            return Err(Error::NotOpen);
        }
        if min_fill < 0 || min_fill > offer.buy_remaining {
            return Err(Error::InvalidAmount);
        }
        let key = DataKey::MinFill(offer_id);
        env.storage().persistent().set(&key, &min_fill);
        env.storage()
            .persistent()
            .extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
        Ok(())
    }

    pub fn min_fill(env: Env, offer_id: u64) -> i128 {
        min_fill(&env, offer_id)
    }

    /// Change what the maker wants for the unsold remainder, keeping the
    /// offer id and escrow. Afterwards `sell_amount`/`buy_amount` describe
    /// the repriced remainder, which is what partial fills are priced on.
    pub fn reprice(env: Env, offer_id: u64, buy_amount: i128) -> Result<(), Error> {
        let mut offer = load(&env, offer_id)?;
        offer.maker.require_auth();
        if offer.status != OfferStatus::Open {
            return Err(Error::NotOpen);
        }
        if env.ledger().timestamp() >= offer.expires_at {
            return Err(Error::Expired);
        }
        if buy_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if offer.allow_partial && offer.sell_remaining.checked_mul(buy_amount).is_none() {
            return Err(Error::InvalidAmount);
        }
        offer.sell_amount = offer.sell_remaining;
        offer.buy_amount = buy_amount;
        offer.buy_remaining = buy_amount;
        save(&env, &offer);
        if min_fill(&env, offer_id) > buy_amount {
            env.storage()
                .persistent()
                .remove(&DataKey::MinFill(offer_id));
        }
        Repriced {
            offer_id,
            buy_amount,
        }
        .publish(&env);
        Ok(())
    }

    /// Number of offers ever created; ids run from 1 to this value.
    pub fn offer_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::NextId).unwrap_or(0)
    }
}

fn close(env: &Env, mut offer: Offer) -> Result<i128, Error> {
    if offer.status != OfferStatus::Open {
        return Err(Error::NotOpen);
    }
    let refund = offer.sell_remaining;
    offer.sell_remaining = 0;
    offer.status = OfferStatus::Cancelled;
    save(env, &offer);
    if refund > 0 {
        token::Client::new(env, &offer.sell_token).transfer(
            &env.current_contract_address(),
            &offer.maker,
            &refund,
        );
    }
    Closed {
        offer_id: offer.id,
        refunded: refund,
    }
    .publish(env);
    Ok(refund)
}

fn load(env: &Env, id: u64) -> Result<Offer, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Offer(id))
        .ok_or(Error::OfferNotFound)
}

fn min_fill(env: &Env, offer_id: u64) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::MinFill(offer_id))
        .unwrap_or(0)
}

fn save(env: &Env, offer: &Offer) {
    let key = DataKey::Offer(offer.id);
    env.storage().persistent().set(&key, offer);
    env.storage()
        .persistent()
        .extend_ttl(&key, BUMP_THRESHOLD, BUMP_TO);
    // The instance holds the id counter; keep it alive on every write.
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
}

fn next_id(env: &Env) -> u64 {
    let next: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextId)
        .unwrap_or(0u64)
        + 1;
    env.storage().instance().set(&DataKey::NextId, &next);
    env.storage().instance().extend_ttl(BUMP_THRESHOLD, BUMP_TO);
    next
}

mod test;
