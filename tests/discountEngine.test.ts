import { describe, expect, it } from 'vitest';
import {
  calculateCartDiscounts,
  calculateItemDiscounts,
  CartItemInput,
  DiscountRuleRecord,
} from '../server/discountEngine';

const SEED_RULES: DiscountRuleRecord[] = [
  {
    id: 'r1',
    rule_code: 'RULE-01',
    scope: 'platform',
    applies_to: 'Amazon India',
    discount_type: 'percentage',
    value: 15,
    stackable: false,
    min_cart_value: null,
    is_active: true,
  },
  {
    id: 'r2',
    rule_code: 'RULE-02',
    scope: 'brand',
    applies_to: 'Natura Casa',
    discount_type: 'flat',
    value: 150,
    stackable: false,
    min_cart_value: null,
    is_active: true,
  },
  {
    id: 'r3',
    rule_code: 'RULE-03',
    scope: 'platform',
    applies_to: 'Flipkart',
    discount_type: 'percentage',
    value: 10,
    stackable: true,
    min_cart_value: null,
    is_active: true,
  },
  {
    id: 'r4',
    rule_code: 'RULE-04',
    scope: 'cart',
    applies_to: null,
    discount_type: 'percentage',
    value: 10,
    stackable: false,
    min_cart_value: 4000,
    is_active: true,
  },
];

const SAMPLE_CART: CartItemInput[] = [
  { id: 'i1', cart_id: 'c1', product_name: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', base_price: 1299 },
  { id: 'i2', cart_id: 'c1', product_name: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', base_price: 849 },
  { id: 'i3', cart_id: 'c1', product_name: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Amazon India', base_price: 599 },
  { id: 'i4', cart_id: 'c1', product_name: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', base_price: 2499 },
  { id: 'i5', cart_id: 'c1', product_name: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India', base_price: 449 },
  { id: 'i6', cart_id: 'c1', product_name: 'Desk Organiser', brand: 'Nordic Basics', platform: 'Flipkart', base_price: 899 },
];

describe('Discount Engine Acceptance & Edge Cases', () => {
  it('produces exact assignment results for the 6-item sample cart and 4 rules', () => {
    const res = calculateCartDiscounts(SAMPLE_CART, SEED_RULES);

    expect(res.items.map((i) => i.final_price)).toEqual([1104, 629, 509, 2499, 382, 809]);
    expect(res.original_total).toBe(6594);
    expect(res.item_discount_total).toBe(662);
    expect(res.pre_cart_discount_total).toBe(5932);
    expect(res.cart_discount_total).toBe(593);
    expect(res.final_total).toBe(5339);
    expect(res.total_savings).toBe(1255);
  });

  it('picks highest non-stackable discount in rupees', () => {
    const item: CartItemInput = {
      id: 'x1',
      cart_id: 'c1',
      product_name: 'Cushion Cover',
      brand: 'Natura Casa',
      platform: 'Amazon India',
      base_price: 1299,
    };
    const detail = calculateItemDiscounts(item, SEED_RULES);
    expect(detail.winning_non_stackable?.rule_code).toBe('RULE-01');
    expect(detail.skipped_rules[0]?.rule_code).toBe('RULE-02');
    expect(detail.final_price).toBe(1104);
  });

  it('applies multiple stackable rules sequentially on top of winning non-stackable rule', () => {
    const extraStackable: DiscountRuleRecord = {
      id: 'r5',
      rule_code: 'RULE-05',
      scope: 'brand',
      applies_to: 'Natura Casa',
      discount_type: 'flat',
      value: 29,
      stackable: true,
      min_cart_value: null,
      is_active: true,
    };
    const detail = calculateItemDiscounts(SAMPLE_CART[1], [...SEED_RULES, extraStackable]);
    // 849 - 150 (RULE-02) = 699; -10% (RULE-03: 70) = 629; -29 (RULE-05) = 600
    expect(detail.final_price).toBe(600);
    expect(detail.stackable_rules).toHaveLength(2);
  });

  it('applies stackable rule independently when no non-stackable rule matches', () => {
    const detail = calculateItemDiscounts(SAMPLE_CART[5], SEED_RULES);
    expect(detail.winning_non_stackable).toBeNull();
    expect(detail.stackable_rules).toHaveLength(1);
    expect(detail.final_price).toBe(809);
  });

  it('retains base price with "No offers available." when no rules match', () => {
    const detail = calculateItemDiscounts(SAMPLE_CART[3], SEED_RULES);
    expect(detail.final_price).toBe(2499);
    expect(detail.discount_amount).toBe(0);
    expect(detail.explanation).toBe('No offers available.');
  });

  it('handles cart threshold just below (3999) and just above (4000 / 4001)', () => {
    const cartRuleOnly = [SEED_RULES[3]];
    const below = calculateCartDiscounts(
      [{ id: 'b1', cart_id: 'c', product_name: 'Item', brand: 'X', platform: 'Y', base_price: 3999 }],
      cartRuleOnly
    );
    expect(below.cart_discount_total).toBe(0);
    expect(below.final_total).toBe(3999);

    const exact = calculateCartDiscounts(
      [{ id: 'e1', cart_id: 'c', product_name: 'Item', brand: 'X', platform: 'Y', base_price: 4000 }],
      cartRuleOnly
    );
    expect(exact.cart_discount_total).toBe(400);
    expect(exact.final_total).toBe(3600);

    const above = calculateCartDiscounts(
      [{ id: 'a1', cart_id: 'c', product_name: 'Item', brand: 'X', platform: 'Y', base_price: 4001 }],
      cartRuleOnly
    );
    expect(above.cart_discount_total).toBe(400);
    expect(above.final_total).toBe(3601);
  });

  it('handles multiple cart rules (winning non-stackable + stackable cart rule)', () => {
    const cartRules: DiscountRuleRecord[] = [
      SEED_RULES[3],
      {
        id: 'rc2',
        rule_code: 'RULE-CART-FLAT',
        scope: 'cart',
        applies_to: null,
        discount_type: 'flat',
        value: 200,
        stackable: false,
        min_cart_value: 3000,
        is_active: true,
      },
      {
        id: 'rc3',
        rule_code: 'RULE-CART-STACK',
        scope: 'cart',
        applies_to: null,
        discount_type: 'flat',
        value: 100,
        stackable: true,
        min_cart_value: 3000,
        is_active: true,
      },
    ];
    const res = calculateCartDiscounts(
      [{ id: 'm1', cart_id: 'c', product_name: 'Sofa', brand: 'X', platform: 'Y', base_price: 5000 }],
      cartRules
    );
    // 10% of 5000 = 500 (beats Rs.200), then stack Rs.100 => 4400
    expect(res.cart_discount_total).toBe(600);
    expect(res.final_total).toBe(4400);
  });

  it('prevents negative prices even with large flat discounts and handles empty cart', () => {
    const hugeFlat: DiscountRuleRecord = {
      id: 'hf',
      rule_code: 'HUGE-FLAT',
      scope: 'brand',
      applies_to: 'Natura Casa',
      discount_type: 'flat',
      value: 9999,
      stackable: false,
      min_cart_value: null,
      is_active: true,
    };
    const itemRes = calculateItemDiscounts(SAMPLE_CART[0], [hugeFlat]);
    expect(itemRes.final_price).toBe(0);
    expect(itemRes.discount_amount).toBe(1299);

    const emptyRes = calculateCartDiscounts([], SEED_RULES);
    expect(emptyRes.final_total).toBe(0);
    expect(emptyRes.items).toEqual([]);
  });
});
