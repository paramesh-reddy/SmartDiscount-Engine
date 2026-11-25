import { apiClient } from './client';
import { DiscountRule, DiscountRulePayload } from '../types';

export interface ListRulesParams {
  scope?: string;
  platform?: string;
  brand?: string;
  discount_type?: string;
  is_active?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function listDiscountRules(params: ListRulesParams = {}): Promise<{ items: DiscountRule[]; total: number }> {
  const { data } = await apiClient.get<{ items: DiscountRule[]; total: number }>('/discount-rules', { params });
  return data;
}

export async function createDiscountRule(payload: DiscountRulePayload): Promise<DiscountRule> {
  const { data } = await apiClient.post<DiscountRule>('/discount-rules', payload);
  return data;
}

export async function updateDiscountRule(id: string, payload: Partial<DiscountRulePayload>): Promise<DiscountRule> {
  const { data } = await apiClient.put<DiscountRule>(`/discount-rules/${id}`, payload);
  return data;
}

export async function deleteDiscountRule(id: string): Promise<void> {
  await apiClient.delete(`/discount-rules/${id}`);
}
