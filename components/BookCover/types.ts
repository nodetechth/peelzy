import { DEFAULT_PEELZY_COLOR, PEELZY_COLORS, PeelzyColorValue } from '../../constants/colors';

export type CoverTheme = 'classic' | 'brutalist' | 'film';

export type AccentColor = PeelzyColorValue;

export type CoverSticker = {
  id: string;
  image_url: string;
};

export interface BookCoverProps {
  bookName: string;
  stickerCount: number;
  stickers: CoverSticker[];
  theme: CoverTheme;
  accentColor: AccentColor;
  width?: number;
  height?: number;
  onPress?: () => void;
  preview?: boolean;
}

export const COVER_ACCENT_COLORS: AccentColor[] = PEELZY_COLORS;

export const DEFAULT_COVER_THEME: CoverTheme = 'classic';
export const DEFAULT_ACCENT_COLOR: AccentColor = DEFAULT_PEELZY_COLOR;
