import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Book, BookPageElement, Sticker } from './storage';

const CACHE_VERSION = 1;
const BOOK_DETAIL_CACHE_PREFIX = 'peelzy:book-detail';
const BOOK_PAGE_CACHE_PREFIX = 'peelzy:book-page';

type CachedBookDetail = {
  version: number;
  cachedAt: string;
  book: Book;
};

type CachedBookPage = {
  version: number;
  cachedAt: string;
  bookId: string;
  pageIndex: number;
  stickers: Sticker[];
  elements: BookPageElement[];
};

function bookDetailCacheKey(bookId: string) {
  return `${BOOK_DETAIL_CACHE_PREFIX}:${bookId}`;
}

function bookPageCacheKey(bookId: string, pageIndex: number) {
  return `${BOOK_PAGE_CACHE_PREFIX}:${bookId}:${pageIndex}`;
}

export async function getCachedBookDetail(bookId: string): Promise<Book | null> {
  try {
    const raw = await AsyncStorage.getItem(bookDetailCacheKey(bookId));
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<CachedBookDetail>;
    if (cached.version !== CACHE_VERSION || !cached.book) return null;

    return cached.book;
  } catch (error) {
    console.warn('Failed to read cached book detail:', error);
    return null;
  }
}

export async function setCachedBookDetail(bookId: string, book: Book): Promise<void> {
  try {
    const cached: CachedBookDetail = {
      version: CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      book,
    };
    await AsyncStorage.setItem(bookDetailCacheKey(bookId), JSON.stringify(cached));
  } catch (error) {
    console.warn('Failed to cache book detail:', error);
  }
}

export async function getCachedBookPage(
  bookId: string,
  pageIndex: number
): Promise<{ stickers: Sticker[]; elements: BookPageElement[] } | null> {
  try {
    const raw = await AsyncStorage.getItem(bookPageCacheKey(bookId, pageIndex));
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<CachedBookPage>;
    if (
      cached.version !== CACHE_VERSION ||
      cached.bookId !== bookId ||
      cached.pageIndex !== pageIndex ||
      !Array.isArray(cached.stickers) ||
      !Array.isArray(cached.elements)
    ) {
      return null;
    }

    return {
      stickers: cached.stickers,
      elements: cached.elements,
    };
  } catch (error) {
    console.warn(`Failed to read cached book page ${pageIndex + 1}:`, error);
    return null;
  }
}

export async function setCachedBookPage(
  bookId: string,
  pageIndex: number,
  stickers: Sticker[],
  elements: BookPageElement[]
): Promise<void> {
  try {
    const cached: CachedBookPage = {
      version: CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      bookId,
      pageIndex,
      stickers,
      elements,
    };
    await AsyncStorage.setItem(bookPageCacheKey(bookId, pageIndex), JSON.stringify(cached));
  } catch (error) {
    console.warn(`Failed to cache book page ${pageIndex + 1}:`, error);
  }
}
