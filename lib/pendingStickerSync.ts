import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import {
  createStickerThumbnail,
  Sticker,
  StickerMetadata,
  StickerPlacementIntent,
  uploadStickerWithId,
} from './storage';
import { getEffectiveAccountStatus } from './accountStatus';

const CACHE_VERSION = 1;
const PENDING_STICKERS_KEY = 'peelzy:pending-stickers';
const PENDING_STICKER_DIR = 'peelzy-pending-stickers';
const AUTO_RETRY_DELAYS_MS = [30_000, 180_000, 1_800_000, 10_800_000];
const MANUAL_RETRY_COOLDOWN_MS = 15_000;
const MANUAL_RETRY_ESCALATED_COOLDOWN_MS = 60_000;
const MANUAL_RETRY_MAX_COOLDOWN_MS = 300_000;
const inFlightPendingIds = new Set<string>();
let scheduledRetryTimer: ReturnType<typeof setTimeout> | null = null;

export type PendingStickerStatus = 'pending' | 'syncing' | 'needs_attention' | 'synced' | 'failed_permanent';
export type PendingStickerErrorType = 'network' | 'auth' | 'quota' | 'permanent' | 'local_file_missing' | null;

export type PendingStickerRecord = {
  version: number;
  pendingId: string;
  userId: string;
  localUri: string;
  previewUri?: string | null;
  width?: number;
  height?: number;
  metadata: StickerMetadata;
  placementIntent?: StickerPlacementIntent | null;
  status: PendingStickerStatus;
  attemptCount: number;
  autoAttemptCount: number;
  consecutiveManualFailures: number;
  nextRetryAt: string | null;
  lastManualRetryAt: string | null;
  lastError: string | null;
  errorType: PendingStickerErrorType;
  createdAt: string;
  updatedAt: string;
  syncedSticker?: Sticker | null;
};

type StoredPendingStickers = {
  version: number;
  items: PendingStickerRecord[];
};

type CreatePendingStickerInput = {
  userId: string;
  sourceUri: string;
  previewUri?: string | null;
  width?: number;
  height?: number;
  metadata: StickerMetadata;
  placementIntent?: StickerPlacementIntent | null;
};

type SyncPendingStickerOptions = {
  manual?: boolean;
};

function getPendingDirectory() {
  const directory = new Directory(Paths.document, PENDING_STICKER_DIR);
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

function getPendingFile(pendingId: string) {
  return new File(getPendingDirectory(), `${pendingId}.png`);
}

function nowIso() {
  return new Date().toISOString();
}

function getNextAutoRetryAt(autoAttemptCount: number) {
  const delay = AUTO_RETRY_DELAYS_MS[Math.min(autoAttemptCount, AUTO_RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

function getManualRetryCooldownMs(consecutiveFailures: number) {
  if (consecutiveFailures >= 5) return MANUAL_RETRY_MAX_COOLDOWN_MS;
  if (consecutiveFailures >= 3) return MANUAL_RETRY_ESCALATED_COOLDOWN_MS;
  return MANUAL_RETRY_COOLDOWN_MS;
}

function classifySyncError(error: Error | null | undefined): PendingStickerErrorType {
  const message = String(error?.message || '').toLowerCase();
  if (!message) return 'network';
  if (message.includes('not authenticated') || message.includes('jwt') || message.includes('auth')) {
    return 'auth';
  }
  if (message.includes('limit') || message.includes('quota')) {
    return 'quota';
  }
  if (
    message.includes('row-level security') ||
    message.includes('permission') ||
    message.includes('policy') ||
    message.includes('400') ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('404')
  ) {
    return 'permanent';
  }
  return 'network';
}

function isPermanentError(errorType: PendingStickerErrorType) {
  return errorType === 'auth' || errorType === 'quota' || errorType === 'permanent' || errorType === 'local_file_missing';
}

async function readPendingItems(): Promise<PendingStickerRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_STICKERS_KEY);
    if (!raw) return [];

    const stored = JSON.parse(raw) as Partial<StoredPendingStickers>;
    if (stored.version !== CACHE_VERSION || !Array.isArray(stored.items)) return [];

    return stored.items.filter((item) => item.version === CACHE_VERSION);
  } catch (error) {
    console.warn('Failed to read pending stickers:', error);
    return [];
  }
}

async function writePendingItems(items: PendingStickerRecord[]): Promise<void> {
  const activeItems = items.filter((item) => item.status !== 'synced');
  await AsyncStorage.setItem(PENDING_STICKERS_KEY, JSON.stringify({
    version: CACHE_VERSION,
    items: activeItems,
  }));
  scheduleNextPendingStickerRetry();
}

async function updatePendingSticker(
  pendingId: string,
  updater: (item: PendingStickerRecord) => PendingStickerRecord | null
): Promise<PendingStickerRecord | null> {
  const items = await readPendingItems();
  let updated: PendingStickerRecord | null = null;
  const nextItems = items.flatMap((item) => {
    if (item.pendingId !== pendingId) return [item];
    const next = updater(item);
    updated = next;
    return next ? [next] : [];
  });
  await writePendingItems(nextItems);
  return updated;
}

export async function createPendingSticker(input: CreatePendingStickerInput): Promise<PendingStickerRecord> {
  const pendingId = Crypto.randomUUID();
  const destination = getPendingFile(pendingId);
  if (destination.exists) {
    destination.delete();
  }
  new File(input.sourceUri).copy(destination);

  const createdAt = nowIso();
  const record: PendingStickerRecord = {
    version: CACHE_VERSION,
    pendingId,
    userId: input.userId,
    localUri: destination.uri,
    previewUri: input.previewUri ?? input.sourceUri,
    width: input.width,
    height: input.height,
    metadata: {
      ...input.metadata,
      pendingId,
      pendingCreatedAt: createdAt,
      pendingPlacementIntent: input.placementIntent ?? undefined,
    },
    placementIntent: input.placementIntent ?? null,
    status: 'pending',
    attemptCount: 0,
    autoAttemptCount: 0,
    consecutiveManualFailures: 0,
    nextRetryAt: new Date(Date.now() + AUTO_RETRY_DELAYS_MS[0]).toISOString(),
    lastManualRetryAt: null,
    lastError: null,
    errorType: null,
    createdAt,
    updatedAt: createdAt,
    syncedSticker: null,
  };

  const items = await readPendingItems();
  await writePendingItems([record, ...items.filter((item) => item.pendingId !== pendingId)]);
  return record;
}

export async function getPendingStickers(): Promise<PendingStickerRecord[]> {
  return readPendingItems();
}

export function getLocalStickerFromPending(record: PendingStickerRecord): Sticker {
  return {
    id: record.pendingId,
    user_id: record.userId,
    image_url: record.localUri,
    thumbnail_url: record.previewUri || record.localUri,
    page_index: record.placementIntent?.pageIndex ?? null,
    pos_x: record.placementIntent?.pos_x ?? null,
    pos_y: record.placementIntent?.pos_y ?? null,
    rotation: record.placementIntent?.rotation ?? 0,
    book_id: record.placementIntent?.bookId ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    metadata: record.metadata,
  };
}

export function canManualRetryPendingSticker(record: PendingStickerRecord): { canRetry: boolean; message?: string } {
  if (record.status === 'syncing' || inFlightPendingIds.has(record.pendingId)) {
    return { canRetry: false, message: 'Syncing...' };
  }
  if (isPermanentError(record.errorType)) {
    return { canRetry: false, message: 'This sticker cannot sync automatically.' };
  }
  if (record.lastManualRetryAt) {
    const elapsed = Date.now() - Date.parse(record.lastManualRetryAt);
    const cooldown = getManualRetryCooldownMs(record.consecutiveManualFailures);
    if (elapsed < cooldown) {
      const seconds = Math.ceil((cooldown - elapsed) / 1000);
      return { canRetry: false, message: seconds >= 60 ? `Try again in ${Math.ceil(seconds / 60)} min` : `Try again in ${seconds}s` };
    }
  }
  return { canRetry: true };
}

export async function syncPendingSticker(
  pendingId: string,
  options: SyncPendingStickerOptions = {}
): Promise<{ sticker: Sticker | null; record: PendingStickerRecord | null; error: Error | null }> {
  if (inFlightPendingIds.has(pendingId)) {
    const record = (await readPendingItems()).find((item) => item.pendingId === pendingId) ?? null;
    return { sticker: record?.syncedSticker ?? null, record, error: null };
  }

  const items = await readPendingItems();
  const record = items.find((item) => item.pendingId === pendingId) ?? null;
  if (!record) {
    return { sticker: null, record: null, error: new Error('Pending sticker not found') };
  }

  if (options.manual) {
    const retryState = canManualRetryPendingSticker(record);
    if (!retryState.canRetry) {
      return { sticker: null, record, error: new Error(retryState.message || 'Retry is not available yet') };
    }
  } else if (record.nextRetryAt && Date.now() < Date.parse(record.nextRetryAt)) {
    return { sticker: null, record, error: null };
  }

  inFlightPendingIds.add(pendingId);
  await updatePendingSticker(pendingId, (item) => ({
    ...item,
    status: 'syncing',
    lastManualRetryAt: options.manual ? nowIso() : item.lastManualRetryAt,
    updatedAt: nowIso(),
  }));

  try {
    const localFile = new File(record.localUri);
    if (!localFile.exists || localFile.size <= 0) {
      throw new Error('Local sticker file is missing');
    }

    const { status: accountStatus, error: accountError } = await getEffectiveAccountStatus(record.userId);
    if (accountError) {
      throw accountError;
    }
    if (accountStatus.stickers_remaining <= 0) {
      throw new Error('Sticker limit reached');
    }

    const { sticker, error } = await uploadStickerWithId(
      record.pendingId,
      record.localUri,
      record.userId,
      record.metadata,
      record.placementIntent
    );

    if (error || !sticker) {
      throw error || new Error('Failed to sync sticker');
    }

    if (record.previewUri) {
      createStickerThumbnail(record.pendingId, record.userId, record.previewUri, {
        width: record.width,
        height: record.height,
      }).catch((thumbnailError) => {
        console.warn('Failed to create pending sticker thumbnail:', thumbnailError);
      });
    }

    await updatePendingSticker(record.pendingId, () => null);
    if (localFile.exists) {
      try {
        localFile.delete();
      } catch {
        // Keep the synced state even if local cleanup fails.
      }
    }
    return { sticker, record: { ...record, status: 'synced', syncedSticker: sticker }, error: null };
  } catch (error) {
    const syncError = error as Error;
    const errorType = syncError.message === 'Local sticker file is missing'
      ? 'local_file_missing'
      : classifySyncError(syncError);
    const nextAutoAttemptCount = options.manual ? record.autoAttemptCount : record.autoAttemptCount + 1;
    const exhaustedAutoRetries = nextAutoAttemptCount >= AUTO_RETRY_DELAYS_MS.length;
    const status: PendingStickerStatus = isPermanentError(errorType)
      ? 'failed_permanent'
      : exhaustedAutoRetries
        ? 'needs_attention'
        : 'pending';

    const updated = await updatePendingSticker(record.pendingId, (item) => ({
      ...item,
      status,
      attemptCount: item.attemptCount + 1,
      autoAttemptCount: options.manual ? item.autoAttemptCount : nextAutoAttemptCount,
      consecutiveManualFailures: options.manual ? item.consecutiveManualFailures + 1 : item.consecutiveManualFailures,
      nextRetryAt: status === 'pending' ? getNextAutoRetryAt(nextAutoAttemptCount) : null,
      lastError: syncError.message,
      errorType,
      updatedAt: nowIso(),
    }));

    return { sticker: null, record: updated, error: syncError };
  } finally {
    inFlightPendingIds.delete(pendingId);
    scheduleNextPendingStickerRetry();
  }
}

export async function processPendingStickerQueue(options?: { force?: boolean; limit?: number }): Promise<void> {
  const items = await readPendingItems();
  const dueItems = items.filter((item) => {
    if (item.status === 'syncing' || item.status === 'failed_permanent') return false;
    if (item.status === 'needs_attention' && !options?.force) return false;
    if (options?.force) return true;
    return !item.nextRetryAt || Date.now() >= Date.parse(item.nextRetryAt);
  });

  const limit = options?.limit ?? 3;
  for (const item of dueItems.slice(0, limit)) {
    await syncPendingSticker(item.pendingId);
  }
}

export async function syncPendingStickerManually(pendingId: string) {
  return syncPendingSticker(pendingId, { manual: true });
}

export function scheduleNextPendingStickerRetry(): void {
  if (scheduledRetryTimer) {
    clearTimeout(scheduledRetryTimer);
    scheduledRetryTimer = null;
  }

  readPendingItems().then((items) => {
    const nextTimes = items
      .filter((item) => item.status === 'pending' && item.nextRetryAt)
      .map((item) => Date.parse(item.nextRetryAt as string))
      .filter((time) => Number.isFinite(time));
    if (nextTimes.length === 0) return;

    const nextTime = Math.min(...nextTimes);
    const delay = Math.max(1000, nextTime - Date.now());
    scheduledRetryTimer = setTimeout(() => {
      scheduledRetryTimer = null;
      processPendingStickerQueue({ limit: 3 }).catch((error) => {
        console.warn('Pending sticker auto sync failed:', error);
      });
    }, delay);
  });
}
