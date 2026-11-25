import { apiClient } from './client';
import { ParsedAiRule } from '../types';

export async function parseNaturalLanguageRule(text: string): Promise<ParsedAiRule> {
  const { data } = await apiClient.post<ParsedAiRule>('/ai/parse-rule', { text });
  return data;
}
