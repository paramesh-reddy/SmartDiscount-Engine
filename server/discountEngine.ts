import Decimal from 'decimal.js';

Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

export type RuleScope = 'platform' | 'brand' | 'cart';
export type DiscountType = 'percentage' | 'flat';

export interface DiscountRuleRecord {
  id: string;
  rule_code: string;
  scope: RuleScope;
  applies_to: string | null;
  discount_type: DiscountType;
  value: string | number;
  stackable: boolean;
  min_cart_value: string | number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CartItemInput {
  id: string;
  cart_id: string;
  product_name: string;
  brand: string;
  platform: string;
  base_price: string | number;
  created_at?: string;
}

export interface AppliedRuleDetail {
  id: string;
  rule_code: string;
  scope: RuleScope;
  applies_to: string | null;
  discount_type: DiscountType;
  value: number;
  stackable: boolean;
  saving_amount: number;
}

export interface ItemCalculationDetail {
  item_id: string;
  product_name: string;
  brand: string;
  platform: string;
  base_price: number;
  final_price: number;
  discount_amount: number;
  matched_rules: AppliedRuleDetail[];
  winning_non_stackable: AppliedRuleDetail | null;
  stackable_rules: AppliedRuleDetail[];
  skipped_rules: Array<{ rule_code: string; scope: RuleScope; potential_saving: number }>;
  explanation: string;
}

export interface CartCalculationOutput {
  original_total: number;
  item_discount_total: number;
  pre_cart_discount_total: number;
  cart_discount_total: number;
  final_total: number;
  total_savings: number;
  items: ItemCalculationDetail[];
  applied_cart_rules: AppliedRuleDetail[];
  skipped_cart_rules: Array<{ rule_code: string; reason: string }>;
  cart_explanation: string;
  rounding_policy: string;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function toDecimal(val: string | number | null | undefined): Decimal {
  if (val === null || val === undefined || val === '') {
    return new Decimal(0);
  }
  return new Decimal(val);
}

export function ruleMatchesItem(item: CartItemInput, rule: DiscountRuleRecord): boolean {
  if (!rule.is_active) return false;
  if (rule.scope === 'brand') {
    return normalize(item.brand) !== '' && normalize(item.brand) === normalize(rule.applies_to);
  }
  if (rule.scope === 'platform') {
    return normalize(item.platform) !== '' && normalize(item.platform) === normalize(rule.applies_to);
  }
  return false;
}

/**
 * Calculates integer INR saving for a rule on a given Decimal price using ROUND_HALF_UP.
 * Caps the saving so the resulting price never becomes negative.
 */
export function calculateRuleSaving(currentPrice: Decimal, rule: DiscountRuleRecord): Decimal {
  if (currentPrice.lte(0)) return new Decimal(0);
  const val = toDecimal(rule.value);
  if (val.lte(0)) return new Decimal(0);

  let rawSaving: Decimal;
  if (rule.discount_type === 'percentage') {
    rawSaving = currentPrice.mul(val).div(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  } else {
    rawSaving = val.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  }

  return Decimal.min(currentPrice, Decimal.max(new Decimal(0), rawSaving));
}

function formatRulePhrase(rule: DiscountRuleRecord): string {
  const target = rule.applies_to ? rule.applies_to.trim() : rule.scope;
  if (rule.discount_type === 'percentage') {
    const pct = toDecimal(rule.value).toString();
    if (rule.scope === 'cart') {
      return `${pct}% cart discount`;
    }
    return `${pct}% ${target} ${rule.scope === 'brand' ? 'brand ' : ''}discount`;
  }
  const amt = toDecimal(rule.value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber().toLocaleString('en-IN');
  if (rule.scope === 'cart') {
    return `Rs.${amt} cart discount`;
  }
  return `Rs.${amt} ${target} ${rule.scope === 'brand' ? 'brand ' : ''}discount`;
}

export function calculateItemDiscounts(
  item: CartItemInput,
  rules: DiscountRuleRecord[]
): ItemCalculationDetail {
  const basePrice = Decimal.max(new Decimal(0), toDecimal(item.base_price)).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const activeMatching = rules
    .filter((r) => ruleMatchesItem(item, r))
    .sort((a, b) => a.rule_code.localeCompare(b.rule_code));

  if (activeMatching.length === 0) {
    return {
      item_id: item.id,
      product_name: item.product_name,
      brand: item.brand,
      platform: item.platform,
      base_price: basePrice.toNumber(),
      final_price: basePrice.toNumber(),
      discount_amount: 0,
      matched_rules: [],
      winning_non_stackable: null,
      stackable_rules: [],
      skipped_rules: [],
      explanation: 'No offers available.',
    };
  }

  const nonStackable = activeMatching.filter((r) => !r.stackable);
  const stackable = activeMatching.filter((r) => r.stackable);

  const matchedDetails: AppliedRuleDetail[] = activeMatching.map((r) => ({
    id: r.id,
    rule_code: r.rule_code,
    scope: r.scope,
    applies_to: r.applies_to,
    discount_type: r.discount_type,
    value: toDecimal(r.value).toNumber(),
    stackable: r.stackable,
    saving_amount: calculateRuleSaving(basePrice, r).toNumber(),
  }));

  let winnerRule: DiscountRuleRecord | null = null;
  const skippedRules: Array<{ rule_code: string; scope: RuleScope; potential_saving: number }> = [];

  if (nonStackable.length > 0) {
    const ranked = [...nonStackable].sort((a, b) => {
      const saveA = calculateRuleSaving(basePrice, a);
      const saveB = calculateRuleSaving(basePrice, b);
      const cmp = saveB.comparedTo(saveA);
      if (cmp !== 0) return cmp;
      return a.rule_code.localeCompare(b.rule_code);
    });
    winnerRule = ranked[0];
    for (const loser of ranked.slice(1)) {
      skippedRules.push({
        rule_code: loser.rule_code,
        scope: loser.scope,
        potential_saving: calculateRuleSaving(basePrice, loser).toNumber(),
      });
    }
  }

  let runningPrice = basePrice;
  let winningNonStackableDetail: AppliedRuleDetail | null = null;
  const appliedStackableDetails: AppliedRuleDetail[] = [];
  const appliedPhrases: string[] = [];

  if (winnerRule) {
    const saving = calculateRuleSaving(runningPrice, winnerRule);
    runningPrice = Decimal.max(new Decimal(0), runningPrice.sub(saving));
    winningNonStackableDetail = {
      id: winnerRule.id,
      rule_code: winnerRule.rule_code,
      scope: winnerRule.scope,
      applies_to: winnerRule.applies_to,
      discount_type: winnerRule.discount_type,
      value: toDecimal(winnerRule.value).toNumber(),
      stackable: false,
      saving_amount: saving.toNumber(),
    };
    appliedPhrases.push(formatRulePhrase(winnerRule));
  }

  for (const sRule of stackable) {
    const saving = calculateRuleSaving(runningPrice, sRule);
    runningPrice = Decimal.max(new Decimal(0), runningPrice.sub(saving));
    appliedStackableDetails.push({
      id: sRule.id,
      rule_code: sRule.rule_code,
      scope: sRule.scope,
      applies_to: sRule.applies_to,
      discount_type: sRule.discount_type,
      value: toDecimal(sRule.value).toNumber(),
      stackable: true,
      saving_amount: saving.toNumber(),
    });
    appliedPhrases.push(`${formatRulePhrase(sRule)} (stackable)`);
  }

  const finalPrice = Decimal.max(new Decimal(0), runningPrice).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const totalSaved = Decimal.max(new Decimal(0), basePrice.sub(finalPrice));

  const explanation =
    totalSaved.gt(0)
      ? `${appliedPhrases.join(' + ')} applied. You saved Rs.${totalSaved.toNumber().toLocaleString('en-IN')}.`
      : 'No offers available.';

  return {
    item_id: item.id,
    product_name: item.product_name,
    brand: item.brand,
    platform: item.platform,
    base_price: basePrice.toNumber(),
    final_price: finalPrice.toNumber(),
    discount_amount: totalSaved.toNumber(),
    matched_rules: matchedDetails,
    winning_non_stackable: winningNonStackableDetail,
    stackable_rules: appliedStackableDetails,
    skipped_rules: skippedRules,
    explanation,
  };
}

export function calculateCartDiscounts(
  cartItems: CartItemInput[],
  rules: DiscountRuleRecord[]
): CartCalculationOutput {
  if (cartItems.length === 0) {
    return {
      original_total: 0,
      item_discount_total: 0,
      pre_cart_discount_total: 0,
      cart_discount_total: 0,
      final_total: 0,
      total_savings: 0,
      items: [],
      applied_cart_rules: [],
      skipped_cart_rules: [],
      cart_explanation: 'Cart is empty. Add items to calculate discounts.',
      rounding_policy: 'INR integer rounding using Decimal ROUND_HALF_UP at each sequential discount step.',
    };
  }

  const itemDetails = cartItems.map((item) => calculateItemDiscounts(item, rules));

  const originalTotal = itemDetails.reduce((acc, i) => acc.add(i.base_price), new Decimal(0));
  const itemDiscountTotal = itemDetails.reduce((acc, i) => acc.add(i.discount_amount), new Decimal(0));
  const preCartTotal = itemDetails.reduce((acc, i) => acc.add(i.final_price), new Decimal(0));

  const activeCartRules = rules
    .filter((r) => r.is_active && r.scope === 'cart')
    .sort((a, b) => a.rule_code.localeCompare(b.rule_code));

  const qualifyingCartRules: DiscountRuleRecord[] = [];
  const skippedCartRules: Array<{ rule_code: string; reason: string }> = [];

  for (const cRule of activeCartRules) {
    const minVal = cRule.min_cart_value !== null && cRule.min_cart_value !== undefined
      ? toDecimal(cRule.min_cart_value)
      : new Decimal(0);

    if (preCartTotal.gte(minVal)) {
      qualifyingCartRules.push(cRule);
    } else {
      skippedCartRules.push({
        rule_code: cRule.rule_code,
        reason: `Requires pre-cart total of Rs.${minVal.toNumber().toLocaleString('en-IN')} (current Rs.${preCartTotal.toNumber().toLocaleString('en-IN')}).`,
      });
    }
  }

  const nonStackableCart = qualifyingCartRules.filter((r) => !r.stackable);
  const stackableCart = qualifyingCartRules.filter((r) => r.stackable);

  let winningCartRule: DiscountRuleRecord | null = null;
  if (nonStackableCart.length > 0) {
    const ranked = [...nonStackableCart].sort((a, b) => {
      const saveA = calculateRuleSaving(preCartTotal, a);
      const saveB = calculateRuleSaving(preCartTotal, b);
      const cmp = saveB.comparedTo(saveA);
      if (cmp !== 0) return cmp;
      return a.rule_code.localeCompare(b.rule_code);
    });
    winningCartRule = ranked[0];
    for (const loser of ranked.slice(1)) {
      skippedCartRules.push({
        rule_code: loser.rule_code,
        reason: `Outperformed by ${winningCartRule.rule_code}.`,
      });
    }
  }

  let runningCartTotal = preCartTotal;
  const appliedCartRules: AppliedRuleDetail[] = [];
  const cartPhrases: string[] = [];

  if (winningCartRule) {
    const saving = calculateRuleSaving(runningCartTotal, winningCartRule);
    runningCartTotal = Decimal.max(new Decimal(0), runningCartTotal.sub(saving));
    appliedCartRules.push({
      id: winningCartRule.id,
      rule_code: winningCartRule.rule_code,
      scope: 'cart',
      applies_to: winningCartRule.applies_to,
      discount_type: winningCartRule.discount_type,
      value: toDecimal(winningCartRule.value).toNumber(),
      stackable: false,
      saving_amount: saving.toNumber(),
    });
    cartPhrases.push(formatRulePhrase(winningCartRule));
  }

  for (const sCartRule of stackableCart) {
    const saving = calculateRuleSaving(runningCartTotal, sCartRule);
    runningCartTotal = Decimal.max(new Decimal(0), runningCartTotal.sub(saving));
    appliedCartRules.push({
      id: sCartRule.id,
      rule_code: sCartRule.rule_code,
      scope: 'cart',
      applies_to: sCartRule.applies_to,
      discount_type: sCartRule.discount_type,
      value: toDecimal(sCartRule.value).toNumber(),
      stackable: true,
      saving_amount: saving.toNumber(),
    });
    cartPhrases.push(`${formatRulePhrase(sCartRule)} (stackable)`);
  }

  const finalTotal = Decimal.max(new Decimal(0), runningCartTotal).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const cartDiscountTotal = Decimal.max(new Decimal(0), preCartTotal.sub(finalTotal));
  const totalSavings = Decimal.max(new Decimal(0), originalTotal.sub(finalTotal));

  let cartExplanation = 'No cart-level discount triggered.';
  if (appliedCartRules.length > 0 && cartDiscountTotal.gt(0)) {
    cartExplanation = `${cartPhrases.join(' + ')} applied. You saved Rs.${cartDiscountTotal.toNumber().toLocaleString('en-IN')}.`;
  } else if (skippedCartRules.length > 0) {
    cartExplanation = skippedCartRules[0].reason;
  }

  return {
    original_total: originalTotal.toNumber(),
    item_discount_total: itemDiscountTotal.toNumber(),
    pre_cart_discount_total: preCartTotal.toNumber(),
    cart_discount_total: cartDiscountTotal.toNumber(),
    final_total: finalTotal.toNumber(),
    total_savings: totalSavings.toNumber(),
    items: itemDetails,
    applied_cart_rules: appliedCartRules,
    skipped_cart_rules: skippedCartRules,
    cart_explanation: cartExplanation,
    rounding_policy: 'INR integer rounding using Decimal ROUND_HALF_UP at each sequential discount step.',
  };
}
