import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog } from './ui/Dialog';
import { CartItem, CartItemPayload } from '../types';

const cartItemSchema = z.object({
  product_name: z.string().trim().min(1, 'Product name is required').max(180),
  brand: z.string().trim().min(1, 'Brand is required').max(120),
  platform: z.string().trim().min(1, 'Platform is required').max(120),
  base_price: z.number({ error: 'Enter a valid price' }).positive('Base price must be greater than 0'),
});

interface CartItemDialogProps {
  open: boolean;
  onClose: () => void;
  initialItem?: CartItem | null;
  onSubmitItem: (payload: CartItemPayload) => Promise<void>;
  submitting?: boolean;
}

export function CartItemDialog({
  open,
  onClose,
  initialItem,
  onSubmitItem,
  submitting = false,
}: CartItemDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CartItemPayload>({
    resolver: zodResolver(cartItemSchema),
    defaultValues: {
      product_name: '',
      brand: '',
      platform: '',
      base_price: 999,
    },
  });

  useEffect(() => {
    if (open) {
      if (initialItem) {
        reset({
          product_name: initialItem.product_name,
          brand: initialItem.brand,
          platform: initialItem.platform,
          base_price: initialItem.base_price,
        });
      } else {
        reset({
          product_name: '',
          brand: '',
          platform: '',
          base_price: 999,
        });
      }
    }
  }, [open, initialItem, reset]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initialItem ? 'Edit Cart Product' : 'Add Product to Cart'}
      description="Discounts recalculate automatically after saving."
    >
      <form onSubmit={handleSubmit(onSubmitItem)} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-700">Product Name</label>
          <input
            type="text"
            placeholder="e.g. Linen Throw Blanket"
            {...register('product_name')}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
          {errors.product_name && <p className="mt-1 text-xs text-red-600">{errors.product_name.message}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-700">Brand</label>
            <input
              type="text"
              placeholder="e.g. Natura Casa"
              {...register('brand')}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            {errors.brand && <p className="mt-1 text-xs text-red-600">{errors.brand.message}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Platform</label>
            <input
              type="text"
              placeholder="e.g. Amazon India"
              {...register('platform')}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            {errors.platform && <p className="mt-1 text-xs text-red-600">{errors.platform.message}</p>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">Base Price (INR)</label>
          <input
            type="number"
            step="1"
            {...register('base_price', { valueAsNumber: true })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
          />
          {errors.base_price && <p className="mt-1 text-xs text-red-600">{errors.base_price.message}</p>}
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
            {submitting ? 'Saving...' : initialItem ? 'Save Product' : 'Add Product'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
