import { Pool } from 'pg';
import crypto from 'node:crypto';
import {
  calculateCartDiscounts,
  CartCalculationOutput,
  CartItemInput,
  DiscountRuleRecord,
  DiscountType,
  RuleScope,
} from './discountEngine';

export interface CartRecord {
  id: string;
  cart_name: string;
  currency: string;
  original_total: number;
  item_discount_total: number;
  cart_discount_total: number;
  final_total: number;
  created_at: string;
  updated_at: string;
  items: CartItemRecord[];
}

export interface CartItemRecord {
  id: string;
  cart_id: string;
  product_name: string;
  brand: string;
  platform: string;
  base_price: number;
  final_price: number;
  discount_amount: number;
  explanation?: string;
  created_at: string;
}

export interface CalculationResultRecord {
  id: string;
  cart_id: string;
  original_total: number;
  item_discount_total: number;
  cart_discount_total: number;
  final_total: number;
  calculation_details: CartCalculationOutput;
  created_at: string;
}

export interface RuleFilters {
  scope?: string;
  platform?: string;
  brand?: string;
  discount_type?: string;
  is_active?: string;
  search?: string;
  page?: number;
  limit?: number;
}

const SEED_RULES: Array<Omit<DiscountRuleRecord, 'id' | 'created_at' | 'updated_at'>> = [
  {
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

const SEED_CART_ITEMS = [
  { product_name: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', base_price: 1299 },
  { product_name: 'Bed Sheet Set', brand: 'Natura Casa', platform: 'Flipkart', base_price: 849 },
  { product_name: 'Wall Shelf', brand: 'LivSpace Pro', platform: 'Amazon India', base_price: 599 },
  { product_name: 'Ceramic Vase', brand: 'LivSpace Pro', platform: 'Noon', base_price: 2499 },
  { product_name: 'Cutting Board', brand: 'Nordic Basics', platform: 'Amazon India', base_price: 449 },
  { product_name: 'Desk Organiser', brand: 'Nordic Basics', platform: 'Flipkart', base_price: 899 },
];

export class DiscountEngineRepository {
  private pool: Pool | null = null;
  private initialized = false;

  // In-memory store used only when DATABASE_URL is not configured in preview
  private memRules: DiscountRuleRecord[] = [];
  private memCarts: CartRecord[] = [];
  private memCalculations: CalculationResultRecord[] = [];

  constructor() {
    const dbUrl = process.env.DATABASE_URL?.trim();
    if (dbUrl && !dbUrl.includes('ep-example') && !dbUrl.includes('your_neon')) {
      this.pool = new Pool({
        connectionString: dbUrl,
        ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
      });
    }
  }

  get storageMode(): 'postgresql' | 'memory' {
    return this.pool ? 'postgresql' : 'memory';
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    if (this.pool) {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS discount_rules (
          id UUID PRIMARY KEY,
          rule_code VARCHAR(64) UNIQUE NOT NULL,
          scope VARCHAR(20) NOT NULL CHECK (scope IN ('platform', 'brand', 'cart')),
          applies_to VARCHAR(150),
          discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'flat')),
          value NUMERIC(12, 2) NOT NULL CHECK (value > 0),
          stackable BOOLEAN NOT NULL DEFAULT FALSE,
          min_cart_value NUMERIC(12, 2),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_discount_rules_scope ON discount_rules(scope);
        CREATE INDEX IF NOT EXISTS idx_discount_rules_active ON discount_rules(is_active);

        CREATE TABLE IF NOT EXISTS carts (
          id UUID PRIMARY KEY,
          cart_name VARCHAR(180) NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'INR',
          original_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
          item_discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
          cart_discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
          final_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS cart_items (
          id UUID PRIMARY KEY,
          cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
          product_name VARCHAR(180) NOT NULL,
          brand VARCHAR(120) NOT NULL,
          platform VARCHAR(120) NOT NULL,
          base_price NUMERIC(12, 2) NOT NULL CHECK (base_price > 0),
          final_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
          discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);

        CREATE TABLE IF NOT EXISTS calculation_results (
          id UUID PRIMARY KEY,
          cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
          original_total NUMERIC(12, 2) NOT NULL,
          item_discount_total NUMERIC(12, 2) NOT NULL,
          cart_discount_total NUMERIC(12, 2) NOT NULL,
          final_total NUMERIC(12, 2) NOT NULL,
          calculation_details JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_calculation_results_cart_id ON calculation_results(cart_id);
      `);

      const { rows } = await this.pool.query('SELECT COUNT(*)::int AS cnt FROM discount_rules');
      if (rows[0].cnt === 0) {
        await this.seedPostgres();
      }
    } else {
      this.seedMemory();
    }

    this.initialized = true;
  }

  private async seedPostgres(): Promise<void> {
    if (!this.pool) return;
    for (const rule of SEED_RULES) {
      await this.pool.query(
        `INSERT INTO discount_rules (id, rule_code, scope, applies_to, discount_type, value, stackable, min_cart_value, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (rule_code) DO NOTHING`,
        [
          crypto.randomUUID(),
          rule.rule_code,
          rule.scope,
          rule.applies_to,
          rule.discount_type,
          rule.value,
          rule.stackable,
          rule.min_cart_value,
          rule.is_active,
        ]
      );
    }

    const { rows: existingCarts } = await this.pool.query('SELECT COUNT(*)::int AS cnt FROM carts');
    if (existingCarts[0].cnt === 0) {
      const cartId = crypto.randomUUID();
      await this.pool.query(
        `INSERT INTO carts (id, cart_name, currency) VALUES ($1, $2, 'INR')`,
        [cartId, 'Opptra Sample Cart']
      );
      for (const item of SEED_CART_ITEMS) {
        await this.pool.query(
          `INSERT INTO cart_items (id, cart_id, product_name, brand, platform, base_price, final_price, discount_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $6, 0)`,
          [crypto.randomUUID(), cartId, item.product_name, item.brand, item.platform, item.base_price]
        );
      }
      await this.calculateAndPersistCart(cartId);
    }
  }

  private seedMemory(): void {
    const now = new Date().toISOString();
    this.memRules = SEED_RULES.map((r) => ({
      ...r,
      id: crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }));

    const cartId = crypto.randomUUID();
    const items: CartItemRecord[] = SEED_CART_ITEMS.map((item, idx) => ({
      id: crypto.randomUUID(),
      cart_id: cartId,
      product_name: item.product_name,
      brand: item.brand,
      platform: item.platform,
      base_price: item.base_price,
      final_price: item.base_price,
      discount_amount: 0,
      created_at: new Date(Date.now() + idx).toISOString(),
    }));

    this.memCarts = [
      {
        id: cartId,
        cart_name: 'Opptra Sample Cart',
        currency: 'INR',
        original_total: 0,
        item_discount_total: 0,
        cart_discount_total: 0,
        final_total: 0,
        created_at: now,
        updated_at: now,
        items,
      },
    ];

    this.recalculateMemoryCart(cartId);
  }

  private recalculateMemoryCart(cartId: string): CalculationResultRecord | null {
    const cart = this.memCarts.find((c) => c.id === cartId);
    if (!cart) return null;

    const calc = calculateCartDiscounts(cart.items, this.memRules);
    const detailMap = new Map(calc.items.map((d) => [d.item_id, d]));

    cart.items = cart.items.map((item) => {
      const detail = detailMap.get(item.id);
      return {
        ...item,
        final_price: detail ? detail.final_price : item.base_price,
        discount_amount: detail ? detail.discount_amount : 0,
        explanation: detail ? detail.explanation : 'No offers available.',
      };
    });

    cart.original_total = calc.original_total;
    cart.item_discount_total = calc.item_discount_total;
    cart.cart_discount_total = calc.cart_discount_total;
    cart.final_total = calc.final_total;
    cart.updated_at = new Date().toISOString();

    const record: CalculationResultRecord = {
      id: crypto.randomUUID(),
      cart_id: cart.id,
      original_total: calc.original_total,
      item_discount_total: calc.item_discount_total,
      cart_discount_total: calc.cart_discount_total,
      final_total: calc.final_total,
      calculation_details: calc,
      created_at: new Date().toISOString(),
    };
    this.memCalculations.unshift(record);
    if (this.memCalculations.length > 50) {
      this.memCalculations = this.memCalculations.slice(0, 50);
    }
    return record;
  }

  private mapRuleRow(row: Record<string, unknown>): DiscountRuleRecord {
    return {
      id: String(row.id),
      rule_code: String(row.rule_code),
      scope: row.scope as RuleScope,
      applies_to: row.applies_to === null ? null : String(row.applies_to),
      discount_type: row.discount_type as DiscountType,
      value: Number(row.value),
      stackable: Boolean(row.stackable),
      min_cart_value: row.min_cart_value === null ? null : Number(row.min_cart_value),
      is_active: Boolean(row.is_active),
      created_at: row.created_at ? new Date(String(row.created_at)).toISOString() : undefined,
      updated_at: row.updated_at ? new Date(String(row.updated_at)).toISOString() : undefined,
    };
  }

  async listRules(filters: RuleFilters = {}): Promise<{ items: DiscountRuleRecord[]; total: number }> {
    await this.init();
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 50));

    if (this.pool) {
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters.scope && filters.scope !== 'all') {
        params.push(filters.scope.toLowerCase());
        conditions.push(`scope = $${params.length}`);
      }
      if (filters.discount_type && filters.discount_type !== 'all') {
        params.push(filters.discount_type.toLowerCase());
        conditions.push(`discount_type = $${params.length}`);
      }
      if (filters.platform && filters.platform !== 'all') {
        params.push(filters.platform.trim().toLowerCase());
        conditions.push(`(scope = 'platform' AND LOWER(applies_to) = $${params.length})`);
      }
      if (filters.brand && filters.brand !== 'all') {
        params.push(filters.brand.trim().toLowerCase());
        conditions.push(`(scope = 'brand' AND LOWER(applies_to) = $${params.length})`);
      }
      if (filters.is_active === 'true' || filters.is_active === 'false') {
        params.push(filters.is_active === 'true');
        conditions.push(`is_active = $${params.length}`);
      }
      if (filters.search?.trim()) {
        params.push(`%${filters.search.trim().toLowerCase()}%`);
        conditions.push(`(LOWER(rule_code) LIKE $${params.length} OR LOWER(COALESCE(applies_to, '')) LIKE $${params.length})`);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const countRes = await this.pool.query(`SELECT COUNT(*)::int AS cnt FROM discount_rules ${where}`, params);
      const offset = (page - 1) * limit;
      const listRes = await this.pool.query(
        `SELECT * FROM discount_rules ${where} ORDER BY rule_code ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      return {
        items: listRes.rows.map((r) => this.mapRuleRow(r)),
        total: countRes.rows[0].cnt,
      };
    }

    let list = [...this.memRules];
    if (filters.scope && filters.scope !== 'all') {
      list = list.filter((r) => r.scope === filters.scope);
    }
    if (filters.discount_type && filters.discount_type !== 'all') {
      list = list.filter((r) => r.discount_type === filters.discount_type);
    }
    if (filters.platform && filters.platform !== 'all') {
      list = list.filter(
        (r) => r.scope === 'platform' && (r.applies_to ?? '').toLowerCase() === filters.platform!.toLowerCase()
      );
    }
    if (filters.brand && filters.brand !== 'all') {
      list = list.filter(
        (r) => r.scope === 'brand' && (r.applies_to ?? '').toLowerCase() === filters.brand!.toLowerCase()
      );
    }
    if (filters.is_active === 'true' || filters.is_active === 'false') {
      const want = filters.is_active === 'true';
      list = list.filter((r) => r.is_active === want);
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (r) => r.rule_code.toLowerCase().includes(q) || (r.applies_to ?? '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => a.rule_code.localeCompare(b.rule_code));
    const total = list.length;
    const start = (page - 1) * limit;
    return { items: list.slice(start, start + limit), total };
  }

  async getRuleById(id: string): Promise<DiscountRuleRecord | null> {
    await this.init();
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM discount_rules WHERE id = $1', [id]);
      return res.rows[0] ? this.mapRuleRow(res.rows[0]) : null;
    }
    return this.memRules.find((r) => r.id === id) ?? null;
  }

  async nextRuleCode(): Promise<string> {
    await this.init();
    const { items } = await this.listRules({ limit: 100 });
    let maxNum = 0;
    for (const r of items) {
      const match = /^RULE-(\d+)$/i.exec(r.rule_code);
      if (match) {
        maxNum = Math.max(maxNum, Number(match[1]));
      }
    }
    return `RULE-${String(maxNum + 1).padStart(2, '0')}`;
  }

  async createRule(input: {
    rule_code?: string;
    scope: RuleScope;
    applies_to: string | null;
    discount_type: DiscountType;
    value: number;
    stackable: boolean;
    min_cart_value: number | null;
    is_active?: boolean;
  }): Promise<DiscountRuleRecord> {
    await this.init();
    const id = crypto.randomUUID();
    const ruleCode = input.rule_code?.trim() || (await this.nextRuleCode());
    const appliesTo = input.scope === 'cart' ? null : input.applies_to?.trim() || null;
    const minCartValue = input.scope === 'cart' ? input.min_cart_value : null;
    const isActive = input.is_active ?? true;

    if (this.pool) {
      const res = await this.pool.query(
        `INSERT INTO discount_rules (id, rule_code, scope, applies_to, discount_type, value, stackable, min_cart_value, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [id, ruleCode, input.scope, appliesTo, input.discount_type, input.value, input.stackable, minCartValue, isActive]
      );
      await this.recalculateAllCarts();
      return this.mapRuleRow(res.rows[0]);
    }

    if (this.memRules.some((r) => r.rule_code.toLowerCase() === ruleCode.toLowerCase())) {
      const err = new Error(`Rule code "${ruleCode}" already exists.`);
      (err as Error & { statusCode?: number }).statusCode = 409;
      throw err;
    }

    const now = new Date().toISOString();
    const record: DiscountRuleRecord = {
      id,
      rule_code: ruleCode,
      scope: input.scope,
      applies_to: appliesTo,
      discount_type: input.discount_type,
      value: input.value,
      stackable: input.stackable,
      min_cart_value: minCartValue,
      is_active: isActive,
      created_at: now,
      updated_at: now,
    };
    this.memRules.push(record);
    await this.recalculateAllCarts();
    return record;
  }

  async updateRule(
    id: string,
    patch: Partial<{
      rule_code: string;
      scope: RuleScope;
      applies_to: string | null;
      discount_type: DiscountType;
      value: number;
      stackable: boolean;
      min_cart_value: number | null;
      is_active: boolean;
    }>
  ): Promise<DiscountRuleRecord | null> {
    await this.init();
    const existing = await this.getRuleById(id);
    if (!existing) return null;

    const nextScope = patch.scope ?? existing.scope;
    const nextAppliesTo = nextScope === 'cart' ? null : (patch.applies_to !== undefined ? patch.applies_to : existing.applies_to);
    const nextMinCart = nextScope === 'cart' ? (patch.min_cart_value !== undefined ? patch.min_cart_value : existing.min_cart_value) : null;

    const updated: DiscountRuleRecord = {
      ...existing,
      rule_code: patch.rule_code?.trim() ?? existing.rule_code,
      scope: nextScope,
      applies_to: nextAppliesTo,
      discount_type: patch.discount_type ?? existing.discount_type,
      value: patch.value ?? existing.value,
      stackable: patch.stackable !== undefined ? patch.stackable : existing.stackable,
      min_cart_value: nextMinCart,
      is_active: patch.is_active !== undefined ? patch.is_active : existing.is_active,
      updated_at: new Date().toISOString(),
    };

    if (this.pool) {
      const res = await this.pool.query(
        `UPDATE discount_rules
         SET rule_code = $2, scope = $3, applies_to = $4, discount_type = $5, value = $6, stackable = $7, min_cart_value = $8, is_active = $9, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [
          id,
          updated.rule_code,
          updated.scope,
          updated.applies_to,
          updated.discount_type,
          updated.value,
          updated.stackable,
          updated.min_cart_value,
          updated.is_active,
        ]
      );
      await this.recalculateAllCarts();
      return this.mapRuleRow(res.rows[0]);
    }

    const idx = this.memRules.findIndex((r) => r.id === id);
    this.memRules[idx] = updated;
    await this.recalculateAllCarts();
    return updated;
  }

  async deleteRule(id: string): Promise<boolean> {
    await this.init();
    if (this.pool) {
      const res = await this.pool.query('DELETE FROM discount_rules WHERE id = $1', [id]);
      if ((res.rowCount ?? 0) > 0) {
        await this.recalculateAllCarts();
        return true;
      }
      return false;
    }

    const prevLen = this.memRules.length;
    this.memRules = this.memRules.filter((r) => r.id !== id);
    if (this.memRules.length !== prevLen) {
      await this.recalculateAllCarts();
      return true;
    }
    return false;
  }

  async listCarts(): Promise<CartRecord[]> {
    await this.init();
    if (this.pool) {
      const cartsRes = await this.pool.query('SELECT * FROM carts ORDER BY created_at ASC');
      const results: CartRecord[] = [];
      for (const c of cartsRes.rows) {
        const itemsRes = await this.pool.query(
          'SELECT * FROM cart_items WHERE cart_id = $1 ORDER BY created_at ASC',
          [c.id]
        );
        const latestCalc = await this.getLatestCalculation(c.id);
        const explanationMap = new Map(
          latestCalc?.calculation_details.items.map((d) => [d.item_id, d.explanation]) ?? []
        );
        results.push({
          id: String(c.id),
          cart_name: String(c.cart_name),
          currency: String(c.currency),
          original_total: Number(c.original_total),
          item_discount_total: Number(c.item_discount_total),
          cart_discount_total: Number(c.cart_discount_total),
          final_total: Number(c.final_total),
          created_at: new Date(String(c.created_at)).toISOString(),
          updated_at: new Date(String(c.updated_at)).toISOString(),
          items: itemsRes.rows.map((i) => ({
            id: String(i.id),
            cart_id: String(i.cart_id),
            product_name: String(i.product_name),
            brand: String(i.brand),
            platform: String(i.platform),
            base_price: Number(i.base_price),
            final_price: Number(i.final_price),
            discount_amount: Number(i.discount_amount),
            explanation: explanationMap.get(String(i.id)) ?? 'No offers available.',
            created_at: new Date(String(i.created_at)).toISOString(),
          })),
        });
      }
      return results;
    }

    return this.memCarts;
  }

  async getCartById(id: string): Promise<CartRecord | null> {
    await this.init();
    const carts = await this.listCarts();
    return carts.find((c) => c.id === id) ?? null;
  }

  async createCart(input: {
    cart_name: string;
    currency?: string;
    items?: Array<{ product_name: string; brand: string; platform: string; base_price: number }>;
  }): Promise<CartRecord> {
    await this.init();
    const cartId = crypto.randomUUID();
    const currency = input.currency || 'INR';

    if (this.pool) {
      await this.pool.query('INSERT INTO carts (id, cart_name, currency) VALUES ($1, $2, $3)', [
        cartId,
        input.cart_name.trim(),
        currency,
      ]);
      for (const item of input.items ?? []) {
        await this.pool.query(
          `INSERT INTO cart_items (id, cart_id, product_name, brand, platform, base_price, final_price, discount_amount)
           VALUES ($1, $2, $3, $4, $5, $6, $6, 0)`,
          [crypto.randomUUID(), cartId, item.product_name.trim(), item.brand.trim(), item.platform.trim(), item.base_price]
        );
      }
      await this.calculateAndPersistCart(cartId);
      return (await this.getCartById(cartId))!;
    }

    const now = new Date().toISOString();
    const items: CartItemRecord[] = (input.items ?? []).map((item, idx) => ({
      id: crypto.randomUUID(),
      cart_id: cartId,
      product_name: item.product_name.trim(),
      brand: item.brand.trim(),
      platform: item.platform.trim(),
      base_price: item.base_price,
      final_price: item.base_price,
      discount_amount: 0,
      created_at: new Date(Date.now() + idx).toISOString(),
    }));
    const cart: CartRecord = {
      id: cartId,
      cart_name: input.cart_name.trim(),
      currency,
      original_total: 0,
      item_discount_total: 0,
      cart_discount_total: 0,
      final_total: 0,
      created_at: now,
      updated_at: now,
      items,
    };
    this.memCarts.push(cart);
    this.recalculateMemoryCart(cartId);
    return (await this.getCartById(cartId))!;
  }

  async updateCart(
    id: string,
    patch: {
      cart_name?: string;
      items?: Array<{ product_name: string; brand: string; platform: string; base_price: number }>;
    }
  ): Promise<CartRecord | null> {
    await this.init();
    const existing = await this.getCartById(id);
    if (!existing) return null;

    if (this.pool) {
      if (patch.cart_name !== undefined) {
        await this.pool.query('UPDATE carts SET cart_name = $2, updated_at = NOW() WHERE id = $1', [
          id,
          patch.cart_name.trim(),
        ]);
      }
      if (patch.items !== undefined) {
        await this.pool.query('DELETE FROM cart_items WHERE cart_id = $1', [id]);
        for (const item of patch.items) {
          await this.pool.query(
            `INSERT INTO cart_items (id, cart_id, product_name, brand, platform, base_price, final_price, discount_amount)
             VALUES ($1, $2, $3, $4, $5, $6, $6, 0)`,
            [crypto.randomUUID(), id, item.product_name.trim(), item.brand.trim(), item.platform.trim(), item.base_price]
          );
        }
      }
      await this.calculateAndPersistCart(id);
      return await this.getCartById(id);
    }

    if (patch.cart_name !== undefined) {
      existing.cart_name = patch.cart_name.trim();
    }
    if (patch.items !== undefined) {
      existing.items = patch.items.map((item, idx) => ({
        id: crypto.randomUUID(),
        cart_id: id,
        product_name: item.product_name.trim(),
        brand: item.brand.trim(),
        platform: item.platform.trim(),
        base_price: item.base_price,
        final_price: item.base_price,
        discount_amount: 0,
        created_at: new Date(Date.now() + idx).toISOString(),
      }));
    }
    this.recalculateMemoryCart(id);
    return await this.getCartById(id);
  }

  async deleteCart(id: string): Promise<boolean> {
    await this.init();
    if (this.pool) {
      const res = await this.pool.query('DELETE FROM carts WHERE id = $1', [id]);
      return (res.rowCount ?? 0) > 0;
    }
    const prev = this.memCarts.length;
    this.memCarts = this.memCarts.filter((c) => c.id !== id);
    this.memCalculations = this.memCalculations.filter((r) => r.cart_id !== id);
    return this.memCarts.length !== prev;
  }

  async addCartItem(
    cartId: string,
    input: { product_name: string; brand: string; platform: string; base_price: number }
  ): Promise<CartRecord | null> {
    await this.init();
    const cart = await this.getCartById(cartId);
    if (!cart) return null;

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO cart_items (id, cart_id, product_name, brand, platform, base_price, final_price, discount_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $6, 0)`,
        [crypto.randomUUID(), cartId, input.product_name.trim(), input.brand.trim(), input.platform.trim(), input.base_price]
      );
      await this.calculateAndPersistCart(cartId);
      return await this.getCartById(cartId);
    }

    cart.items.push({
      id: crypto.randomUUID(),
      cart_id: cartId,
      product_name: input.product_name.trim(),
      brand: input.brand.trim(),
      platform: input.platform.trim(),
      base_price: input.base_price,
      final_price: input.base_price,
      discount_amount: 0,
      created_at: new Date().toISOString(),
    });
    this.recalculateMemoryCart(cartId);
    return await this.getCartById(cartId);
  }

  async updateCartItem(
    cartId: string,
    itemId: string,
    patch: Partial<{ product_name: string; brand: string; platform: string; base_price: number }>
  ): Promise<CartRecord | null> {
    await this.init();
    const cart = await this.getCartById(cartId);
    if (!cart) return null;
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) return null;

    const next = {
      product_name: patch.product_name?.trim() ?? item.product_name,
      brand: patch.brand?.trim() ?? item.brand,
      platform: patch.platform?.trim() ?? item.platform,
      base_price: patch.base_price ?? item.base_price,
    };

    if (this.pool) {
      await this.pool.query(
        `UPDATE cart_items SET product_name = $3, brand = $4, platform = $5, base_price = $6 WHERE id = $1 AND cart_id = $2`,
        [itemId, cartId, next.product_name, next.brand, next.platform, next.base_price]
      );
      await this.calculateAndPersistCart(cartId);
      return await this.getCartById(cartId);
    }

    Object.assign(item, next);
    this.recalculateMemoryCart(cartId);
    return await this.getCartById(cartId);
  }

  async deleteCartItem(cartId: string, itemId: string): Promise<CartRecord | null> {
    await this.init();
    const cart = await this.getCartById(cartId);
    if (!cart) return null;
    const exists = cart.items.some((i) => i.id === itemId);
    if (!exists) return null;

    if (this.pool) {
      await this.pool.query('DELETE FROM cart_items WHERE id = $1 AND cart_id = $2', [itemId, cartId]);
      await this.calculateAndPersistCart(cartId);
      return await this.getCartById(cartId);
    }

    cart.items = cart.items.filter((i) => i.id !== itemId);
    this.recalculateMemoryCart(cartId);
    return await this.getCartById(cartId);
  }

  async calculateAndPersistCart(cartId: string): Promise<CalculationResultRecord | null> {
    await this.init();
    if (this.pool) {
      const cartRes = await this.pool.query('SELECT * FROM carts WHERE id = $1', [cartId]);
      if (!cartRes.rows[0]) return null;
      const itemsRes = await this.pool.query(
        'SELECT * FROM cart_items WHERE cart_id = $1 ORDER BY created_at ASC',
        [cartId]
      );
      const rulesRes = await this.pool.query('SELECT * FROM discount_rules ORDER BY rule_code ASC');
      const rules = rulesRes.rows.map((r) => this.mapRuleRow(r));
      const items: CartItemInput[] = itemsRes.rows.map((i) => ({
        id: String(i.id),
        cart_id: String(i.cart_id),
        product_name: String(i.product_name),
        brand: String(i.brand),
        platform: String(i.platform),
        base_price: Number(i.base_price),
      }));

      const calc = calculateCartDiscounts(items, rules);

      for (const itemDetail of calc.items) {
        await this.pool.query(
          'UPDATE cart_items SET final_price = $2, discount_amount = $3 WHERE id = $1',
          [itemDetail.item_id, itemDetail.final_price, itemDetail.discount_amount]
        );
      }

      await this.pool.query(
        `UPDATE carts
         SET original_total = $2, item_discount_total = $3, cart_discount_total = $4, final_total = $5, updated_at = NOW()
         WHERE id = $1`,
        [cartId, calc.original_total, calc.item_discount_total, calc.cart_discount_total, calc.final_total]
      );

      const calcId = crypto.randomUUID();
      const inserted = await this.pool.query(
        `INSERT INTO calculation_results (id, cart_id, original_total, item_discount_total, cart_discount_total, final_total, calculation_details)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
        [
          calcId,
          cartId,
          calc.original_total,
          calc.item_discount_total,
          calc.cart_discount_total,
          calc.final_total,
          JSON.stringify(calc),
        ]
      );
      const row = inserted.rows[0];
      return {
        id: String(row.id),
        cart_id: String(row.cart_id),
        original_total: Number(row.original_total),
        item_discount_total: Number(row.item_discount_total),
        cart_discount_total: Number(row.cart_discount_total),
        final_total: Number(row.final_total),
        calculation_details: row.calculation_details as CartCalculationOutput,
        created_at: new Date(String(row.created_at)).toISOString(),
      };
    }

    return this.recalculateMemoryCart(cartId);
  }

  async recalculateAllCarts(): Promise<void> {
    const carts = await this.listCarts();
    for (const c of carts) {
      await this.calculateAndPersistCart(c.id);
    }
  }

  async getLatestCalculation(cartId: string): Promise<CalculationResultRecord | null> {
    const history = await this.getCalculationHistory(cartId, 1);
    return history[0] ?? null;
  }

  async getCalculationHistory(cartId: string, limit = 20): Promise<CalculationResultRecord[]> {
    await this.init();
    if (this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM calculation_results WHERE cart_id = $1 ORDER BY created_at DESC LIMIT $2',
        [cartId, limit]
      );
      return res.rows.map((row) => ({
        id: String(row.id),
        cart_id: String(row.cart_id),
        original_total: Number(row.original_total),
        item_discount_total: Number(row.item_discount_total),
        cart_discount_total: Number(row.cart_discount_total),
        final_total: Number(row.final_total),
        calculation_details: row.calculation_details as CartCalculationOutput,
        created_at: new Date(String(row.created_at)).toISOString(),
      }));
    }

    return this.memCalculations.filter((r) => r.cart_id === cartId).slice(0, limit);
  }
}

export const repository = new DiscountEngineRepository();
