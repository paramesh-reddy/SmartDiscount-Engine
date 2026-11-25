export type RuleScope = 'platform' | 'brand' | 'cart';
export type DiscountType = 'percentage' | 'flat';

export interface DiscountRule {
  id: string;
  rule_code: string;
  scope: RuleScope;
  applies_to: string | null;
  discount_type: DiscountType;
  value: number;
  stackable: boolean;
  min_cart_value: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DiscountRulePayload {
  rule_code?: string;
  scope: RuleScope;
  applies_to: string | null;
  discount_type: DiscountType;
  value: number;
  stackable: boolean;
  min_cart_value: number | null;
  is_active?: boolean;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_name: string;
  brand: string;
  platform: string;
  base_price: number;
  final_price: number;
  discount_amount: number;
  explanation?: string;
  created_at?: string;
}

export interface CartItemPayload {
  product_name: string;
  brand: string;
  platform: string;
  base_price: number;
}

export interface Cart {
  id: string;
  cart_name: string;
  currency: string;
  original_total: number;
  item_discount_total: number;
  cart_discount_total: number;
  final_total: number;
  created_at: string;
  updated_at: string;
  items: CartItem[];
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

export interface CartCalculationDetails {
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

export interface CalculationResult {
  id: string;
  cart_id: string;
  original_total: number;
  item_discount_total: number;
  cart_discount_total: number;
  final_total: number;
  calculation_details: CartCalculationDetails;
  created_at: string;
}

export interface ParsedAiRule {
  scope: RuleScope | null;
  applies_to: string | null;
  discount_type: DiscountType | null;
  value: number | null;
  stackable: boolean;
  min_cart_value: number | null;
  is_valid: boolean;
  clarification_message: string | null;
  provider?: string;
}

export interface ValidatedPdfRow {
  row_number: number;
  product_name: string;
  brand: string;
  platform: string;
  base_price: number;
}

export interface MalformedPdfRow {
  row_number: number;
  raw_text: string;
  errors: string[];
  partial: {
    product_name: string;
    brand: string;
    platform: string;
    base_price: string;
  };
}

export interface PdfUploadPreview {
  filename: string;
  total_pages: number;
  valid_rows: ValidatedPdfRow[];
  malformed_rows: MalformedPdfRow[];
  warnings: string[];
}
