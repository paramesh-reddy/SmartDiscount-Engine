import { apiClient } from './client';
import { CalculationResult } from '../types';

export async function calculateCart(cartId: string): Promise<CalculationResult> {
  const { data } = await apiClient.post<CalculationResult>(`/carts/${cartId}/calculate`);
  return data;
}

export async function getCalculationResults(
  cartId: string,
  limit = 20
): Promise<{ items: CalculationResult[]; total: number }> {
  const { data } = await apiClient.get<{ items: CalculationResult[]; total: number }>(`/carts/${cartId}/results`, {
    params: { limit },
  });
  return data;
}
