import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const STICKER_IMAGE_CACHE_DIR = 'peelzy-sticker-images';
const pendingDownloads = new Map<string, Promise<string>>();

function getCacheDirectory() {
  const directory = new Directory(Paths.cache, STICKER_IMAGE_CACHE_DIR);
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

function getFileExtension(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return '.jpg';
    if (pathname.endsWith('.webp')) return '.webp';
  } catch {
    return '.png';
  }

  return '.png';
}

async function getCacheFile(url: string) {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
  return new File(getCacheDirectory(), `${hash}${getFileExtension(url)}`);
}

export async function getCachedStickerImageUri(url: string): Promise<string> {
  if (!url || url.startsWith('file:') || url.startsWith('data:') || Platform.OS === 'web') {
    return url;
  }

  const existingDownload = pendingDownloads.get(url);
  if (existingDownload) {
    return existingDownload;
  }

  const download = (async () => {
    try {
      const file = await getCacheFile(url);
      if (file.exists && file.size > 0) {
        return file.uri;
      }

      const downloaded = await File.downloadFileAsync(url, file, { idempotent: true });
      return downloaded.uri;
    } catch (error) {
      console.warn('Failed to cache sticker image:', error);
      return url;
    } finally {
      pendingDownloads.delete(url);
    }
  })();

  pendingDownloads.set(url, download);
  return download;
}

export function warmStickerImageCache(urls: Array<string | null | undefined>): void {
  urls.forEach((url) => {
    if (!url) return;
    getCachedStickerImageUri(url).catch(() => undefined);
  });
}
