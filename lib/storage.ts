import { supabase } from './supabase';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as ImageManipulator from 'expo-image-manipulator';
import { CoverTheme, DEFAULT_ACCENT_COLOR, DEFAULT_COVER_THEME } from '../components/BookCover/types';

const STICKER_THUMBNAIL_MAX_EDGE = 320;
const STICKER_STORAGE_CACHE_CONTROL_SECONDS = '31536000';
const STICKER_DISPLAY_COLUMNS =
  'id, user_id, image_url, thumbnail_url, page_index, pos_x, pos_y, rotation, book_id, created_at, metadata';
const STICKER_SYNC_COLUMNS = `${STICKER_DISPLAY_COLUMNS}, updated_at`;
const BOOK_PAGE_ELEMENT_DISPLAY_COLUMNS =
  'id, user_id, book_id, page_index, type, content, pos_x, pos_y, rotation, color, style, created_at, updated_at';
const EXCHANGE_OFFER_DISPLAY_COLUMNS =
  'id, token, owner_id, sticker_id, status, auto_accept, accepted_proposal_id, expires_at, created_at';
const EXCHANGE_PROPOSAL_DISPLAY_COLUMNS =
  'id, offer_id, proposer_id, offered_sticker_id, status, created_at';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type StickerPosition = {
  x: number;
  y: number;
};

export type StickerBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StickerMetadata = {
  capturedAt: string;
  sourceCanvas?: 'square' | 'unknown';
  backgroundRemovalProvider?: 'apple-subject-lift' | 'android-mlkit';
  backgroundRemovalElapsedMs?: number;
  subjectCount?: number;
  frameMode?: 'cutout' | 'rounded' | 'heart' | 'star';
  frameColor?: string;
  displayScale?: number;
  bookScale?: number;
  hitBounds?: StickerBounds;
  alphaMask?: {
    size: number;
    encoding: 'hex-1bit';
    data: string;
  };
  minDisplayScaleApplied?: boolean;
  position?: StickerPosition;
};

export type Sticker = {
  id: string;
  user_id?: string;
  image_url: string;
  thumbnail_url?: string | null;
  page_index: number | null;
  pos_x: number | null;
  pos_y: number | null;
  rotation: number;
  book_id: string | null;
  created_at: string;
  updated_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type StickerDeletion = {
  sticker_id: string;
  deleted_at: string;
};

export function getStickerDisplayScale(sticker: Pick<Sticker, 'metadata'>): number {
  const rawScale = sticker.metadata?.displayScale;
  const scale = typeof rawScale === 'number' && Number.isFinite(rawScale) ? rawScale : 1.18;
  return Math.max(0.65, Math.min(1.35, scale));
}

export function getStickerBookScale(sticker: Pick<Sticker, 'metadata'>): number {
  const rawScale = sticker.metadata?.bookScale;
  const scale = typeof rawScale === 'number' && Number.isFinite(rawScale) ? rawScale : 1;
  return Math.max(0.35, Math.min(2.8, scale));
}

export function getStickerThumbnailUrl(sticker: Pick<Sticker, 'image_url' | 'thumbnail_url'>): string {
  return sticker.thumbnail_url || sticker.image_url;
}

export type Book = {
  id: string;
  name: string;
  cover_color: string;
  theme: CoverTheme;
  accent_color: string;
  page_color: string;
  created_at: string;
  sticker_count: number;
};

export type BookHomeSummary = Book & {
  thumbnails: { id: string; image_url: string }[];
};

export type BookPageElementType = 'note' | 'text' | 'stamp';

export type BookPageElement = {
  id: string;
  user_id: string;
  book_id: string;
  page_index: number;
  type: BookPageElementType;
  content: string;
  pos_x: number;
  pos_y: number;
  rotation: number;
  color: string | null;
  style?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type NewBookPageElement = {
  bookId: string;
  pageIndex: number;
  type: BookPageElementType;
  content: string;
  pos_x: number;
  pos_y: number;
  rotation?: number;
  color?: string | null;
  style?: Record<string, unknown>;
};

export type StickerOwnerHistoryEntry = {
  id: string;
  sticker_id: string;
  owner_id: string;
  acquired_at: string;
  released_at: string | null;
  source: 'created' | 'exchange' | 'import';
  transfer_proposal_id: string | null;
  owner_display_name: string;
};

export type AccountPlan = 'free' | 'paid';

export type AccountStatus = {
  plan: AccountPlan;
  sticker_limit: number;
  stickers_used: number;
  stickers_remaining: number;
  period_start: string;
  period_end: string;
  subscription_status: string | null;
};

export type ExchangeOfferStatus = 'active' | 'accepted' | 'expired' | 'canceled';
export type ExchangeProposalStatus = 'pending' | 'accepted' | 'rejected' | 'canceled';

export type ExchangeOffer = {
  id: string;
  token: string;
  owner_id: string;
  sticker_id: string;
  status: ExchangeOfferStatus;
  auto_accept: boolean;
  accepted_proposal_id: string | null;
  expires_at: string;
  created_at: string;
  sticker?: Sticker | null;
  proposals?: ExchangeProposal[];
};

export type ExchangeProposal = {
  id: string;
  offer_id: string;
  proposer_id: string;
  offered_sticker_id: string;
  status: ExchangeProposalStatus;
  created_at: string;
  offered_sticker?: Sticker | null;
};

function isOfferExpired(offer: Pick<ExchangeOffer, 'expires_at' | 'status'>): boolean {
  return offer.status === 'active' && new Date(offer.expires_at).getTime() <= Date.now();
}

function createExchangeToken(): string {
  return Crypto.randomUUID().replace(/-/g, '');
}

const defaultAccountStatus: AccountStatus = {
  plan: 'free',
  sticker_limit: 5,
  stickers_used: 0,
  stickers_remaining: 5,
  period_start: new Date().toISOString(),
  period_end: new Date().toISOString(),
  subscription_status: null,
};

export async function getAccountStatus(): Promise<{ status: AccountStatus; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('get_account_status');

    if (error) {
      return { status: defaultAccountStatus, error };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return { status: defaultAccountStatus, error: null };
    }

    return {
      status: {
        plan: row.plan === 'paid' ? 'paid' : 'free',
        sticker_limit: Number(row.sticker_limit ?? 5),
        stickers_used: Number(row.stickers_used ?? 0),
        stickers_remaining: Number(row.stickers_remaining ?? 0),
        period_start: row.period_start,
        period_end: row.period_end,
        subscription_status: row.subscription_status ?? null,
      },
      error: null,
    };
  } catch (error) {
    return { status: defaultAccountStatus, error: error as Error };
  }
}

export async function createBillingCheckoutSession(
  returnUrl: string
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: { returnUrl },
    });

    if (error) {
      return { url: null, error };
    }

    return { url: data?.url ?? null, error: null };
  } catch (error) {
    return { url: null, error: error as Error };
  }
}

export async function createBillingPortalSession(
  returnUrl: string
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.functions.invoke('create-portal-session', {
      body: { returnUrl },
    });

    if (error) {
      return { url: null, error };
    }

    return { url: data?.url ?? null, error: null };
  } catch (error) {
    return { url: null, error: error as Error };
  }
}

export async function syncBillingStatus(): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.functions.invoke('sync-billing-status');

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function uploadSticker(
  stickerUri: string,
  userId: string,
  metadata: StickerMetadata
): Promise<{ sticker: Sticker | null; error: Error | null }> {
  try {
    const stickerId = generateUUID();
    const fileName = `${userId}/${stickerId}.png`;
    const stickerFileData = await new File(stickerUri).arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('stickers')
      .upload(fileName, stickerFileData, {
        contentType: 'image/png',
        cacheControl: STICKER_STORAGE_CACHE_CONTROL_SECONDS,
        upsert: false,
      });

    if (uploadError) {
      return { sticker: null, error: uploadError };
    }

    const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(fileName);
    const imageUrl = urlData.publicUrl;

    const { data: stickerData, error: insertError } = await supabase
      .from('stickers')
      .insert({
        id: stickerId,
        user_id: userId,
        image_url: imageUrl,
        page_index: null,
        pos_x: null,
        pos_y: null,
        rotation: 0,
        book_id: null,
        metadata,
      })
      .select()
      .single();

    if (insertError) {
      await supabase.storage.from('stickers').remove([fileName]);
      return { sticker: null, error: insertError };
    }

    return { sticker: stickerData as Sticker, error: null };
  } catch (error) {
    return { sticker: null, error: error as Error };
  }
}

export async function createStickerThumbnail(
  stickerId: string,
  userId: string,
  sourceUri: string,
  dimensions?: { width?: number; height?: number }
): Promise<{ thumbnailUrl: string | null; error: Error | null }> {
  try {
    const width = Number(dimensions?.width ?? 0);
    const height = Number(dimensions?.height ?? 0);
    const resize =
      width > 0 && height > 0 && height > width
        ? { height: STICKER_THUMBNAIL_MAX_EDGE }
        : { width: STICKER_THUMBNAIL_MAX_EDGE };

    const thumbnail = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize }],
      {
        compress: 1,
        format: ImageManipulator.SaveFormat.PNG,
      }
    );

    const thumbnailData = await new File(thumbnail.uri).arrayBuffer();
    const fileName = `${userId}/${stickerId}_thumb.png`;

    const { error: uploadError } = await supabase.storage
      .from('stickers')
      .upload(fileName, thumbnailData, {
        contentType: 'image/png',
        cacheControl: STICKER_STORAGE_CACHE_CONTROL_SECONDS,
        upsert: true,
      });

    if (uploadError) {
      return { thumbnailUrl: null, error: uploadError };
    }

    const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(fileName);
    const thumbnailUrl = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from('stickers')
      .update({ thumbnail_url: thumbnailUrl })
      .eq('id', stickerId);

    if (updateError) {
      return { thumbnailUrl, error: updateError };
    }

    return { thumbnailUrl, error: null };
  } catch (error) {
    return { thumbnailUrl: null, error: error as Error };
  }
}

export function getStickerUrl(path: string): string {
  const { data } = supabase.storage.from('stickers').getPublicUrl(path);
  return data.publicUrl;
}

export async function getUserStickers(userId: string): Promise<{ stickers: Sticker[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('stickers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return { stickers: [], error };
    }

    return { stickers: data as Sticker[], error: null };
  } catch (error) {
    return { stickers: [], error: error as Error };
  }
}

export async function updateStickerPosition(
  id: string,
  x: number,
  y: number
): Promise<{ error: Error | null }> {
  try {
    const { data: current, error: fetchError } = await supabase
      .from('stickers')
      .select('metadata')
      .eq('id', id)
      .single();

    if (fetchError) {
      return { error: fetchError };
    }

    const newMetadata = {
      ...(current?.metadata || {}),
      position: { x, y },
    };

    const { error: updateError } = await supabase
      .from('stickers')
      .update({ metadata: newMetadata })
      .eq('id', id);

    if (updateError) {
      return { error: updateError };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function createBook(
  name: string,
  options?: { theme?: CoverTheme; accentColor?: string; pageColor?: string }
): Promise<{ book: Book | null; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { book: null, error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('books')
      .insert({
        name,
        user_id: user.id,
        theme: options?.theme ?? DEFAULT_COVER_THEME,
        accent_color: options?.accentColor ?? DEFAULT_ACCENT_COLOR,
        page_color: options?.pageColor ?? DEFAULT_ACCENT_COLOR,
      })
      .select()
      .single();

    if (error) {
      return { book: null, error };
    }

    return {
      book: {
        id: data.id,
        name: data.name,
        cover_color: data.cover_color,
        theme: (data.theme || DEFAULT_COVER_THEME) as CoverTheme,
        accent_color: data.accent_color || DEFAULT_ACCENT_COLOR,
        page_color: data.page_color || data.accent_color || DEFAULT_ACCENT_COLOR,
        created_at: data.created_at,
        sticker_count: 0,
      },
      error: null,
    };
  } catch (error) {
    return { book: null, error: error as Error };
  }
}

export async function getBooks(): Promise<{ books: Book[]; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { books: [], error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('books')
      .select('id, name, cover_color, theme, accent_color, page_color, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      return { books: [], error };
    }

    const bookIds = (data || []).map((row) => row.id);
    const stickerCounts = new Map<string, number>();

    if (bookIds.length > 0) {
      const { data: stickerRows, error: stickersError } = await supabase
        .from('stickers')
        .select('book_id')
        .eq('user_id', user.id)
        .in('book_id', bookIds);

      if (stickersError) {
        return { books: [], error: stickersError };
      }

      (stickerRows || []).forEach((sticker) => {
        if (!sticker.book_id) return;
        stickerCounts.set(sticker.book_id, (stickerCounts.get(sticker.book_id) || 0) + 1);
      });
    }

    const books: Book[] = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      cover_color: row.cover_color,
      theme: (row.theme || DEFAULT_COVER_THEME) as CoverTheme,
      accent_color: row.accent_color || DEFAULT_ACCENT_COLOR,
      page_color: row.page_color || row.accent_color || DEFAULT_ACCENT_COLOR,
      created_at: row.created_at,
      sticker_count: stickerCounts.get(row.id) || 0,
    }));

    return { books, error: null };
  } catch (error) {
    return { books: [], error: error as Error };
  }
}

export async function getBooksForHome(): Promise<{ books: BookHomeSummary[]; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { books: [], error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('books')
      .select('id, name, cover_color, theme, accent_color, page_color, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      return { books: [], error };
    }

    const bookIds = (data || []).map((row) => row.id);
    const stickerCounts = new Map<string, number>();
    const thumbnails = new Map<string, { id: string; image_url: string }[]>();

    if (bookIds.length > 0) {
      const { data: stickerRows, error: stickersError } = await supabase
        .from('stickers')
        .select('id, book_id, image_url, thumbnail_url, created_at')
        .eq('user_id', user.id)
        .in('book_id', bookIds)
        .order('created_at', { ascending: false });

      if (stickersError) {
        return { books: [], error: stickersError };
      }

      (stickerRows || []).forEach((sticker) => {
        if (!sticker.book_id) return;
        stickerCounts.set(sticker.book_id, (stickerCounts.get(sticker.book_id) || 0) + 1);

        const bookThumbnails = thumbnails.get(sticker.book_id) || [];
        if (bookThumbnails.length < 5) {
          bookThumbnails.push({
            id: sticker.id,
            image_url: sticker.thumbnail_url || sticker.image_url,
          });
          thumbnails.set(sticker.book_id, bookThumbnails);
        }
      });
    }

    const books: BookHomeSummary[] = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      cover_color: row.cover_color,
      theme: (row.theme || DEFAULT_COVER_THEME) as CoverTheme,
      accent_color: row.accent_color || DEFAULT_ACCENT_COLOR,
      page_color: row.page_color || row.accent_color || DEFAULT_ACCENT_COLOR,
      created_at: row.created_at,
      sticker_count: stickerCounts.get(row.id) || 0,
      thumbnails: thumbnails.get(row.id) || [],
    }));

    return { books, error: null };
  } catch (error) {
    return { books: [], error: error as Error };
  }
}

export async function getBookById(bookId: string): Promise<{ book: Book | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('books')
      .select('id, name, cover_color, theme, accent_color, page_color, created_at')
      .eq('id', bookId)
      .single();

    if (error) {
      return { book: null, error };
    }

    const { data: stickerRows, error: stickersError } = await supabase
      .from('stickers')
      .select('id')
      .eq('book_id', bookId);

    if (stickersError) {
      return { book: null, error: stickersError };
    }

    return {
      book: {
        id: data.id,
        name: data.name,
        cover_color: data.cover_color,
        theme: (data.theme || DEFAULT_COVER_THEME) as CoverTheme,
        accent_color: data.accent_color || DEFAULT_ACCENT_COLOR,
        page_color: data.page_color || data.accent_color || DEFAULT_ACCENT_COLOR,
        created_at: data.created_at,
        sticker_count: stickerRows?.length ?? 0,
      },
      error: null,
    };
  } catch (error) {
    return { book: null, error: error as Error };
  }
}

export async function getBookForDetail(bookId: string): Promise<{ book: Book | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('books')
      .select('id, name, cover_color, theme, accent_color, page_color, created_at')
      .eq('id', bookId)
      .single();

    if (error) {
      return { book: null, error };
    }

    return {
      book: {
        id: data.id,
        name: data.name,
        cover_color: data.cover_color,
        theme: (data.theme || DEFAULT_COVER_THEME) as CoverTheme,
        accent_color: data.accent_color || DEFAULT_ACCENT_COLOR,
        page_color: data.page_color || data.accent_color || DEFAULT_ACCENT_COLOR,
        created_at: data.created_at,
        sticker_count: 0,
      },
      error: null,
    };
  } catch (error) {
    return { book: null, error: error as Error };
  }
}

export async function updateBookName(id: string, name: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('books')
      .update({ name })
      .eq('id', id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function updateBookSettings(
  id: string,
  input: { name: string; theme: CoverTheme; accentColor: string; pageColor: string }
): Promise<{ error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: new Error('User not authenticated') };
    }

    const { error } = await supabase
      .from('books')
      .update({
        name: input.name,
        theme: input.theme,
        accent_color: input.accentColor,
        page_color: input.pageColor,
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function updateBookPageColor(id: string, pageColor: string): Promise<{ error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { error: new Error('User not authenticated') };
    }

    const { error } = await supabase
      .from('books')
      .update({ page_color: pageColor })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function deleteBook(id: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('books')
      .delete()
      .eq('id', id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function getStickersInBook(bookId: string): Promise<{ stickers: Sticker[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('stickers')
      .select('*')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false });

    if (error) {
      return { stickers: [], error };
    }

    return { stickers: data as Sticker[], error: null };
  } catch (error) {
    return { stickers: [], error: error as Error };
  }
}

export function extractStoragePath(imageUrl: string): string | null {
  try {
    const url = new URL(imageUrl);
    const match = url.pathname.match(/\/storage\/v1\/object\/public\/stickers\/(.+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export async function deleteSticker(stickerId: string, imageUrl: string): Promise<{ error: Error | null }> {
  try {
    const filePath = extractStoragePath(imageUrl);

    if (filePath) {
      const thumbnailPath = filePath.replace(/\.png$/i, '_thumb.png');
      const { error: storageError } = await supabase.storage
        .from('stickers')
        .remove([filePath, thumbnailPath]);

      if (storageError) {
        console.warn('Failed to delete storage file:', storageError);
      }
    }

    const { error: dbError } = await supabase
      .from('stickers')
      .delete()
      .eq('id', stickerId);

    if (dbError) {
      return { error: dbError };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function getStickersInBookByPage(
  bookId: string,
  pageIndex: number
): Promise<{ stickers: Sticker[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('stickers')
      .select(STICKER_DISPLAY_COLUMNS)
      .eq('book_id', bookId)
      .eq('page_index', pageIndex)
      .order('created_at', { ascending: false });

    if (error) {
      return { stickers: [], error };
    }

    return { stickers: data as Sticker[], error: null };
  } catch (error) {
    return { stickers: [], error: error as Error };
  }
}

export async function getStickerImageUrlsInBookPage(
  bookId: string,
  pageIndex: number
): Promise<{ urls: string[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('stickers')
      .select('image_url')
      .eq('book_id', bookId)
      .eq('page_index', pageIndex);

    if (error) {
      return { urls: [], error };
    }

    return {
      urls: (data || []).map((sticker) => sticker.image_url).filter(Boolean),
      error: null,
    };
  } catch (error) {
    return { urls: [], error: error as Error };
  }
}

export async function getUnplacedStickers(): Promise<{ stickers: Sticker[]; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { stickers: [], error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('stickers')
      .select(STICKER_DISPLAY_COLUMNS)
      .eq('user_id', user.id)
      .is('page_index', null)
      .order('created_at', { ascending: false });

    if (error) {
      return { stickers: [], error };
    }

    return { stickers: data as Sticker[], error: null };
  } catch (error) {
    return { stickers: [], error: error as Error };
  }
}

export async function getAllStickers(): Promise<{ stickers: Sticker[]; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { stickers: [], error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('stickers')
      .select(STICKER_DISPLAY_COLUMNS)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return { stickers: [], error };
    }

    return { stickers: data as Sticker[], error: null };
  } catch (error) {
    return { stickers: [], error: error as Error };
  }
}

export async function getStickerChangesSince(
  since: string
): Promise<{ stickers: Sticker[]; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { stickers: [], error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('stickers')
      .select(STICKER_SYNC_COLUMNS)
      .eq('user_id', user.id)
      .gt('updated_at', since)
      .order('updated_at', { ascending: true });

    if (error) {
      return { stickers: [], error };
    }

    return { stickers: data as Sticker[], error: null };
  } catch (error) {
    return { stickers: [], error: error as Error };
  }
}

export async function getStickerDeletionsSince(
  since: string
): Promise<{ deletions: StickerDeletion[]; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { deletions: [], error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('sticker_deletions')
      .select('sticker_id, deleted_at')
      .eq('user_id', user.id)
      .gt('deleted_at', since)
      .order('deleted_at', { ascending: true });

    if (error) {
      return { deletions: [], error };
    }

    return { deletions: data as StickerDeletion[], error: null };
  } catch (error) {
    return { deletions: [], error: error as Error };
  }
}

export async function updateStickerLayout(
  id: string,
  layout: { pos_x: number; pos_y: number; rotation: number }
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('stickers')
      .update({
        pos_x: layout.pos_x,
        pos_y: layout.pos_y,
        rotation: layout.rotation,
      })
      .eq('id', id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function updateStickerPageTransform(
  id: string,
  layout: { pos_x: number; pos_y: number; rotation: number; bookScale: number }
): Promise<{ error: Error | null }> {
  try {
    const { data: currentSticker, error: fetchError } = await supabase
      .from('stickers')
      .select('metadata')
      .eq('id', id)
      .single();

    if (fetchError) {
      return { error: fetchError };
    }

    const currentMetadata =
      currentSticker?.metadata && typeof currentSticker.metadata === 'object'
        ? currentSticker.metadata
        : {};
    const nextMetadata = {
      ...currentMetadata,
      bookScale: Math.max(0.35, Math.min(2.8, layout.bookScale)),
    };

    const { error } = await supabase
      .from('stickers')
      .update({
        pos_x: layout.pos_x,
        pos_y: layout.pos_y,
        rotation: layout.rotation,
        metadata: nextMetadata,
      })
      .eq('id', id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function updateStickerBookPageTransform(
  id: string,
  layout: { bookId: string; page_index: number; pos_x: number; pos_y: number; rotation: number; bookScale: number }
): Promise<{ error: Error | null }> {
  try {
    const { data: currentSticker, error: fetchError } = await supabase
      .from('stickers')
      .select('metadata')
      .eq('id', id)
      .eq('book_id', layout.bookId)
      .single();

    if (fetchError) {
      return { error: fetchError };
    }

    const currentMetadata =
      currentSticker?.metadata && typeof currentSticker.metadata === 'object'
        ? currentSticker.metadata
        : {};
    const nextMetadata = {
      ...currentMetadata,
      bookScale: Math.max(0.35, Math.min(2.8, layout.bookScale)),
    };

    const { data, error } = await supabase
      .from('stickers')
      .update({
        page_index: layout.page_index,
        pos_x: layout.pos_x,
        pos_y: layout.pos_y,
        rotation: layout.rotation,
        metadata: nextMetadata,
      })
      .eq('id', id)
      .eq('book_id', layout.bookId)
      .select('id')
      .maybeSingle();

    if (error) {
      return { error };
    }
    if (!data) {
      return { error: new Error('Sticker not found in this book') };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function placeStickerInBook(
  id: string,
  bookId: string,
  pageIndex: number,
  pos_x: number,
  pos_y: number,
  rotation: number
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('stickers')
      .update({
        book_id: bookId,
        page_index: pageIndex,
        pos_x,
        pos_y,
        rotation,
      })
      .eq('id', id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function removeStickerFromPage(id: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('stickers')
      .update({
        book_id: null,
        page_index: null,
        pos_x: null,
        pos_y: null,
      })
      .eq('id', id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function getBookPageElements(
  bookId: string
): Promise<{ elements: BookPageElement[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('book_page_elements')
      .select('*')
      .eq('book_id', bookId)
      .order('created_at', { ascending: true });

    if (error) {
      return { elements: [], error };
    }

    return { elements: data as BookPageElement[], error: null };
  } catch (error) {
    return { elements: [], error: error as Error };
  }
}

export async function getBookPageElementsByPage(
  bookId: string,
  pageIndex: number
): Promise<{ elements: BookPageElement[]; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('book_page_elements')
      .select(BOOK_PAGE_ELEMENT_DISPLAY_COLUMNS)
      .eq('book_id', bookId)
      .eq('page_index', pageIndex)
      .order('created_at', { ascending: true });

    if (error) {
      return { elements: [], error };
    }

    return { elements: data as BookPageElement[], error: null };
  } catch (error) {
    return { elements: [], error: error as Error };
  }
}

export async function getStickerOwnerHistory(
  stickerId: string
): Promise<{ history: StickerOwnerHistoryEntry[]; error: Error | null }> {
  try {
    const { data: historyData, error: historyError } = await supabase
      .from('sticker_owner_history')
      .select('*')
      .eq('sticker_id', stickerId)
      .order('acquired_at', { ascending: true });

    if (historyError) {
      return { history: [], error: historyError };
    }

    const ownerIds = Array.from(
      new Set((historyData || []).map((entry) => entry.owner_id).filter(Boolean))
    );

    const { data: profilesData, error: profilesError } = ownerIds.length > 0
      ? await supabase
        .from('user_profiles')
        .select('id, display_name')
        .in('id', ownerIds)
      : { data: [], error: null };

    if (profilesError) {
      return { history: [], error: profilesError };
    }

    const profileById = new Map<string, string>(
      ((profilesData || []) as { id: string; display_name: string }[])
        .map((profile) => [profile.id, profile.display_name])
    );

    const history = ((historyData || []) as Omit<StickerOwnerHistoryEntry, 'owner_display_name'>[])
      .map((entry) => ({
        ...entry,
        owner_display_name: profileById.get(entry.owner_id) || `Peelzy user ${entry.owner_id.slice(0, 4)}`,
      }));

    return { history, error: null };
  } catch (error) {
    return { history: [], error: error as Error };
  }
}

export async function createBookPageElement(
  input: NewBookPageElement
): Promise<{ element: BookPageElement | null; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { element: null, error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('book_page_elements')
      .insert({
        user_id: user.id,
        book_id: input.bookId,
        page_index: input.pageIndex,
        type: input.type,
        content: input.content,
        pos_x: input.pos_x,
        pos_y: input.pos_y,
        rotation: input.rotation ?? 0,
        color: input.color ?? null,
        style: input.style ?? {},
      })
      .select()
      .single();

    if (error) {
      return { element: null, error };
    }

    return { element: data as BookPageElement, error: null };
  } catch (error) {
    return { element: null, error: error as Error };
  }
}

export async function updateBookPageElementLayout(
  id: string,
  layout: { pos_x: number; pos_y: number; rotation: number; scale?: number; page_index?: number; bookId?: string }
): Promise<{ error: Error | null }> {
  try {
    let nextStyle: Record<string, unknown> | undefined;

    if (layout.scale !== undefined) {
      let query = supabase
        .from('book_page_elements')
        .select('style')
        .eq('id', id);
      if (layout.bookId) {
        query = query.eq('book_id', layout.bookId);
      }

      const { data, error: selectError } = await query.single();

      if (selectError) {
        return { error: selectError };
      }

      const currentStyle =
        data?.style && typeof data.style === 'object' && !Array.isArray(data.style)
          ? (data.style as Record<string, unknown>)
          : {};
      nextStyle = { ...currentStyle, scale: layout.scale };
    }

    let updateQuery = supabase
      .from('book_page_elements')
      .update({
        pos_x: layout.pos_x,
        pos_y: layout.pos_y,
        rotation: layout.rotation,
        ...(layout.page_index !== undefined ? { page_index: layout.page_index } : {}),
        ...(nextStyle ? { style: nextStyle } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (layout.bookId) {
      updateQuery = updateQuery.eq('book_id', layout.bookId);
    }

    const { data, error } = await updateQuery.select('id').maybeSingle();

    if (error) {
      return { error };
    }
    if (!data) {
      return { error: new Error('Page element not found in this book') };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function updateBookPageElementContent(
  id: string,
  input: { content: string; color: string | null; style?: Record<string, unknown> }
): Promise<{ error: Error | null }> {
  try {
    let nextStyle: Record<string, unknown> | undefined;

    if (input.style) {
      const { data, error: selectError } = await supabase
        .from('book_page_elements')
        .select('style')
        .eq('id', id)
        .single();

      if (selectError) {
        return { error: selectError };
      }

      const currentStyle =
        data?.style && typeof data.style === 'object' && !Array.isArray(data.style)
          ? (data.style as Record<string, unknown>)
          : {};
      nextStyle = { ...currentStyle, ...input.style };
    }

    const { error } = await supabase
      .from('book_page_elements')
      .update({
        content: input.content,
        color: input.color,
        ...(nextStyle ? { style: nextStyle } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function deleteBookPageElement(id: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('book_page_elements')
      .delete()
      .eq('id', id);

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function createExchangeOffer(
  stickerId: string,
  autoAccept = false
): Promise<{ offer: ExchangeOffer | null; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { offer: null, error: new Error('User not authenticated') };
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('sticker_exchange_offers')
      .insert({
        token: createExchangeToken(),
        owner_id: user.id,
        sticker_id: stickerId,
        auto_accept: autoAccept,
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (error) {
      return { offer: null, error };
    }

    return { offer: data as ExchangeOffer, error: null };
  } catch (error) {
    return { offer: null, error: error as Error };
  }
}

export async function getExchangeOfferByToken(
  token: string
): Promise<{ offer: ExchangeOffer | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from('sticker_exchange_offers')
      .select('*')
      .eq('token', token)
      .single();

    if (error) {
      return { offer: null, error };
    }

    const offer = data as ExchangeOffer;
    const { data: stickerData, error: stickerError } = await supabase
      .from('stickers')
      .select('*')
      .eq('id', offer.sticker_id)
      .single();

    if (stickerError) {
      return { offer: null, error: stickerError };
    }

    return { offer: { ...offer, sticker: stickerData as Sticker }, error: null };
  } catch (error) {
    return { offer: null, error: error as Error };
  }
}

export async function createExchangeProposal(
  token: string,
  offeredStickerId: string
): Promise<{ proposalId: string | null; error: Error | null }> {
  try {
    const { data, error } = await supabase.rpc('create_exchange_proposal_by_token', {
      offer_token: token,
      proposer_sticker_id: offeredStickerId,
    });

    if (error) {
      return { proposalId: null, error };
    }

    return { proposalId: data as string, error: null };
  } catch (error) {
    return { proposalId: null, error: error as Error };
  }
}

export async function getMyExchangeOffers(): Promise<{ offers: ExchangeOffer[]; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { offers: [], error: new Error('User not authenticated') };
    }

    const { data: offersData, error: offersError } = await supabase
      .from('sticker_exchange_offers')
      .select(EXCHANGE_OFFER_DISPLAY_COLUMNS)
      .eq('owner_id', user.id)
      .order('created_at', { ascending: false });

    if (offersError) {
      return { offers: [], error: offersError };
    }

    const offers = (offersData || []) as ExchangeOffer[];
    if (offers.length === 0) {
      return { offers: [], error: null };
    }

    const stickerIds = offers.map((offer) => offer.sticker_id);
    const { data: stickersData, error: stickersError } = await supabase
      .from('stickers')
      .select(STICKER_DISPLAY_COLUMNS)
      .in('id', stickerIds);

    if (stickersError) {
      return { offers: [], error: stickersError };
    }

    const offerIds = offers.map((offer) => offer.id);
    const { data: proposalsData, error: proposalsError } = await supabase
      .from('sticker_exchange_proposals')
      .select(EXCHANGE_PROPOSAL_DISPLAY_COLUMNS)
      .in('offer_id', offerIds)
      .order('created_at', { ascending: false });

    if (proposalsError) {
      return { offers: [], error: proposalsError };
    }

    const proposals = (proposalsData || []) as ExchangeProposal[];
    const proposedStickerIds = proposals.map((proposal) => proposal.offered_sticker_id);
    const { data: proposedStickersData, error: proposedStickersError } = proposedStickerIds.length > 0
      ? await supabase.from('stickers').select(STICKER_DISPLAY_COLUMNS).in('id', proposedStickerIds)
      : { data: [], error: null };

    if (proposedStickersError) {
      return { offers: [], error: proposedStickersError };
    }

    const stickersById = new Map<string, Sticker>(
      ((stickersData || []) as Sticker[]).map((sticker) => [sticker.id, sticker])
    );
    const proposedStickersById = new Map<string, Sticker>(
      ((proposedStickersData || []) as Sticker[]).map((sticker) => [sticker.id, sticker])
    );

    const proposalsByOfferId = new Map<string, ExchangeProposal[]>();
    proposals.forEach((proposal) => {
      const enrichedProposal = {
        ...proposal,
        offered_sticker: proposedStickersById.get(proposal.offered_sticker_id) || null,
      };
      const existing = proposalsByOfferId.get(proposal.offer_id) || [];
      proposalsByOfferId.set(proposal.offer_id, [...existing, enrichedProposal]);
    });

    const enrichedOffers = offers.map((offer) => ({
      ...offer,
      status: isOfferExpired(offer) ? 'expired' as ExchangeOfferStatus : offer.status,
      sticker: stickersById.get(offer.sticker_id) || null,
      proposals: proposalsByOfferId.get(offer.id) || [],
    }));

    return { offers: enrichedOffers, error: null };
  } catch (error) {
    return { offers: [], error: error as Error };
  }
}

export async function acceptExchangeProposal(proposalId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc('accept_exchange_proposal', {
      proposal_id: proposalId,
    });

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function rejectExchangeProposal(proposalId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc('reject_exchange_proposal', {
      p_proposal_id: proposalId,
    });

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function cancelExchangeOffer(offerId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc('cancel_exchange_offer', {
      p_offer_id: offerId,
    });

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}

export async function deleteExchangeOffer(offerId: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.rpc('delete_exchange_offer', {
      p_offer_id: offerId,
    });

    if (error) {
      return { error };
    }

    return { error: null };
  } catch (error) {
    return { error: error as Error };
  }
}
