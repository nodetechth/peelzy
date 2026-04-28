import { supabase } from './supabase';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function uploadPhoto(uri: string, userId: string): Promise<{ path: string | null; error: Error | null }> {
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const fileName = `${userId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage
      .from('photos')
      .upload(fileName, decode(base64), {
        contentType: 'image/jpeg',
        upsert: false,
      });

    if (error) {
      return { path: null, error };
    }

    return { path: fileName, error: null };
  } catch (error) {
    return { path: null, error: error as Error };
  }
}

export function getPhotoUrl(path: string): string {
  const { data } = supabase.storage.from('photos').getPublicUrl(path);
  return data.publicUrl;
}

export type StickerPosition = {
  x: number;
  y: number;
};

export type StickerMetadata = {
  capturedAt: string;
  originalPhotoPath?: string;
  position?: StickerPosition;
};

export type Sticker = {
  id: string;
  user_id?: string;
  image_url: string;
  page_index: number | null;
  pos_x: number | null;
  pos_y: number | null;
  rotation: number;
  book_id: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
};

export type Book = {
  id: string;
  name: string;
  cover_color: string;
  created_at: string;
  sticker_count: number;
};

export async function uploadSticker(
  base64Data: string,
  userId: string,
  metadata: StickerMetadata
): Promise<{ sticker: Sticker | null; error: Error | null }> {
  try {
    const stickerId = generateUUID();
    const fileName = `${userId}/${stickerId}.png`;

    const { error: uploadError } = await supabase.storage
      .from('stickers')
      .upload(fileName, decode(base64Data), {
        contentType: 'image/png',
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

export async function createBook(name: string): Promise<{ book: Book | null; error: Error | null }> {
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
      .select('*, stickers(count)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    if (error) {
      return { books: [], error };
    }

    const books: Book[] = (data || []).map((row: { id: string; name: string; cover_color: string; created_at: string; stickers: { count: number }[] }) => ({
      id: row.id,
      name: row.name,
      cover_color: row.cover_color,
      created_at: row.created_at,
      sticker_count: row.stickers?.[0]?.count ?? 0,
    }));

    return { books, error: null };
  } catch (error) {
    return { books: [], error: error as Error };
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
      const { error: storageError } = await supabase.storage
        .from('stickers')
        .remove([filePath]);

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
      .select('*')
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

export async function getUnplacedStickers(): Promise<{ stickers: Sticker[]; error: Error | null }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { stickers: [], error: new Error('User not authenticated') };
    }

    const { data, error } = await supabase
      .from('stickers')
      .select('*')
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
      .select('*')
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
