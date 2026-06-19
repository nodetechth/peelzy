import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AccountStatus, BookHomeSummary } from './storage';

const CACHE_VERSION = 1;
const HOME_CACHE_PREFIX = 'peelzy:home';

export type CachedHomeSnapshot = {
  books: BookHomeSummary[];
  accountStatus: AccountStatus | null;
};

type StoredHomeSnapshot = CachedHomeSnapshot & {
  version: number;
  userId: string;
  cachedAt: string;
};

function homeCacheKey(userId: string) {
  return `${HOME_CACHE_PREFIX}:${userId}`;
}

export async function getCachedHomeSnapshot(userId: string): Promise<CachedHomeSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(homeCacheKey(userId));
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<StoredHomeSnapshot>;
    if (
      cached.version !== CACHE_VERSION ||
      cached.userId !== userId ||
      !Array.isArray(cached.books) ||
      (cached.accountStatus !== null && typeof cached.accountStatus !== 'object')
    ) {
      return null;
    }

    return {
      books: cached.books,
      accountStatus: cached.accountStatus ?? null,
    };
  } catch (error) {
    console.warn('Failed to read cached home:', error);
    return null;
  }
}

export async function setCachedHomeSnapshot(
  userId: string,
  snapshot: CachedHomeSnapshot
): Promise<void> {
  try {
    const stored: StoredHomeSnapshot = {
      version: CACHE_VERSION,
      userId,
      cachedAt: new Date().toISOString(),
      ...snapshot,
    };
    await AsyncStorage.setItem(homeCacheKey(userId), JSON.stringify(stored));
  } catch (error) {
    console.warn('Failed to cache home:', error);
  }
}
