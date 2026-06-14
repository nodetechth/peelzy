import { DEFAULT_PEELZY_COLOR, PEELZY_COLOR_OPTIONS, PeelzyColorValue } from '../constants/colors';

export type StickerFrameMode = 'cutout' | 'rounded' | 'heart' | 'star';

export type StickerFrameColor = {
  label: string;
  value: PeelzyColorValue;
};

export const DEFAULT_STICKER_FRAME_MODE: StickerFrameMode = 'cutout';
export const DEFAULT_STICKER_FRAME_COLOR = DEFAULT_PEELZY_COLOR;
export const STICKER_FRAME_COLORS: StickerFrameColor[] = PEELZY_COLOR_OPTIONS;

export function normalizeStickerFrameMode(value?: string | string[]): StickerFrameMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'rounded' || raw === 'heart' || raw === 'star' || raw === 'cutout'
    ? raw
    : DEFAULT_STICKER_FRAME_MODE;
}

export function normalizeStickerFrameColor(value?: string | string[]): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return STICKER_FRAME_COLORS.some((color) => color.value === raw)
    ? raw!
    : DEFAULT_STICKER_FRAME_COLOR;
}

export function getStickerFrameLabel(mode: StickerFrameMode): string {
  switch (mode) {
    case 'rounded':
      return 'Rounded';
    case 'heart':
      return 'Heart';
    case 'star':
      return 'Star';
    case 'cutout':
    default:
      return 'Cutout';
  }
}
