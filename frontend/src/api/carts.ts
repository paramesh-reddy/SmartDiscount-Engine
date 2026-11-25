import { apiClient } from './client';
import { Cart, CartItemPayload } from '../types';

export async function listCarts(): Promise<{ items: Cart[]; total: number }> {
  const { data } = await apiClient.get<{ items: Cart[]; total: number }>('/carts');
  return data;
}

export async function getCart(cartId: string): Promise<Cart> {
  const { data } = await apiClient.get<Cart>(`/carts/${cartId}`);
  return data;
}

export async function createCart(payload: { cart_name: string; items?: CartItemPayload[] }): Promise<Cart> {
  const { data } = await apiClient.post<Cart>('/carts', payload);
  return data;
}

export async function replaceCartItems(cartId: string, items: CartItemPayload[], cartName?: string): Promise<Cart> {
  const { data } = await apiClient.put<Cart>(`/carts/${cartId}`, {
    ...(cartName ? { cart_name: cartName } : {}),
    items,
  });
  return data;
}

export async function addCartItem(cartId: string, item: CartItemPayload): Promise<Cart> {
  const { data } = await apiClient.post<Cart>(`/carts/${cartId}/items`, item);
  return data;
}

export async function updateCartItem(cartId: string, itemId: string, item: Partial<CartItemPayload>): Promise<Cart> {
  const { data } = await apiClient.put<Cart>(`/carts/${cartId}/items/${itemId}`, item);
  return data;
}

export async function removeCartItem(cartId: string, itemId: string): Promise<Cart> {
  const { data } = await apiClient.delete<Cart>(`/carts/${cartId}/items/${itemId}`);
  return data;
}
