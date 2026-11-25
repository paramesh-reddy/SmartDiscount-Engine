import OpenAI from 'openai';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';

export const ParsedAiRuleSchema = z
  .object({
    scope: z.enum(['brand', 'platform', 'cart']).nullable(),
    applies_to: z.string().trim().nullable(),
    discount_type: z.enum(['percentage', 'flat']).nullable(),
    value: z.number().nullable(),
    stackable: z.boolean().default(false),
    min_cart_value: z.number().nullable(),
    is_valid: z.boolean(),
    clarification_message: z.string().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.is_valid) {
      if (!data.clarification_message || !data.clarification_message.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Clarification message is required when is_valid is false.',
        });
      }
      return;
    }

    if (!data.scope) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Scope is required for a valid rule.' });
    }
    if (!data.discount_type) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Discount type is required for a valid rule.' });
    }
    if (data.value === null || !Number.isFinite(data.value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Discount value is required.' });
    } else if (data.discount_type === 'percentage' && (data.value <= 0 || data.value > 100)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Percentage discount must be > 0 and <= 100.' });
    } else if (data.discount_type === 'flat' && data.value <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Flat discount amount must be positive.' });
    }

    if ((data.scope === 'brand' || data.scope === 'platform') && (!data.applies_to || !data.applies_to.trim())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${data.scope} rules must specify applies_to.` });
    }

    if (data.scope === 'cart') {
      if (data.min_cart_value === null || !Number.isFinite(data.min_cart_value) || data.min_cart_value <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Cart-level rules must specify a positive minimum cart value.',
        });
      }
    }
  });

export type ParsedAiRuleResponse = z.infer<typeof ParsedAiRuleSchema>;

const SYSTEM_PROMPT = `You are a strict e-commerce discount rule parser for an Indian INR discount engine.
Convert the user's natural language discount rule into a structured JSON object matching the exact schema.

Rules:
1. scope must be "brand", "platform", or "cart".
   - If the rule targets a store/marketplace (e.g., Amazon India, Flipkart, Noon), scope is "platform" and applies_to is the platform name.
   - If the rule targets a product brand (e.g., Natura Casa, LivSpace Pro, Nordic Basics), scope is "brand" and applies_to is the brand name.
   - If the rule applies to the total cart value / order total, scope is "cart" and applies_to is null.
2. discount_type must be "percentage" or "flat".
   - Percentage values must be > 0 and <= 100.
   - Flat rupee values must be > 0.
3. stackable: true only if the user explicitly indicates it stacks/combines with other offers; otherwise false.
4. min_cart_value: required positive number when scope is "cart" (e.g., "more than Rs.5,000" -> 5000). null otherwise.
5. AMBIGUITY & MISSING DETAILS:
   - NEVER invent or guess missing percentages, rupee amounts, target brands/platforms, or minimum cart thresholds.
   - If any critical field is missing or ambiguous (e.g., "Give a discount for big orders" or "Offer a deal on Flipkart"), set is_valid = false and provide a concise, helpful clarification_message telling the user exactly what to specify.`;

function normalizeAndValidateModelOutput(raw: unknown): ParsedAiRuleResponse {
  const candidate = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const normalized = {
    scope: candidate.scope ?? null,
    applies_to: typeof candidate.applies_to === 'string' && candidate.applies_to.trim() ? candidate.applies_to.trim() : null,
    discount_type: candidate.discount_type ?? null,
    value: typeof candidate.value === 'number' && Number.isFinite(candidate.value) ? candidate.value : null,
    stackable: Boolean(candidate.stackable),
    min_cart_value:
      typeof candidate.min_cart_value === 'number' && Number.isFinite(candidate.min_cart_value)
        ? candidate.min_cart_value
        : null,
    is_valid: Boolean(candidate.is_valid),
    clarification_message:
      typeof candidate.clarification_message === 'string' && candidate.clarification_message.trim()
        ? candidate.clarification_message.trim()
        : null,
  };

  const checked = ParsedAiRuleSchema.safeParse(normalized);
  if (checked.success) {
    return checked.data;
  }

  const issueMsg = checked.error.issues.map((i) => i.message).join(' ');
  return {
    scope: normalized.scope as ParsedAiRuleResponse['scope'],
    applies_to: normalized.applies_to,
    discount_type: normalized.discount_type as ParsedAiRuleResponse['discount_type'],
    value: normalized.value,
    stackable: normalized.stackable,
    min_cart_value: normalized.min_cart_value,
    is_valid: false,
    clarification_message:
      normalized.clarification_message ||
      `Could not validate a complete rule: ${issueMsg} Please specify the target (brand, platform, or cart threshold), discount type, and value.`,
  };
}

export async function parseNaturalLanguageRule(text: string): Promise<{ parsed: ParsedAiRuleResponse; provider: 'openai' | 'gemini' }> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();

  if (openaiKey && openaiKey !== 'your_openai_api_key') {
    const client = new OpenAI({ apiKey: openaiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'discount_rule_parse',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              scope: { type: ['string', 'null'], enum: ['brand', 'platform', 'cart', null] },
              applies_to: { type: ['string', 'null'] },
              discount_type: { type: ['string', 'null'], enum: ['percentage', 'flat', null] },
              value: { type: ['number', 'null'] },
              stackable: { type: 'boolean' },
              min_cart_value: { type: ['number', 'null'] },
              is_valid: { type: 'boolean' },
              clarification_message: { type: ['string', 'null'] },
            },
            required: [
              'scope',
              'applies_to',
              'discount_type',
              'value',
              'stackable',
              'min_cart_value',
              'is_valid',
              'clarification_message',
            ],
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI returned an empty response.');
    }
    return {
      parsed: normalizeAndValidateModelOutput(JSON.parse(content)),
      provider: 'openai',
    };
  }

  if (geminiKey && geminiKey !== 'MY_GEMINI_API_KEY') {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: text,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scope: { type: Type.STRING, nullable: true },
            applies_to: { type: Type.STRING, nullable: true },
            discount_type: { type: Type.STRING, nullable: true },
            value: { type: Type.NUMBER, nullable: true },
            stackable: { type: Type.BOOLEAN },
            min_cart_value: { type: Type.NUMBER, nullable: true },
            is_valid: { type: Type.BOOLEAN },
            clarification_message: { type: Type.STRING, nullable: true },
          },
          required: [
            'scope',
            'applies_to',
            'discount_type',
            'value',
            'stackable',
            'min_cart_value',
            'is_valid',
            'clarification_message',
          ],
        },
      },
    });

    const rawText = response.text;
    if (!rawText) {
      throw new Error('AI parser returned an empty response.');
    }
    return {
      parsed: normalizeAndValidateModelOutput(JSON.parse(rawText)),
      provider: 'gemini',
    };
  }

  const err = new Error(
    'OPENAI_API_KEY is not configured on the backend server. Set OPENAI_API_KEY (or GEMINI_API_KEY in AI Studio Secrets) to parse natural-language rules.'
  );
  (err as Error & { statusCode?: number }).statusCode = 503;
  throw err;
}

export { normalizeAndValidateModelOutput };
