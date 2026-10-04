#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token::StellarAssetClient,
    Env,
};

const NOW: u64 = 1_700_000_000;
const DAY: u64 = 86_400;

struct Setup<'a> {
    env: Env,
    desk: SwapdeskClient<'a>,
    usdc: Address,
    xlm: Address,
    usdc_c: token::Client<'a>,
    xlm_c: token::Client<'a>,
    maker: Address,
    taker: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = NOW);
    let desk = SwapdeskClient::new(&env, &env.register(Swapdesk, ()));
    let usdc = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let xlm = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let maker = Address::generate(&env);
    let taker = Address::generate(&env);
    StellarAssetClient::new(&env, &usdc).mint(&maker, &10_000);
    StellarAssetClient::new(&env, &xlm).mint(&taker, &100_000);
    let usdc_c = token::Client::new(&env, &usdc);
    let xlm_c = token::Client::new(&env, &xlm);
    Setup {
        env,
        desk,
        usdc,
        xlm,
        usdc_c,
        xlm_c,
        maker,
        taker,
    }
}

/// Maker sells 10,000 USDC for 85,000 XLM.
fn offer(s: &Setup, taker: Option<Address>, partial: bool) -> u64 {
    s.desk.create_offer(
        &s.maker,
        &s.usdc,
        &10_000,
        &s.xlm,
        &85_000,
        &taker,
        &partial,
        &(NOW + DAY),
    )
}

#[test]
fn creating_an_offer_escrows_the_makers_side() {
    let s = setup();
    let id = offer(&s, None, false);
    assert_eq!(s.usdc_c.balance(&s.desk.address), 10_000);
    assert_eq!(s.usdc_c.balance(&s.maker), 0);
    assert_eq!(s.desk.get_offer(&id).status, OfferStatus::Open);
}

#[test]
fn a_full_fill_swaps_both_sides_atomically() {
    let s = setup();
    let id = offer(&s, None, false);

    assert_eq!(s.desk.fill(&id, &s.taker, &85_000), 10_000);

    assert_eq!(s.usdc_c.balance(&s.taker), 10_000);
    assert_eq!(s.xlm_c.balance(&s.maker), 85_000);
    assert_eq!(s.usdc_c.balance(&s.desk.address), 0);
    assert_eq!(s.desk.get_offer(&id).status, OfferStatus::Filled);
    assert_eq!(s.desk.try_fill(&id, &s.taker, &1), Err(Ok(Error::NotOpen)));
}

#[test]
fn partial_fills_need_opt_in() {
    let s = setup();
    let id = offer(&s, None, false);
    assert_eq!(
        s.desk.try_fill(&id, &s.taker, &42_500),
        Err(Ok(Error::PartialNotAllowed))
    );
}

#[test]
fn partial_fills_share_the_escrow_at_the_fixed_price() {
    let s = setup();
    let second = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.xlm).mint(&second, &100_000);
    let id = offer(&s, None, true);

    assert_eq!(s.desk.fill(&id, &s.taker, &17_000), 2_000); // 20%
    assert_eq!(s.desk.fill(&id, &second, &68_000), 8_000); // the rest

    assert_eq!(s.xlm_c.balance(&s.maker), 85_000);
    assert_eq!(s.usdc_c.balance(&s.desk.address), 0);
    assert_eq!(s.desk.get_offer(&id).status, OfferStatus::Filled);
}

#[test]
fn rounding_favours_the_maker_and_the_last_fill_clears_dust() {
    let s = setup();
    // 10 for 3: one unit of buy is worth 3.33 sell units.
    let id = s.desk.create_offer(
        &s.maker,
        &s.usdc,
        &10,
        &s.xlm,
        &3,
        &None,
        &true,
        &(NOW + DAY),
    );
    assert_eq!(s.desk.fill(&id, &s.taker, &1), 3); // rounds down
    assert_eq!(s.desk.fill(&id, &s.taker, &1), 3);
    assert_eq!(s.desk.fill(&id, &s.taker, &1), 4); // final fill takes the remainder
    assert_eq!(s.usdc_c.balance(&s.desk.address), 0);
    assert_eq!(s.usdc_c.balance(&s.taker), 10);
}

#[test]
fn rejects_overpaying_and_zero_fills() {
    let s = setup();
    let id = offer(&s, None, true);
    assert_eq!(
        s.desk.try_fill(&id, &s.taker, &85_001),
        Err(Ok(Error::InvalidAmount))
    );
    assert_eq!(
        s.desk.try_fill(&id, &s.taker, &0),
        Err(Ok(Error::InvalidAmount))
    );
}

#[test]
fn private_offers_only_accept_the_named_taker() {
    let s = setup();
    let id = offer(&s, Some(s.taker.clone()), false);
    let stranger = Address::generate(&s.env);
    StellarAssetClient::new(&s.env, &s.xlm).mint(&stranger, &100_000);

    assert_eq!(
        s.desk.try_fill(&id, &stranger, &85_000),
        Err(Ok(Error::PrivateOffer))
    );
    s.desk.fill(&id, &s.taker, &85_000);
}

#[test]
fn expired_offers_cannot_be_filled_and_anyone_can_return_the_escrow() {
    let s = setup();
    let id = offer(&s, None, false);
    assert_eq!(s.desk.try_reclaim_expired(&id), Err(Ok(Error::NotExpired)));

    s.env.ledger().with_mut(|l| l.timestamp = NOW + DAY);
    assert_eq!(
        s.desk.try_fill(&id, &s.taker, &85_000),
        Err(Ok(Error::Expired))
    );
    assert_eq!(s.desk.reclaim_expired(&id), 10_000);
    assert_eq!(s.usdc_c.balance(&s.maker), 10_000);
    assert_eq!(s.desk.get_offer(&id).status, OfferStatus::Cancelled);
}

#[test]
fn maker_can_cancel_and_gets_the_unfilled_remainder() {
    let s = setup();
    let id = offer(&s, None, true);
    s.desk.fill(&id, &s.taker, &42_500); // half
    assert_eq!(s.desk.cancel(&id), 5_000);
    assert_eq!(s.usdc_c.balance(&s.maker), 5_000);
    assert_eq!(s.desk.try_cancel(&id), Err(Ok(Error::NotOpen)));
}

#[test]
#[should_panic]
fn only_the_maker_can_cancel() {
    let s = setup();
    let id = offer(&s, None, false);
    s.env.set_auths(&[]);
    s.desk.cancel(&id);
}

#[test]
fn invalid_offers_are_rejected() {
    let s = setup();
    let bad = |sell: i128, buy: i128, buy_token: &Address, taker: Option<Address>, expires: u64| {
        s.desk.try_create_offer(
            &s.maker, &s.usdc, &sell, buy_token, &buy, &taker, &false, &expires,
        )
    };
    let later = NOW + DAY;
    assert_eq!(bad(0, 1, &s.xlm, None, later), Err(Ok(Error::InvalidOffer)));
    assert_eq!(bad(1, 0, &s.xlm, None, later), Err(Ok(Error::InvalidOffer)));
    assert_eq!(
        bad(1, 1, &s.usdc, None, later),
        Err(Ok(Error::InvalidOffer))
    );
    assert_eq!(bad(1, 1, &s.xlm, None, NOW), Err(Ok(Error::InvalidOffer)));
    assert_eq!(
        bad(1, 1, &s.xlm, Some(s.maker.clone()), later),
        Err(Ok(Error::InvalidOffer))
    );
}

#[test]
fn unknown_offers() {
    let s = setup();
    assert_eq!(s.desk.try_get_offer(&7), Err(Ok(Error::OfferNotFound)));
    assert_eq!(
        s.desk.try_fill(&7, &s.taker, &1),
        Err(Ok(Error::OfferNotFound))
    );
}
