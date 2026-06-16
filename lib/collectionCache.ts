import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Book, ExchangeOffer, Sticker } from './storage';

const CACHE_VERSION = 2;
const COLLECTION_CACHE_PREFIX = 'peelzy:collection';

export type CachedCollectionSnapshot = {
  stickers: Sticker[];
  books: Book[];
  exchangeOffers: ExchangeOffer[];
  exchangeOffersLoaded: boolean;
  lastStickerSyncAt: string | null;
};

type StoredCollectionSnapshot = CachedCollectionSnapshot & {
  version: number;
  userId: string;
  cachedAt: string;
};

function collectionCacheKey(userId: string) {
  return `${COLLECTION_CACHE_PREFIX}:${userId}`;
}

export async function getCachedCollectionSnapshot(userId: string): Promise<CachedCollectionSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(collectionCacheKey(userId));
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<StoredCollectionSnapshot>;
    if (
      cached.version !== CACHE_VERSION ||
      cached.userId !== userId ||
      !Array.isArray(cached.stickers) ||
      !Array.isArray(cached.books) ||
      !Array.isArray(cached.exchangeOffers) ||
      typeof cached.exchangeOffersLoaded !== 'boolean' ||
      (cached.lastStickerSyncAt !== null && typeof cached.lastStickerSyncAt !== 'string')
    ) {
      return null;
    }

    return {
      stickers: cached.stickers,
      books: cached.books,
      exchangeOffers: cached.exchangeOffers,
      exchangeOffersLoaded: cached.exchangeOffersLoaded,
      lastStickerSyncAt: cached.lastStickerSyncAt ?? null,
    };
  } catch (error) {
    console.warn('Failed to read cached collection:', error);
    return null;
  }
}

export async function setCachedCollectionSnapshot(
  userId: string,
  snapshot: CachedCollectionSnapshot
): Promise<void> {
  try {
    const stored: StoredCollectionSnapshot = {
      version: CACHE_VERSION,
      userId,
      cachedAt: new Date().toISOString(),
      ...snapshot,
    };
    await AsyncStorage.setItem(collectionCacheKey(userId), JSON.stringify(stored));
  } catch (error) {
    console.warn('Failed to cache collection:', error);
  }
}
