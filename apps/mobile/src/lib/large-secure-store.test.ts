import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { LargeSecureStore } from './large-secure-store';

const mockAsync = new Map<string, string>();
const mockSecure = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockAsync.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => void mockAsync.set(k, v)),
    removeItem: jest.fn(async (k: string) => void mockAsync.delete(k)),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSecure.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockSecure.delete(k)),
}));

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 3) % 256),
}));

describe('LargeSecureStore', () => {
  beforeEach(() => {
    mockAsync.clear();
    mockSecure.clear();
  });

  it('round-trips a value larger than 2 KB', async () => {
    const store = new LargeSecureStore();
    const value = JSON.stringify({ token: 'x'.repeat(5000) });
    await store.setItem('session', value);
    expect(mockAsync.get('session')).not.toContain('xxxx');
    expect(await store.getItem('session')).toBe(value);
  });

  it('returns null when nothing is stored', async () => {
    expect(await new LargeSecureStore().getItem('absent')).toBeNull();
  });

  it('returns null when the encryption key is missing', async () => {
    const store = new LargeSecureStore();
    await store.setItem('session', 'hello');
    mockSecure.delete('session');
    expect(await store.getItem('session')).toBeNull();
  });

  it('returns null when the ciphertext is corrupt', async () => {
    const store = new LargeSecureStore();
    await store.setItem('session', 'hello');
    mockAsync.set('session', 'not-hex-zz');
    expect(await store.getItem('session')).toBeNull();
  });

  it('removes both halves', async () => {
    const store = new LargeSecureStore();
    await store.setItem('session', 'hello');
    await store.removeItem('session');
    expect(mockAsync.size).toBe(0);
    expect(mockSecure.size).toBe(0);
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
});
