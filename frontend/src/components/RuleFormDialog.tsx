import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog } from './ui/Dialog';
import { DiscountRule, DiscountRulePayload } from '../types';

const ruleFormSchema = z
  .object({
    rule_code: z.string().trim().max(64).optional(),
    scope: z.enum(['platform', 'brand', 'cart']),
    applies_to: z.string().trim().max(150).optional(),
    discount_type: z.enum(['percentage', 'flat']),
    value: z.number({ error: 'Enter a valid number' }).positive('Value must be greater than 0'),
    stackable: z.boolean(),
    min_cart_value: z.union([z.number().positive('Minimum cart value must be positive'), z.nan(), z.null()]).optional(),
    is_active: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.discount_type === 'percentage' && val.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Percentage discount cannot exceed 100%',
      });
    }
    if ((val.scope === 'platform' || val.scope === 'brand') && (!val.applies_to || !val.applies_to.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['applies_to'],
        message: `Enter the target ${val.scope} name`,
      });
    }
    if (val.scope === 'cart') {
      const minVal = typeof val.min_cart_value === 'number' && !Number.isNaN(val.min_cart_value) ? val.min_cart_value : null;
      if (!minVal || minVal <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['min_cart_value'],
          message: 'Cart-level rules require a positive minimum cart value',
        });
      }
    }
  });

type RuleFormValues = z.infer<typeof ruleFormSchema>;

interface RuleFormDialogProps {
  open: boolean;
  onClose: () => void;
  initialRule?: DiscountRule | null;
  onSubmitRule: (payload: DiscountRulePayload) => Promise<void>;
  submitting?: boolean;
}

export function RuleFormDialog({
  open,
  onClose,
  initialRule,
  onSubmitRule,
  submitting = false,
}: RuleFormDialogProps) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<RuleFormValues>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: {
      rule_code: '',
      scope: 'platform',
      applies_to: '',
      discount_type: 'percentage',
      value: 10,
      stackable: false,
      min_cart_value: null,
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      if (initialRule) {
        reset({
          rule_code: initialRule.rule_code,
          scope: initialRule.scope,
          applies_to: initialRule.applies_to ?? '',
          discount_type: initialRule.discount_type,
          value: initialRule.value,
          stackable: initialRule.stackable,
          min_cart_value: initialRule.min_cart_value,
          is_active: initialRule.is_active,
        });
      } else {
        reset({
          rule_code: '',
          scope: 'platform',
          applies_to: '',
          discount_type: 'percentage',
          value: 10,
          stackable: false,
          min_cart_value: null,
          is_active: true,
        });
      }
    }
  }, [open, initialRule, reset]);

  const scope = watch('scope');
  const discountType = watch('discount_type');

  const onValidSubmit = async (values: RuleFormValues) => {
    const minVal =
      values.scope === 'cart' && typeof values.min_cart_value === 'number' && !Number.isNaN(values.min_cart_value)
        ? values.min_cart_value
        : null;

    await onSubmitRule({
      ...(values.rule_code?.trim() ? { rule_code: values.rule_code.trim() } : {}),
      scope: values.scope,
      applies_to: values.scope === 'cart' ? null : values.applies_to?.trim() || null,
      discount_type: values.discount_type,
      value: values.value,
      stackable: values.stackable,
      min_cart_value: minVal,
      is_active: values.is_active,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initialRule ? `Edit ${initialRule.rule_code}` : 'Create Discount Rule'}
      description="Define scope, discount mechanics, and stacking eligibility."
    >
      <form onSubmit={handleSubmit(onValidSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700">Rule Code (optional)</label>
            <input
              type="text"
              placeholder="Auto-generated (e.g. RULE-05)"
              {...register('rule_code')}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Scope</label>
            <select
              {...register('scope')}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="platform">Platform</option>
              <option value="brand">Brand</option>
              <option value="cart">Cart Total</option>
            </select>
          </div>
        </div>

        {scope !== 'cart' ? (
          <div>
            <label className="block text-xs font-medium text-slate-700">
              {scope === 'platform' ? 'Platform Name' : 'Brand Name'}
            </label>
            <input
              type="text"
              placeholder={scope === 'platform' ? 'e.g. Amazon India, Flipkart' : 'e.g. Natura Casa, Nordic Basics'}
              {...register('applies_to')}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            {errors.applies_to && <p className="mt-1 text-xs text-red-600">{errors.applies_to.message}</p>}
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-slate-700">Minimum Cart Value (INR)</label>
            <input
              type="number"
              step="1"
              placeholder="e.g. 4000"
              {...register('min_cart_value', { valueAsNumber: true })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            {errors.min_cart_value && <p className="mt-1 text-xs text-red-600">{errors.min_cart_value.message}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700">Discount Type</label>
            <select
              {...register('discount_type')}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="percentage">Percentage (%)</option>
              <option value="flat">Flat Amount (Rs.)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              {discountType === 'percentage' ? 'Percentage (%)' : 'Flat Amount (Rs.)'}
            </label>
            <input
              type="number"
              step="0.01"
              {...register('value', { valueAsNumber: true })}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            {errors.value && <p className="mt-1 text-xs text-red-600">{errors.value.message}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-1">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              {...register('stackable')}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <span>Stackable on top of winning non-stackable rule</span>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              {...register('is_active')}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
            />
            <span>Active</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {submitting ? 'Saving...' : initialRule ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
