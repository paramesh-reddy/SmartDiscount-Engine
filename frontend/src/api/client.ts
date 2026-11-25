import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface HealthResponse {
  status: string;
  service: string;
  storage: string;
  ai_configured: boolean;
  timestamp: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/health');
  return data;
}
