import { AccentColor, CoverSticker, COVER_ACCENT_COLORS, DEFAULT_ACCENT_COLOR } from './types';

export function getStickerRotation(stickerId: string, index: number, range = 10): number {
  const seed = parseInt(stickerId.slice(-4), 16) || index * 137;
  return (seed % (range * 2)) - range;
}

export function fillStickerSlots(stickers: CoverSticker[]): Array<CoverSticker | null> {
  return Array.from({ length: 5 }, (_, index) => stickers[index] ?? null);
}

export function darkenColor(hex: string, amount = 20): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function normalizeAccentColor(value?: string | null): AccentColor {
  if (!value || !/^#[0-9A-Fa-f]{6}$/.test(value)) return DEFAULT_ACCENT_COLOR;
  const normalized = value.toUpperCase() as AccentColor;
  return COVER_ACCENT_COLORS.includes(normalized) ? normalized : DEFAULT_ACCENT_COLOR;
}

export function truncateTitle(value: string, maxLength = 14): string {
  const title = value.trim() || 'BOOK';
  return title.length > maxLength ? `${title.slice(0, maxLength - 1)}…` : title;
}
