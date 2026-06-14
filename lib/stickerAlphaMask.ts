import type { Sticker, StickerMetadata } from './storage';
import type { StickerFrameMode } from './stickerFrames';

export const STICKER_ALPHA_MASK_SIZE = 64;
export const STICKER_ALPHA_MASK_ENCODING = 'hex-1bit' as const;

export type StickerAlphaMask = {
  size: number;
  encoding: typeof STICKER_ALPHA_MASK_ENCODING;
  data: string;
};

const HEX_BYTE_PATTERN = /^[0-9a-f]+$/i;

function encodeMask(isOpaque: (x: number, y: number) => boolean): StickerAlphaMask {
  const pixelCount = STICKER_ALPHA_MASK_SIZE * STICKER_ALPHA_MASK_SIZE;
  const bytes = new Uint8Array(Math.ceil(pixelCount / 8));

  for (let y = 0; y < STICKER_ALPHA_MASK_SIZE; y += 1) {
    for (let x = 0; x < STICKER_ALPHA_MASK_SIZE; x += 1) {
      if (!isOpaque(x, y)) continue;
      const index = y * STICKER_ALPHA_MASK_SIZE + x;
      bytes[Math.floor(index / 8)] |= 1 << (7 - (index % 8));
    }
  }

  return {
    size: STICKER_ALPHA_MASK_SIZE,
    encoding: STICKER_ALPHA_MASK_ENCODING,
    data: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
  };
}

function isPointInPolygon(
  pointX: number,
  pointY: number,
  polygon: Array<{ x: number; y: number }>
): boolean {
  let inside = false;

  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current, current += 1) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    const crosses =
      currentPoint.y > pointY !== previousPoint.y > pointY &&
      pointX <
        ((previousPoint.x - currentPoint.x) * (pointY - currentPoint.y)) /
          (previousPoint.y - currentPoint.y || Number.EPSILON) +
          currentPoint.x;
    if (crosses) inside = !inside;
  }

  return inside;
}

function createStarPolygon() {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? 0.4785 : 0.2393;
    return {
      x: 0.5 + Math.cos(angle) * radius,
      y: 0.5 + Math.sin(angle) * radius,
    };
  });
}

function isInsideHeart(x: number, y: number): boolean {
  const normalizedX = (x - 0.5) / 0.43;
  const normalizedY = (0.54 - y) / 0.43;
  const equation =
    Math.pow(normalizedX * normalizedX + normalizedY * normalizedY - 1, 3) -
    normalizedX * normalizedX * Math.pow(normalizedY, 3);
  return equation <= 0 && y >= 0.08 && y <= 0.92;
}

export function createFrameAlphaMask(
  mode: Exclude<StickerFrameMode, 'cutout'>
): StickerAlphaMask {
  const starPolygon = mode === 'star' ? createStarPolygon() : [];

  return encodeMask((maskX, maskY) => {
    const x = (maskX + 0.5) / STICKER_ALPHA_MASK_SIZE;
    const y = (maskY + 0.5) / STICKER_ALPHA_MASK_SIZE;

    if (mode === 'heart') return isInsideHeart(x, y);
    if (mode === 'star') return isPointInPolygon(x, y, starPolygon);

    const radiusX = 132 / 1024;
    const radiusY = 132 / 768;
    const nearestX = Math.max(radiusX, Math.min(1 - radiusX, x));
    const nearestY = Math.max(radiusY, Math.min(1 - radiusY, y));
    const dx = (x - nearestX) / radiusX;
    const dy = (y - nearestY) / radiusY;
    return dx * dx + dy * dy <= 1;
  });
}

export function createNativeAlphaMask(alphaMaskData?: string): StickerAlphaMask | undefined {
  const expectedLength = Math.ceil(
    (STICKER_ALPHA_MASK_SIZE * STICKER_ALPHA_MASK_SIZE) / 8
  ) * 2;
  if (
    typeof alphaMaskData !== 'string' ||
    alphaMaskData.length !== expectedLength ||
    !HEX_BYTE_PATTERN.test(alphaMaskData)
  ) {
    return undefined;
  }

  return {
    size: STICKER_ALPHA_MASK_SIZE,
    encoding: STICKER_ALPHA_MASK_ENCODING,
    data: alphaMaskData.toLowerCase(),
  };
}

export function getStickerAlphaMask(
  sticker: Pick<Sticker, 'metadata'>
): StickerAlphaMask | undefined {
  const rawMask = sticker.metadata?.alphaMask;
  if (!rawMask || typeof rawMask !== 'object') return undefined;

  const mask = rawMask as Partial<NonNullable<StickerMetadata['alphaMask']>>;
  if (
    mask.size !== STICKER_ALPHA_MASK_SIZE ||
    mask.encoding !== STICKER_ALPHA_MASK_ENCODING
  ) {
    return undefined;
  }

  return createNativeAlphaMask(mask.data);
}

function isMaskCellOpaque(mask: StickerAlphaMask, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mask.size || y >= mask.size) return false;
  const index = y * mask.size + x;
  const byteIndex = Math.floor(index / 8);
  const byte = Number.parseInt(mask.data.slice(byteIndex * 2, byteIndex * 2 + 2), 16);
  return (byte & (1 << (7 - (index % 8)))) !== 0;
}

export function isPointWithinAlphaMask(
  mask: StickerAlphaMask,
  normalizedX: number,
  normalizedY: number,
  radiusCells: number
): boolean {
  if (
    normalizedX < 0 ||
    normalizedY < 0 ||
    normalizedX > 1 ||
    normalizedY > 1
  ) {
    return false;
  }

  const centerX = Math.min(mask.size - 1, Math.floor(normalizedX * mask.size));
  const centerY = Math.min(mask.size - 1, Math.floor(normalizedY * mask.size));
  const radius = Math.max(0, Math.min(mask.size, Math.ceil(radiusCells)));

  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (isMaskCellOpaque(mask, x, y)) return true;
    }
  }

  return false;
}
