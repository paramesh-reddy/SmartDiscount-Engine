import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { repository } from './repository';
import { parseNaturalLanguageRule } from './aiRuleParser';
import { extractCartFromPdf, MAX_PDF_BYTES } from './pdfParser';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES },
});

const RuleCreateSchema = z
  .object({
    rule_code: z.string().trim().min(1).max(64).optional(),
    scope: z.enum(['platform', 'brand', 'cart']),
    applies_to: z.string().trim().max(150).nullable().optional(),
    discount_type: z.enum(['percentage', 'flat']),
    value: z.number().positive('Discount value must be positive'),
    stackable: z.boolean().default(false),
    min_cart_value: z.number().positive('Minimum cart value must be positive').nullable().optional(),
    is_active: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.discount_type === 'percentage' && data.value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Percentage discount cannot exceed 100.' });
    }
    if ((data.scope === 'platform' || data.scope === 'brand') && (!data.applies_to || !data.applies_to.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `applies_to is required when scope is "${data.scope}".` });
    }
    if (data.scope === 'cart' && (data.min_cart_value === null || data.min_cart_value === undefined)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'min_cart_value is required when scope is "cart".' });
    }
  });

const RuleUpdateSchema = z.object({
  rule_code: z.string().trim().min(1).max(64).optional(),
  scope: z.enum(['platform', 'brand', 'cart']).optional(),
  applies_to: z.string().trim().max(150).nullable().optional(),
  discount_type: z.enum(['percentage', 'flat']).optional(),
  value: z.number().positive().optional(),
  stackable: z.boolean().optional(),
  min_cart_value: z.number().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

const CartItemPayloadSchema = z.object({
  product_name: z.string().trim().min(1, 'Product name is required').max(180),
  brand: z.string().trim().min(1, 'Brand is required').max(120),
  platform: z.string().trim().min(1, 'Platform is required').max(120),
  base_price: z.number().positive('Base price must be greater than 0'),
});

const CartCreateSchema = z.object({
  cart_name: z.string().trim().min(1, 'Cart name is required').max(180),
  currency: z.string().trim().default('INR').optional(),
  items: z.array(CartItemPayloadSchema).optional(),
});

const CartUpdateSchema = z.object({
  cart_name: z.string().trim().min(1).max(180).optional(),
  items: z.array(CartItemPayloadSchema).optional(),
});

const AiParseSchema = z.object({
  text: z.string().trim().min(3, 'Please enter a discount description.').max(600),
});

const ImportPdfPreviewSchema = z.object({
  cart_id: z.string().uuid().optional(),
  cart_name: z.string().trim().min(1).max(180).optional(),
  items: z.array(CartItemPayloadSchema).min(1, 'At least one valid item is required to import.'),
});

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  // Health check
  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      await repository.init();
      res.json({
        status: 'ok',
        service: 'opptra-discount-engine-api',
        storage: repository.storageMode,
        ai_configured: Boolean(
          (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key') ||
            (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY')
        ),
        timestamp: new Date().toISOString(),
      });
    })
  );

  // OpenAPI JSON specification
  router.get('/openapi.json', (_req, res) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'Opptra AI Discount Engine API',
        version: '1.0.0',
        description: 'REST API for discount rules, carts, Decimal calculations, AI rule parsing, and PDF extraction.',
      },
      paths: {
        '/api/v1/health': { get: { summary: 'Health check' } },
        '/api/v1/discount-rules': {
          get: { summary: 'List discount rules with filters and pagination' },
          post: { summary: 'Create a discount rule' },
        },
        '/api/v1/discount-rules/{id}': {
          get: { summary: 'Get rule by ID' },
          put: { summary: 'Update rule by ID' },
          delete: { summary: 'Delete rule by ID' },
        },
        '/api/v1/carts': {
          get: { summary: 'List carts' },
          post: { summary: 'Create cart' },
        },
        '/api/v1/carts/{id}': {
          get: { summary: 'Get cart by ID' },
          put: { summary: 'Update or replace cart items' },
          delete: { summary: 'Delete cart' },
        },
        '/api/v1/carts/{id}/items': { post: { summary: 'Add item to cart' } },
        '/api/v1/carts/{id}/items/{item_id}': {
          put: { summary: 'Update cart item' },
          delete: { summary: 'Remove cart item' },
        },
        '/api/v1/carts/{id}/calculate': { post: { summary: 'Run discount calculation on cart' } },
        '/api/v1/carts/{id}/results': { get: { summary: 'Get calculation history for cart' } },
        '/api/v1/ai/parse-rule': { post: { summary: 'Parse natural language discount rule via AI' } },
        '/api/v1/carts/upload-pdf': { post: { summary: 'Upload and extract cart preview from PDF' } },
        '/api/v1/carts/import-pdf-preview': { post: { summary: 'Confirm and import validated PDF rows into cart' } },
      },
    });
  });

  // Discount Rules
  router.get(
    '/discount-rules',
    asyncHandler(async (req, res) => {
      const result = await repository.listRules({
        scope: typeof req.query.scope === 'string' ? req.query.scope : undefined,
        platform: typeof req.query.platform === 'string' ? req.query.platform : undefined,
        brand: typeof req.query.brand === 'string' ? req.query.brand : undefined,
        discount_type: typeof req.query.discount_type === 'string' ? req.query.discount_type : undefined,
        is_active: typeof req.query.is_active === 'string' ? req.query.is_active : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 50,
      });
      res.json(result);
    })
  );

  router.post(
    '/discount-rules',
    asyncHandler(async (req, res) => {
      const parsed = RuleCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ detail: parsed.error.issues.map((i) => i.message).join(' ') });
        return;
      }
      const created = await repository.createRule({
        ...parsed.data,
        applies_to: parsed.data.applies_to ?? null,
        min_cart_value: parsed.data.min_cart_value ?? null,
      });
      res.status(201).json(created);
    })
  );

  router.get(
    '/discount-rules/:id',
    asyncHandler(async (req, res) => {
      const rule = await repository.getRuleById(req.params.id);
      if (!rule) {
        res.status(404).json({ detail: 'Discount rule not found.' });
        return;
      }
      res.json(rule);
    })
  );

  router.put(
    '/discount-rules/:id',
    asyncHandler(async (req, res) => {
      const parsed = RuleUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ detail: parsed.error.issues.map((i) => i.message).join(' ') });
        return;
      }
      if (parsed.data.discount_type === 'percentage' && parsed.data.value !== undefined && parsed.data.value > 100) {
        res.status(422).json({ detail: 'Percentage discount cannot exceed 100.' });
        return;
      }
      const updated = await repository.updateRule(req.params.id, parsed.data);
      if (!updated) {
        res.status(404).json({ detail: 'Discount rule not found.' });
        return;
      }
      res.json(updated);
    })
  );

  router.delete(
    '/discount-rules/:id',
    asyncHandler(async (req, res) => {
      const ok = await repository.deleteRule(req.params.id);
      if (!ok) {
        res.status(404).json({ detail: 'Discount rule not found.' });
        return;
      }
      res.status(204).send();
    })
  );

  // Carts
  router.get(
    '/carts',
    asyncHandler(async (_req, res) => {
      const carts = await repository.listCarts();
      res.json({ items: carts, total: carts.length });
    })
  );

  router.post(
    '/carts',
    asyncHandler(async (req, res) => {
      const parsed = CartCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ detail: parsed.error.issues.map((i) => i.message).join(' ') });
        return;
      }
      const created = await repository.createCart(parsed.data);
      res.status(201).json(created);
    })
  );

  // PDF Upload & Import routes MUST come before /carts/:id
  router.post(
    '/carts/upload-pdf',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      if (!req.file) {
        res.status(400).json({ detail: 'No PDF file uploaded. Use multipart field name "file".' });
        return;
      }
      try {
        const preview = await extractCartFromPdf(req.file.buffer, req.file.originalname, req.file.mimetype);
        res.json(preview);
      } catch (err) {
        res.status(400).json({ detail: err instanceof Error ? err.message : 'Failed to parse PDF.' });
      }
    })
  );

  router.post(
    '/carts/import-pdf-preview',
    asyncHandler(async (req, res) => {
      const parsed = ImportPdfPreviewSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ detail: parsed.error.issues.map((i) => i.message).join(' ') });
        return;
      }

      const carts = await repository.listCarts();
      const targetCartId = parsed.data.cart_id ?? carts[0]?.id;

      let updatedCart;
      if (targetCartId) {
        updatedCart = await repository.updateCart(targetCartId, {
          cart_name: parsed.data.cart_name,
          items: parsed.data.items,
        });
      } else {
        updatedCart = await repository.createCart({
          cart_name: parsed.data.cart_name ?? 'Imported PDF Cart',
          items: parsed.data.items,
        });
      }

      if (!updatedCart) {
        res.status(404).json({ detail: 'Target cart not found.' });
        return;
      }

      const calculation = await repository.getLatestCalculation(updatedCart.id);
      res.json({ cart: updatedCart, calculation });
    })
  );

  router.get(
    '/carts/:id',
    asyncHandler(async (req, res) => {
      const cart = await repository.getCartById(req.params.id);
      if (!cart) {
        res.status(404).json({ detail: 'Cart not found.' });
        return;
      }
      res.json(cart);
    })
  );

  router.put(
    '/carts/:id',
    asyncHandler(async (req, res) => {
      const parsed = CartUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ detail: parsed.error.issues.map((i) => i.message).join(' ') });
        return;
      }
      const updated = await repository.updateCart(req.params.id, parsed.data);
      if (!updated) {
        res.status(404).json({ detail: 'Cart not found.' });
        return;
      }
      res.json(updated);
    })
  );

  router.delete(
    '/carts/:id',
    asyncHandler(async (req, res) => {
      const ok = await repository.deleteCart(req.params.id);
      if (!ok) {
        res.status(404).json({ detail: 'Cart not found.' });
        return;
      }
      res.status(204).send();
    })
  );

  // Cart Items
  router.post(
    '/carts/:id/items',
    asyncHandler(async (req, res) => {
      const parsed = CartItemPayloadSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ detail: parsed.error.issues.map((i) => i.message).join(' ') });
        return;
      }
      const updated = await repository.addCartItem(req.params.id, parsed.data);
      if (!updated) {
        res.status(404).json({ detail: 'Cart not found.' });
        return;
      }
      res.status(201).json(updated);
    })
  );

  router.put(
    '/carts/:id/items/:item_id',
    asyncHandler(async (req, res) => {
      const parsed = CartItemPayloadSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(422).json({ detail: parsed.error.issues.map((i) => i.message).join(' ') });
        return;
      }
      const updated = await repository.updateCartItem(req.params.id, req.params.item_id, parsed.data);
      if (!updated) {
        res.status(404).json({ detail: 'Cart or item not found.' });
        return;
      }
      res.json(updated);
    })
  );

  router.delete(
    '/carts/:id/items/:item_id',
    asyncHandler(async (req, res) => {
      const updated = await repository.deleteCartItem(req.params.id, req.params.item_id);
      if (!updated) {
        res.status(404).json({ detail: 'Cart or item not found.' });
        return;
      }
      res.json(updated);
    })
  );

  // Calculations
  router.post(
    '/carts/:id/calculate',
    asyncHandler(async (req, res) => {
      const result = await repository.calculateAndPersistCart(req.params.id);
      if (!result) {
        res.status(404).json({ detail: 'Cart not found.' });
        return;
      }
      res.json(result);
    })
  );

  router.get(
    '/carts/:id/results',
    asyncHandler(async (req, res) => {
      const cart = await repository.getCartById(req.params.id);
      if (!cart) {
        res.status(404).json({ detail: 'Cart not found.' });
        return;
      }
      const limit = req.query.limit ? Math.min(50, Math.max(1, Number(req.query.limit))) : 20;
      const results = await repository.getCalculationHistory(req.params.id, limit);
      res.json({ items: results, total: results.length });
    })
  );

  // AI Rule Parsing
  router.post(
    '/ai/parse-rule',
    asyncHandler(async (req, res) => {
      const parsedReq = AiParseSchema.safeParse(req.body);
      if (!parsedReq.success) {
        res.status(422).json({ detail: parsedReq.error.issues.map((i) => i.message).join(' ') });
        return;
      }
      const { parsed, provider } = await parseNaturalLanguageRule(parsedReq.data.text);
      res.json({ ...parsed, provider });
    })
  );

  return router;
}
