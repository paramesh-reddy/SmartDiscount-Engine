import { apiClient } from './client';
import { CalculationResult, Cart, CartItemPayload, PdfUploadPreview } from '../types';

export async function uploadCartPdf(
  file: File,
  onProgress?: (percent: number) => void
): Promise<PdfUploadPreview> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await apiClient.post<PdfUploadPreview>('/carts/upload-pdf', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (evt) => {
      if (onProgress && evt.total) {
        onProgress(Math.round((evt.loaded * 100) / evt.total));
      }
    },
  });
  return data;
}

export async function importPdfPreview(payload: {
  cart_id?: string;
  cart_name?: string;
  items: CartItemPayload[];
}): Promise<{ cart: Cart; calculation: CalculationResult | null }> {
  const { data } = await apiClient.post<{ cart: Cart; calculation: CalculationResult | null }>(
    '/carts/import-pdf-preview',
    payload
  );
  return data;
}
