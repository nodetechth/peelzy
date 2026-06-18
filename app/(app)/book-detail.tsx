import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Modal,
  Platform,
  FlatList,
  PanResponder,
  Animated,
  TextInput,
  Alert,
  Linking,
  Share,
  KeyboardAvoidingView,
  AppState,
  GestureResponderEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';
import {
  Book,
  BookPageElement,
  BookPageElementType,
  createBookPageElement,
  deleteBookPageElement,
  getBookForDetail,
  getBookPageElementsByPage,
  getStickersInBookByPage,
  getStickerBookScale,
  getStickerDisplayScale,
  getUnplacedStickers,
  updateBookPageElementContent,
  updateBookPageElementLayout,
  updateBookPageElementStyle,
  updateBookPageColor,
  updateStickerBookMetadata,
  updateStickerBookPageTransform,
  updateStickerPageTransform,
  removeStickerFromPage,
  placeStickerInBook,
  Sticker,
} from '../../lib/storage';
import { theme } from '../../constants/theme';
import { PEELZY_COLORS } from '../../constants/colors';
import { CoverTheme, DEFAULT_ACCENT_COLOR, DEFAULT_COVER_THEME } from '../../components/BookCover';
import { normalizeAccentColor } from '../../components/BookCover/utils';
import { getStickerAlphaMask, isPointWithinAlphaMask } from '../../lib/stickerAlphaMask';
import CachedStickerImage from '../../components/CachedStickerImage';
import {
  getCachedBookDetail,
  getCachedBookPage,
  setCachedBookDetail,
  setCachedBookPage,
} from '../../lib/bookPageCache';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STICKER_SIZE = 280;
const STICKER_RENDER_SIZE = 1024;
const STICKER_RENDER_SCALE = STICKER_SIZE / STICKER_RENDER_SIZE;
const NOTE_WIDTH = 138;
const NOTE_HEIGHT = 104;
const TEXT_MIN_WIDTH = 156;
const TEXT_MAX_WIDTH = 360;
const TEXT_FONT_SIZE = 38;
const TEXT_LINE_HEIGHT = 44;
const STAMP_SIZE = 46;
const CANVAS_MARGIN = 20;
const NUM_COLUMNS = 3;
const GRID_GAP = 8;
const PICKER_CARD_SIZE = (SCREEN_WIDTH - 32 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const TAB_BAR_HEIGHT = 52;

const SWIPE_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 200;
const MIN_PAGE_ZOOM = 1;
const MAX_PAGE_ZOOM = 2.4;
const STICKER_HIT_EXPANSION = 12;
const MIN_STICKER_HIT_SIZE = 44;
const ELEMENT_COLORS = PEELZY_COLORS;
const STAMP_CHOICES = ['♡', '☆', '✦', '☺', '♬', '☾'];

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const normalizeRotation = (value: number) => ((((value + 180) % 360) + 360) % 360) - 180;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function getLayerOrder(
  item: Pick<Sticker, 'metadata' | 'created_at'> | Pick<BookPageElement, 'style' | 'created_at'>,
  fallback: number
): number {
  const source = 'metadata' in item
    ? item.metadata
    : (item as Pick<BookPageElement, 'style' | 'created_at'>).style;
  const rawOrder = source?.layerOrder;
  if (typeof rawOrder === 'number' && Number.isFinite(rawOrder)) {
    return rawOrder;
  }

  const createdAt = Date.parse(item.created_at);
  return Number.isFinite(createdAt) ? createdAt : fallback;
}

function sortByLayerOrder<T extends { id: string; created_at: string; metadata?: Record<string, unknown>; style?: Record<string, unknown> }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const orderDiff = getLayerOrder(a, 0) - getLayerOrder(b, 0);
    return orderDiff !== 0 ? orderDiff : a.id.localeCompare(b.id);
  });
}

function reorderLayerItems<T extends { id: string }>(
  items: T[],
  id: string,
  direction: 'up' | 'down'
): T[] {
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return items;

  const targetIndex = direction === 'up' ? index + 1 : index - 1;
  if (targetIndex < 0 || targetIndex >= items.length) return items;

  const next = [...items];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

function layerOrderForIndex(index: number): number {
  return (index + 1) * 1000;
}

function getTouchDistance(touches: Array<{ pageX: number; pageY: number }>) {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  const dx = second.pageX - first.pageX;
  const dy = second.pageY - first.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getTouchAngle(touches: Array<{ pageX: number; pageY: number }>) {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  return Math.atan2(second.pageY - first.pageY, second.pageX - first.pageX) * (180 / Math.PI);
}

type NormalizedStickerBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getStickerNormalizedHitBounds(sticker: Sticker): NormalizedStickerBounds {
  const rawBounds = sticker.metadata?.hitBounds;
  if (
    rawBounds &&
    typeof rawBounds === 'object' &&
    'x' in rawBounds &&
    'y' in rawBounds &&
    'width' in rawBounds &&
    'height' in rawBounds
  ) {
    const bounds = rawBounds as Record<string, unknown>;
    const x = typeof bounds.x === 'number' ? bounds.x : 0;
    const y = typeof bounds.y === 'number' ? bounds.y : 0;
    const width = typeof bounds.width === 'number' ? bounds.width : 1;
    const height = typeof bounds.height === 'number' ? bounds.height : 1;

    return {
      x: clamp(x, 0, 1),
      y: clamp(y, 0, 1),
      width: clamp(width, 0.04, 1),
      height: clamp(height, 0.04, 1),
    };
  }

  return {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  };
}

function getStickerHitFrame(
  sticker: Sticker,
  stickerSize: number,
  displayScale: number,
  useFullStickerFrame = false
) {
  const displayedCanvasSize = stickerSize * displayScale;
  const displayedCanvasOffset = (stickerSize - displayedCanvasSize) / 2;
  if (useFullStickerFrame) {
    return {
      left: displayedCanvasOffset,
      top: displayedCanvasOffset,
      width: displayedCanvasSize,
      height: displayedCanvasSize,
    };
  }

  const bounds = useFullStickerFrame
    ? { x: 0, y: 0, width: 1, height: 1 }
    : getStickerNormalizedHitBounds(sticker);
  const minHitSize = Math.min(stickerSize, MIN_STICKER_HIT_SIZE);
  const width = Math.min(
    stickerSize,
    Math.max(minHitSize, displayedCanvasSize * bounds.width + STICKER_HIT_EXPANSION * 2)
  );
  const height = Math.min(
    stickerSize,
    Math.max(minHitSize, displayedCanvasSize * bounds.height + STICKER_HIT_EXPANSION * 2)
  );
  const centerX = displayedCanvasOffset + displayedCanvasSize * (bounds.x + bounds.width / 2);
  const centerY = displayedCanvasOffset + displayedCanvasSize * (bounds.y + bounds.height / 2);

  return {
    left: clamp(centerX - width / 2, 0, Math.max(0, stickerSize - width)),
    top: clamp(centerY - height / 2, 0, Math.max(0, stickerSize - height)),
    width,
    height,
  };
}

function getStickerDragBounds(
  canvasWidth: number,
  canvasHeight: number,
  stickerSize: number,
  hitFrame: { left: number; top: number; width: number; height: number }
) {
  return {
    minX: -hitFrame.left,
    maxX: canvasWidth - hitFrame.left - hitFrame.width,
    minY: -hitFrame.top,
    maxY: canvasHeight - hitFrame.top - hitFrame.height,
  };
}

function getStickerLayoutDragBounds(
  canvasWidth: number,
  canvasHeight: number,
  stickerSize: number
) {
  return {
    minX: -stickerSize / 2,
    maxX: canvasWidth - stickerSize / 2,
    minY: -stickerSize / 2,
    maxY: canvasHeight - stickerSize / 2,
  };
}

function isStickerTapHit(
  sticker: Sticker,
  pointX: number,
  pointY: number,
  canvasWidth: number,
  canvasHeight: number,
  pageZoom: number,
  pagePanX: number,
  pagePanY: number
) {
  const bookScale = getStickerBookScale(sticker);
  const displayScale = getStickerDisplayScale(sticker);
  const stickerSize = STICKER_SIZE * pageZoom * bookScale;
  const centerX =
    canvasWidth / 2 +
    ((sticker.pos_x ?? 0.5) * canvasWidth - canvasWidth / 2) * pageZoom +
    pagePanX;
  const centerY =
    canvasHeight / 2 +
    ((sticker.pos_y ?? 0.5) * canvasHeight - canvasHeight / 2) * pageZoom +
    pagePanY;
  const rotationRadians = ((sticker.rotation ?? 0) * Math.PI) / 180;
  const deltaX = pointX - centerX;
  const deltaY = pointY - centerY;
  const localX =
    deltaX * Math.cos(rotationRadians) + deltaY * Math.sin(rotationRadians);
  const localY =
    -deltaX * Math.sin(rotationRadians) + deltaY * Math.cos(rotationRadians);
  const displayedImageSize = stickerSize * displayScale;
  const normalizedX = localX / displayedImageSize + 0.5;
  const normalizedY = localY / displayedImageSize + 0.5;
  const alphaMask = getStickerAlphaMask(sticker);

  if (alphaMask) {
    const proximityPx = Math.max(
      STICKER_HIT_EXPANSION,
      (MIN_STICKER_HIT_SIZE - displayedImageSize) / 2
    );
    const radiusCells = (proximityPx / displayedImageSize) * alphaMask.size;
    return isPointWithinAlphaMask(alphaMask, normalizedX, normalizedY, radiusCells);
  }

  const hitFrame = getStickerHitFrame(sticker, stickerSize, displayScale, false);
  const pointInStickerX = localX + stickerSize / 2;
  const pointInStickerY = localY + stickerSize / 2;
  return (
    pointInStickerX >= hitFrame.left &&
    pointInStickerX <= hitFrame.left + hitFrame.width &&
    pointInStickerY >= hitFrame.top &&
    pointInStickerY <= hitFrame.top + hitFrame.height
  );
}

function getPageElementStyleNumber(
  element: Pick<BookPageElement, 'style'>,
  key: string,
  fallback: number
) {
  const rawValue = element.style?.[key];
  return typeof rawValue === 'number' && Number.isFinite(rawValue) ? rawValue : fallback;
}

function getTextElementSize(content: string) {
  const text = content.trim() || 'Text';
  const lines = text.split(/\r?\n/);
  const averageCharWidth = TEXT_FONT_SIZE * 0.54;
  const horizontalPadding = 14;
  const maxCharsPerLine = Math.max(1, Math.floor((TEXT_MAX_WIDTH - horizontalPadding) / averageCharWidth));
  let visualLineCount = 0;
  let longestVisualLine = 1;

  lines.forEach((line) => {
    const length = Math.max(line.length, 1);
    const wrappedLines = Math.max(1, Math.ceil(length / maxCharsPerLine));
    visualLineCount += wrappedLines;
    longestVisualLine = Math.max(longestVisualLine, Math.min(length, maxCharsPerLine));
  });

  return {
    width: clamp(longestVisualLine * averageCharWidth + horizontalPadding, TEXT_MIN_WIDTH, TEXT_MAX_WIDTH),
    height: Math.max(58, visualLineCount * TEXT_LINE_HEIGHT + 10),
  };
}

type Pages = Record<number, Sticker[]>;
type ElementsByPage = Record<number, BookPageElement[]>;
type CanvasSelectionType = 'sticker' | 'element' | null;
type SelectionAction = {
  type: 'done' | 'peel' | 'delete' | 'edit' | 'scaleUp' | 'scaleDown' | 'rotateLeft' | 'rotateRight' | 'layerUp' | 'layerDown' | 'moveToPage';
  nonce: number;
  targetPage?: number;
};
type CanvasScreenFrame = { x: number; y: number; width: number; height: number } | null;

type PageCanvasProps = {
  stickers: Sticker[];
  elements: BookPageElement[];
  isArranging: boolean;
  onStickerTransform: (id: string, pos_x: number, pos_y: number, rotation: number, bookScale: number) => void;
  onStickerMoveToPage: (
    id: string,
    targetPage: number,
    pos_x: number,
    pos_y: number,
    rotation: number,
    bookScale: number
  ) => void;
  onStickerLayerChange: (id: string, direction: 'up' | 'down') => void;
  onStickerPeelOff: (id: string) => void;
  onElementMove: (id: string, pos_x: number, pos_y: number, rotation: number, scale: number) => void;
  onElementMoveToPage: (
    id: string,
    targetPage: number,
    pos_x: number,
    pos_y: number,
    rotation: number,
    scale: number
  ) => void;
  onElementLayerChange: (id: string, direction: 'up' | 'down') => void;
  onElementDelete: (id: string) => void;
  onElementEditRequest: (element: BookPageElement) => void;
  onEmptyPress: () => void;
  onStickerSelectionChange: (selected: boolean) => void;
  onSelectionTypeChange: (type: CanvasSelectionType) => void;
  selectionAction: SelectionAction | null;
  onSelectionActionHandled: () => void;
  canvasWidth: number;
  canvasHeight: number;
  pageZoom: number;
  pagePanX: number;
  pagePanY: number;
  canvasScreenFrame: CanvasScreenFrame;
  currentPage: number;
  clearSelectionNonce: number;
  newlyPlacedId: string | null;
  pageTheme: CoverTheme;
  accentColor: string;
};

function PageCanvas({
  stickers,
  elements,
  isArranging,
  onStickerTransform,
  onStickerMoveToPage,
  onStickerLayerChange,
  onStickerPeelOff,
  onElementMove,
  onElementMoveToPage,
  onElementLayerChange,
  onElementDelete,
  onElementEditRequest,
  onEmptyPress,
  onStickerSelectionChange,
  onSelectionTypeChange,
  selectionAction,
  onSelectionActionHandled,
  canvasWidth,
  canvasHeight,
  pageZoom,
  pagePanX,
  pagePanY,
  canvasScreenFrame,
  currentPage,
  clearSelectionNonce,
  newlyPlacedId,
  pageTheme,
  accentColor,
}: PageCanvasProps) {
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [peelConfirmSticker, setPeelConfirmSticker] = useState<Sticker | null>(null);
  const pendingStickerTapRef = useRef<Sticker | null>(null);
  const isBrutalist = pageTheme === 'brutalist';
  const isFilm = pageTheme === 'film';
  const selectedSticker = stickers.find((sticker) => sticker.id === selectedStickerId) ?? null;
  const selectedElement = elements.find((element) => element.id === selectedElementId) ?? null;
  const hasSelection = Boolean(selectedSticker || selectedElement);

  useEffect(() => {
    setSelectedStickerId(null);
    setSelectedElementId(null);
    setPeelConfirmSticker(null);
    pendingStickerTapRef.current = null;
  }, [clearSelectionNonce, currentPage]);

  useEffect(() => {
    onStickerSelectionChange(Boolean(selectedSticker || selectedElement));
    onSelectionTypeChange(selectedSticker ? 'sticker' : selectedElement ? 'element' : null);
  }, [onSelectionTypeChange, onStickerSelectionChange, selectedElement, selectedSticker]);

  useEffect(() => {
    if (!selectionAction) return;

    if (selectionAction.type === 'done') {
      setSelectedStickerId(null);
      setSelectedElementId(null);
    }

    if (selectionAction.type === 'peel' && selectedSticker) {
      setPeelConfirmSticker(selectedSticker);
    }

    if (selectionAction.type === 'delete' && selectedElement) {
      onElementDelete(selectedElement.id);
      setSelectedElementId(null);
    }

    if (selectionAction.type === 'edit' && selectedElement) {
      onElementEditRequest(selectedElement);
    }

    if (selectionAction.type === 'layerUp') {
      if (selectedSticker) {
        onStickerLayerChange(selectedSticker.id, 'up');
      }
      if (selectedElement) {
        onElementLayerChange(selectedElement.id, 'up');
      }
      Haptics.selectionAsync();
    }

    if (selectionAction.type === 'layerDown') {
      if (selectedSticker) {
        onStickerLayerChange(selectedSticker.id, 'down');
      }
      if (selectedElement) {
        onElementLayerChange(selectedElement.id, 'down');
      }
      Haptics.selectionAsync();
    }

    if (
      selectionAction.type === 'moveToPage' &&
      typeof selectionAction.targetPage === 'number' &&
      selectionAction.targetPage !== currentPage
    ) {
      if (selectedSticker) {
        onStickerMoveToPage(
          selectedSticker.id,
          selectionAction.targetPage,
          selectedSticker.pos_x ?? 0.5,
          selectedSticker.pos_y ?? 0.5,
          selectedSticker.rotation ?? 0,
          getStickerBookScale(selectedSticker)
        );
        setSelectedStickerId(null);
      }

      if (selectedElement) {
        onElementMoveToPage(
          selectedElement.id,
          selectionAction.targetPage,
          selectedElement.pos_x,
          selectedElement.pos_y,
          selectedElement.rotation ?? 0,
          getElementScale(selectedElement)
        );
        setSelectedElementId(null);
      }
    }

    if (
      selectedSticker &&
      ['scaleUp', 'scaleDown', 'rotateLeft', 'rotateRight'].includes(selectionAction.type)
    ) {
      const currentScale = getStickerBookScale(selectedSticker);
      const nextScale =
        selectionAction.type === 'scaleUp'
          ? clamp(currentScale * 1.12, 0.35, 2.8)
          : selectionAction.type === 'scaleDown'
            ? clamp(currentScale / 1.12, 0.35, 2.8)
            : currentScale;
      const currentRotation = selectedSticker.rotation ?? 0;
      const nextRotation =
        selectionAction.type === 'rotateLeft'
          ? normalizeRotation(currentRotation - 10)
          : selectionAction.type === 'rotateRight'
            ? normalizeRotation(currentRotation + 10)
            : currentRotation;

      onStickerTransform(
        selectedSticker.id,
        selectedSticker.pos_x ?? 0.5,
        selectedSticker.pos_y ?? 0.5,
        nextRotation,
        nextScale
      );
      updateStickerPageTransform(selectedSticker.id, {
        pos_x: selectedSticker.pos_x ?? 0.5,
        pos_y: selectedSticker.pos_y ?? 0.5,
        rotation: nextRotation,
        bookScale: nextScale,
      });
      Haptics.selectionAsync();
    }

    if (
      selectedElement &&
      ['scaleUp', 'scaleDown', 'rotateLeft', 'rotateRight'].includes(selectionAction.type)
    ) {
      const currentScale = getElementScale(selectedElement);
      const nextScale =
        selectionAction.type === 'scaleUp'
          ? clamp(currentScale * 1.12, 0.45, 2.6)
          : selectionAction.type === 'scaleDown'
            ? clamp(currentScale / 1.12, 0.45, 2.6)
            : currentScale;
      const currentRotation = selectedElement.rotation ?? 0;
      const nextRotation =
        selectionAction.type === 'rotateLeft'
          ? normalizeRotation(currentRotation - 10)
          : selectionAction.type === 'rotateRight'
            ? normalizeRotation(currentRotation + 10)
            : currentRotation;

      onElementMove(
        selectedElement.id,
        selectedElement.pos_x,
        selectedElement.pos_y,
        nextRotation,
        nextScale
      );
      updateBookPageElementLayout(selectedElement.id, {
        pos_x: selectedElement.pos_x,
        pos_y: selectedElement.pos_y,
        rotation: nextRotation,
        scale: nextScale,
      });
      Haptics.selectionAsync();
    }

    onSelectionActionHandled();
  }, [
    onElementDelete,
    onElementEditRequest,
    onElementMove,
    onElementMoveToPage,
    onElementLayerChange,
    onSelectionActionHandled,
    onStickerMoveToPage,
    onStickerLayerChange,
    onStickerTransform,
    currentPage,
    selectedElement,
    selectedSticker,
    selectionAction,
  ]);

  const handleStickerTap = useCallback((sticker: Sticker) => {
    setSelectedElementId(null);
    setSelectedStickerId((current) => (current === sticker.id ? null : sticker.id));
    Haptics.selectionAsync();
  }, []);

  const getCanvasPoint = useCallback(
    (event: GestureResponderEvent) => {
      const { pageX, pageY, locationX, locationY } = event.nativeEvent;
      if (
        canvasScreenFrame &&
        Number.isFinite(pageX) &&
        Number.isFinite(pageY)
      ) {
        return {
          x: pageX - canvasScreenFrame.x,
          y: pageY - canvasScreenFrame.y,
        };
      }

      return { x: locationX, y: locationY };
    },
    [canvasScreenFrame]
  );

  const findTopmostStickerAtPoint = useCallback(
    (pointX: number, pointY: number) => {
      for (let index = stickers.length - 1; index >= 0; index -= 1) {
        const sticker = stickers[index];
        if (
          isStickerTapHit(
            sticker,
            pointX,
            pointY,
            canvasWidth,
            canvasHeight,
            pageZoom,
            pagePanX,
            pagePanY
          )
        ) {
          return sticker;
        }
      }

      return null;
    },
    [canvasHeight, canvasWidth, pagePanX, pagePanY, pageZoom, stickers]
  );

  const handleStartShouldSetResponderCapture = useCallback(
    (event: GestureResponderEvent) => {
      const point = getCanvasPoint(event);
      const sticker = findTopmostStickerAtPoint(point.x, point.y);
      if (sticker && sticker.id === selectedStickerId) return false;
      pendingStickerTapRef.current = sticker;
      return sticker !== null;
    },
    [findTopmostStickerAtPoint, getCanvasPoint, selectedStickerId]
  );

  const handleStickerTapRelease = useCallback(() => {
    const sticker = pendingStickerTapRef.current;
    pendingStickerTapRef.current = null;
    if (sticker) handleStickerTap(sticker);
  }, [handleStickerTap]);

  const clearPendingStickerTap = useCallback(() => {
    pendingStickerTapRef.current = null;
  }, []);

  const handleElementTap = useCallback((element: BookPageElement) => {
    setSelectedStickerId(null);
    setSelectedElementId((current) => (current === element.id ? null : element.id));
    Haptics.selectionAsync();
  }, []);

  const handleCanvasEmptyPress = useCallback(() => {
    if (!hasSelection) return;
    if (pendingStickerTapRef.current) return;
    setSelectedStickerId(null);
    setSelectedElementId(null);
    setPeelConfirmSticker(null);
    pendingStickerTapRef.current = null;
    Haptics.selectionAsync();
  }, [hasSelection]);

  const handlePeelOff = useCallback(async () => {
    if (!peelConfirmSticker) return;

    const stickerId = peelConfirmSticker.id;
    setPeelConfirmSticker(null);
    setSelectedStickerId(null);
    onStickerPeelOff(stickerId);
  }, [peelConfirmSticker, onStickerPeelOff]);

  if (stickers.length === 0 && elements.length === 0) {
    return (
      <TouchableOpacity
        style={[styles.emptyPage, isBrutalist && styles.emptyPageBrutalist, isFilm && styles.emptyPageFilm]}
        onPress={onEmptyPress}
        activeOpacity={0.72}
        disabled={isArranging}
      >
        <View style={[styles.emptyIcon, isBrutalist && styles.emptyIconBrutalist, isFilm && styles.emptyIconFilm]}>
          <Text style={[styles.emptyIconText, isBrutalist && styles.emptyIconTextBrutalist, isFilm && styles.emptyIconTextFilm]}>+</Text>
        </View>
        <Text style={[styles.emptyText, isBrutalist && styles.emptyTextBrutalist, isFilm && styles.emptyTextFilm]}>
          This page is empty.{'\n'}Add a sticker, note, text, or stamp ✦
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View
      onStartShouldSetResponderCapture={handleStartShouldSetResponderCapture}
      onResponderRelease={handleStickerTapRelease}
      onResponderTerminate={clearPendingStickerTap}
      onStartShouldSetResponder={() => hasSelection}
      onResponderGrant={handleCanvasEmptyPress}
      style={[
        styles.pageCanvasContainer,
        !isFilm && { backgroundColor: accentColor },
        isBrutalist && [styles.pageCanvasBrutalist, { backgroundColor: accentColor }],
        isFilm && styles.pageCanvasFilm,
      ]}
    >
      {isFilm && (
        <View pointerEvents="none" style={styles.filmPerforationLayer}>
          {Array.from({ length: 18 }).map((_, index) => (
            <View key={`film-l-${index}`} style={[styles.filmPerforation, { top: 14 + index * 24, left: 10 }]} />
          ))}
          {Array.from({ length: 18 }).map((_, index) => (
            <View key={`film-r-${index}`} style={[styles.filmPerforation, { top: 14 + index * 24, right: 10 }]} />
          ))}
        </View>
      )}

      <View
        pointerEvents="none"
        style={[
          styles.paperGrid,
          isBrutalist && styles.paperGridBrutalist,
          isFilm && styles.paperGridFilm,
        ]}
      >
        {Array.from({ length: 12 }).map((_, index) => (
          <View
            key={`v-${index}`}
            style={[
              styles.gridLineVertical,
              isBrutalist && styles.gridLineBrutalist,
              isFilm && styles.gridLineFilm,
              { left: `${(index + 1) * 7.7}%` },
            ]}
          />
        ))}
        {Array.from({ length: 16 }).map((_, index) => (
          <View
            key={`h-${index}`}
            style={[
              styles.gridLineHorizontal,
              isBrutalist && styles.gridLineBrutalist,
              isFilm && styles.gridLineFilm,
              { top: `${(index + 1) * 5.8}%` },
            ]}
          />
        ))}
      </View>

      {isFilm && (
        <>
          <View pointerEvents="none" style={styles.filmOuterBorder} />
          <View pointerEvents="none" style={styles.filmInnerBorder} />
          <View pointerEvents="none" style={styles.filmMetaStrip}>
            <Text style={styles.filmMetaText}>PEELZY 400TX</Text>
            <Text style={styles.filmMetaText}>EI 400</Text>
          </View>
        </>
      )}

      {elements.map((element) => (
        <DraggablePageElement
          key={element.id}
          element={element}
          isSelected={selectedElementId === element.id}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          onTap={() => handleElementTap(element)}
          onTransform={onElementMove}
        />
      ))}

      {stickers.map((sticker) => (
        <DraggableSticker
          key={sticker.id}
          sticker={sticker}
          isSelected={selectedStickerId === sticker.id}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          onTap={() => handleStickerTap(sticker)}
          onTransform={onStickerTransform}
          isNewlyPlaced={sticker.id === newlyPlacedId}
          pageZoom={pageZoom}
          pagePanX={pagePanX}
          pagePanY={pagePanY}
          allowVisibleOverflowDrag
        />
      ))}

      <Modal
        visible={peelConfirmSticker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPeelConfirmSticker(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setPeelConfirmSticker(null)}
        >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={(event) => event.stopPropagation()}
          >
            {peelConfirmSticker && (
              <>
                <CachedStickerImage
                  uri={peelConfirmSticker.image_url}
                  style={[
                    styles.modalImage,
                    { transform: [{ rotate: `${peelConfirmSticker.rotation ?? 0}deg` }] },
                  ]}
                  resizeMode="contain"
                />
                <Text style={styles.peelOffHint}>
                  This sticker will return to your collection.
                </Text>
                <TouchableOpacity
                  style={styles.peelOffButton}
                  onPress={handlePeelOff}
                >
                  <Text style={styles.peelOffButtonText}>Peel off</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setPeelConfirmSticker(null)}
                >
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

type DraggablePageElementProps = {
  element: BookPageElement;
  isSelected: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onTap: () => void;
  onTransform: (id: string, pos_x: number, pos_y: number, rotation: number, scale: number) => void;
};

function getElementSize(element: BookPageElement) {
  if (element.type === 'stamp') {
    return { width: STAMP_SIZE, height: STAMP_SIZE };
  }
  if (element.type === 'text') {
    const estimatedSize = getTextElementSize(element.content);
    return {
      width: getPageElementStyleNumber(element, 'width', estimatedSize.width),
      height: getPageElementStyleNumber(element, 'height', estimatedSize.height),
    };
  }
  return { width: NOTE_WIDTH, height: NOTE_HEIGHT };
}

function getElementScale(element: BookPageElement) {
  const rawScale = element.style?.scale;
  const scale = typeof rawScale === 'number' && Number.isFinite(rawScale) ? rawScale : 1;
  return clamp(scale, 0.45, 2.6);
}

function DraggablePageElement({
  element,
  isSelected,
  canvasWidth,
  canvasHeight,
  onTap,
  onTransform,
}: DraggablePageElementProps) {
  const baseSize = getElementSize(element);
  const initialScale = getElementScale(element);
  const [currentScale, setCurrentScale] = useState(initialScale);
  const [currentRotation, setCurrentRotation] = useState(element.rotation ?? 0);
  const initialX = (element.pos_x * canvasWidth) - (baseSize.width * initialScale) / 2;
  const initialY = (element.pos_y * canvasHeight) - (baseSize.height * initialScale) / 2;
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const liftScale = useRef(new Animated.Value(1)).current;
  const [currentPos, setCurrentPos] = useState({ x: initialX, y: initialY });
  const [currentZIndex, setCurrentZIndex] = useState(2);
  const [isCommittingDrop, setIsCommittingDrop] = useState(false);
  const positionRef = useRef({ x: initialX, y: initialY });
  const scaleRef = useRef(initialScale);
  const rotationRef = useRef(element.rotation ?? 0);
  const gestureStartPositionRef = useRef({ x: initialX, y: initialY });
  const gestureModeRef = useRef<'drag' | 'pinch' | null>(null);
  const gestureStartDistanceRef = useRef(0);
  const gestureStartAngleRef = useRef(0);
  const gestureStartScaleRef = useRef(initialScale);
  const gestureStartRotationRef = useRef(element.rotation ?? 0);
  useEffect(() => {
    const nextScale = getElementScale(element);
    const nextRotation = element.rotation ?? 0;
    const nextWidth = baseSize.width * nextScale;
    const nextHeight = baseSize.height * nextScale;
    const nextX = (element.pos_x * canvasWidth) - nextWidth / 2;
    const nextY = (element.pos_y * canvasHeight) - nextHeight / 2;
    positionRef.current = { x: nextX, y: nextY };
    setCurrentPos({ x: nextX, y: nextY });
    scaleRef.current = nextScale;
    rotationRef.current = nextRotation;
    setCurrentScale(nextScale);
    setCurrentRotation(nextRotation);
    pan.setOffset({ x: 0, y: 0 });
    pan.setValue({ x: 0, y: 0 });
  }, [baseSize.height, baseSize.width, canvasHeight, canvasWidth, element.pos_x, element.pos_y, element.rotation, element.style]);

  const saveElementTransform = useCallback((finalX: number, finalY: number) => {
    const finalScale = scaleRef.current;
    const finalRotation = normalizeRotation(rotationRef.current);
    const finalWidth = baseSize.width * finalScale;
    const finalHeight = baseSize.height * finalScale;
    const normalizedX = clamp((finalX + finalWidth / 2) / canvasWidth, 0, 1);
    const normalizedY = clamp((finalY + finalHeight / 2) / canvasHeight, 0, 1);

    onTransform(element.id, normalizedX, normalizedY, finalRotation, finalScale);
    updateBookPageElementLayout(element.id, {
      pos_x: normalizedX,
      pos_y: normalizedY,
      rotation: finalRotation,
      scale: finalScale,
    });
  }, [baseSize.height, baseSize.width, canvasHeight, canvasWidth, element.id, onTransform]);

  const getDragBounds = useCallback((scaleValue = scaleRef.current) => {
    const width = baseSize.width * scaleValue;
    const height = baseSize.height * scaleValue;
    return {
      minX: -width * 0.25,
      maxX: canvasWidth - width * 0.75,
      minY: -height * 0.25,
      maxY: canvasHeight - height * 0.75,
    };
  }, [baseSize.height, baseSize.width, canvasHeight, canvasWidth]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: (event) => {
          if (!isSelected) {
            gestureModeRef.current = null;
            return;
          }

          const touches = event.nativeEvent.touches;
          setCurrentZIndex(998);
          gestureStartPositionRef.current = { ...positionRef.current };
          pan.setOffset({ x: 0, y: 0 });
          pan.setValue({ x: 0, y: 0 });

          if (touches.length >= 2) {
            gestureModeRef.current = 'pinch';
            gestureStartDistanceRef.current = getTouchDistance(touches);
            gestureStartAngleRef.current = getTouchAngle(touches);
            gestureStartScaleRef.current = scaleRef.current;
            gestureStartRotationRef.current = rotationRef.current;
          } else {
            gestureModeRef.current = 'drag';
          }

          Animated.spring(liftScale, {
            toValue: 1.06,
            damping: 14,
            stiffness: 220,
            useNativeDriver: true,
          }).start();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        },
        onPanResponderMove: (event, gestureState) => {
          if (!isSelected) return;

          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            if (gestureModeRef.current !== 'pinch') {
              gestureModeRef.current = 'pinch';
              gestureStartDistanceRef.current = getTouchDistance(touches);
              gestureStartAngleRef.current = getTouchAngle(touches);
              gestureStartScaleRef.current = scaleRef.current;
              gestureStartRotationRef.current = rotationRef.current;
              pan.setValue({ x: 0, y: 0 });
            }

            const nextDistance = getTouchDistance(touches);
            const startDistance = gestureStartDistanceRef.current || nextDistance || 1;
            const nextScale = clamp(
              gestureStartScaleRef.current * (nextDistance / startDistance),
              0.45,
              2.6
            );
            const nextRotation = normalizeRotation(
              gestureStartRotationRef.current +
                getTouchAngle(touches) -
                gestureStartAngleRef.current
            );
            const oldWidth = baseSize.width * scaleRef.current;
            const oldHeight = baseSize.height * scaleRef.current;
            const newWidth = baseSize.width * nextScale;
            const newHeight = baseSize.height * nextScale;
            const centerX = positionRef.current.x + oldWidth / 2;
            const centerY = positionRef.current.y + oldHeight / 2;
            const bounds = getDragBounds(nextScale);
            const nextX = clamp(centerX - newWidth / 2, bounds.minX, bounds.maxX);
            const nextY = clamp(centerY - newHeight / 2, bounds.minY, bounds.maxY);

            scaleRef.current = nextScale;
            rotationRef.current = nextRotation;
            positionRef.current = { x: nextX, y: nextY };
            setCurrentScale(nextScale);
            setCurrentRotation(nextRotation);
            setCurrentPos({ x: nextX, y: nextY });
            return;
          }

          if (gestureModeRef.current === 'pinch') return;

          const bounds = getDragBounds();
          const nextX = clamp(gestureStartPositionRef.current.x + gestureState.dx, bounds.minX, bounds.maxX);
          const nextY = clamp(gestureStartPositionRef.current.y + gestureState.dy, bounds.minY, bounds.maxY);
          positionRef.current = { x: nextX, y: nextY };
          pan.setValue({
            x: nextX - gestureStartPositionRef.current.x,
            y: nextY - gestureStartPositionRef.current.y,
          });
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!isSelected) {
            if (Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10) {
              onTap();
            }
            return;
          }

          if (gestureModeRef.current === 'pinch') {
            pan.setValue({ x: 0, y: 0 });
            gestureModeRef.current = null;
            saveElementTransform(positionRef.current.x, positionRef.current.y);
            Animated.spring(liftScale, {
              toValue: 1,
              damping: 14,
              stiffness: 220,
              useNativeDriver: true,
            }).start(() => setCurrentZIndex(2));
            return;
          }

          if (Math.abs(gestureState.dx) < 4 && Math.abs(gestureState.dy) < 4) {
            pan.setOffset({ x: 0, y: 0 });
            pan.setValue({ x: 0, y: 0 });
            gestureModeRef.current = null;
            setCurrentZIndex(2);
            onTap();
            Animated.spring(liftScale, {
              toValue: 1,
              damping: 14,
              stiffness: 220,
              useNativeDriver: true,
            }).start();
            return;
          }

          const bounds = getDragBounds();
          const finalX = clamp(positionRef.current.x, bounds.minX, bounds.maxX);
          const finalY = clamp(positionRef.current.y, bounds.minY, bounds.maxY);
          positionRef.current = { x: finalX, y: finalY };
          setIsCommittingDrop(true);
          pan.setOffset({ x: 0, y: 0 });
          pan.setValue({ x: 0, y: 0 });
          setCurrentPos({ x: finalX, y: finalY });
          gestureModeRef.current = null;
          saveElementTransform(finalX, finalY);
          Animated.spring(liftScale, {
            toValue: 1,
            damping: 14,
            stiffness: 220,
            useNativeDriver: true,
          }).start(() => setCurrentZIndex(2));
          requestAnimationFrame(() => setIsCommittingDrop(false));
        },
      }),
    [
      baseSize.height,
      baseSize.width,
      getDragBounds,
      isSelected,
      liftScale,
      onTap,
      pan,
      saveElementTransform,
    ]
  );

  const elementRotation = `${currentRotation}deg`;
  const baseStyle = [
    styles.pageElement,
    {
      left: currentPos.x,
      top: currentPos.y,
      width: baseSize.width,
      height: baseSize.height,
      zIndex: currentZIndex,
      transform: [
        { translateX: pan.x },
        { translateY: pan.y },
        { scale: currentScale },
        { scale: liftScale },
        { rotate: elementRotation },
      ],
    },
    isSelected && styles.pageElementSelected,
    isCommittingDrop && styles.stickerCommittingDrop,
  ];

  return (
    <Animated.View style={baseStyle} {...panResponder.panHandlers}>
      {element.type === 'note' && (
        <View style={[styles.noteElement, { backgroundColor: element.color || '#F2E8FF' }]}>
          <View style={styles.noteTape} />
          <Text style={styles.noteText}>{element.content}</Text>
        </View>
      )}
      {element.type === 'text' && (
        <Text style={[styles.handTextElement, { color: element.color || '#8B6FEF' }]}>
          {element.content}
        </Text>
      )}
      {element.type === 'stamp' && (
        <Text style={[styles.stampElement, { color: element.color || '#B994FF' }]}>
          {element.content}
        </Text>
      )}
    </Animated.View>
  );
}

type DraggableStickerProps = {
  sticker: Sticker;
  isSelected: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onTap: () => void;
  onTransform: (id: string, pos_x: number, pos_y: number, rotation: number, bookScale: number) => void;
  isNewlyPlaced: boolean;
  pageZoom: number;
  pagePanX: number;
  pagePanY: number;
  allowVisibleOverflowDrag?: boolean;
};

function DraggableSticker({
  sticker,
  isSelected,
  canvasWidth,
  canvasHeight,
  onTap,
  onTransform,
  isNewlyPlaced,
  pageZoom,
  pagePanX,
  pagePanY,
  allowVisibleOverflowDrag = false,
}: DraggableStickerProps) {
  const posX = sticker.pos_x ?? 0.5;
  const posY = sticker.pos_y ?? 0.5;
  const displayScale = getStickerDisplayScale(sticker);
  const initialBookScale = getStickerBookScale(sticker);
  const [currentRotation, setCurrentRotation] = useState(sticker.rotation ?? 0);
  const [currentBookScale, setCurrentBookScale] = useState(initialBookScale);
  const stickerSize = STICKER_SIZE * pageZoom * currentBookScale;
  const stickerRenderSize = STICKER_RENDER_SIZE * pageZoom * currentBookScale;
  const stickerRenderScale = stickerSize / stickerRenderSize;
  const hitFrame = useMemo(
    () => getStickerHitFrame(sticker, stickerSize, displayScale, isSelected),
    [displayScale, isSelected, sticker, stickerSize]
  );
  const touchFrame = useMemo(() => {
    const left = Math.min(0, hitFrame.left);
    const top = Math.min(0, hitFrame.top);
    const right = Math.max(stickerSize, hitFrame.left + hitFrame.width);
    const bottom = Math.max(stickerSize, hitFrame.top + hitFrame.height);

    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
    };
  }, [hitFrame.height, hitFrame.left, hitFrame.top, hitFrame.width, stickerSize]);

  const initialStickerSize = STICKER_SIZE * pageZoom * initialBookScale;
  const initialX = canvasWidth / 2 + ((posX * canvasWidth) - canvasWidth / 2) * pageZoom + pagePanX - initialStickerSize / 2;
  const initialY = canvasHeight / 2 + ((posY * canvasHeight) - canvasHeight / 2) * pageZoom + pagePanY - initialStickerSize / 2;

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  const [currentPos, setCurrentPos] = useState({ x: initialX, y: initialY });
  const [currentZIndex, setCurrentZIndex] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isCommittingDrop, setIsCommittingDrop] = useState(false);
  const positionRef = useRef({ x: initialX, y: initialY });
  const gestureStartPositionRef = useRef({ x: initialX, y: initialY });
  const bookScaleRef = useRef(initialBookScale);
  const rotationRef = useRef(sticker.rotation ?? 0);
  const gestureModeRef = useRef<'drag' | 'pinch' | null>(null);
  const gestureStartDistanceRef = useRef(0);
  const gestureStartAngleRef = useRef(0);
  const gestureStartScaleRef = useRef(initialBookScale);
  const gestureStartRotationRef = useRef(sticker.rotation ?? 0);
  const resetTemporaryStickerTransform = useCallback(() => {
    scale.stopAnimation();
    rotate.stopAnimation();
    scale.setValue(1);
    rotate.setValue(0);
  }, [rotate, scale]);

  useEffect(() => {
    const nextBookScale = getStickerBookScale(sticker);
    const nextRotation = sticker.rotation ?? 0;
    const nextStickerSize = STICKER_SIZE * pageZoom * nextBookScale;
    const newX = canvasWidth / 2 + ((posX * canvasWidth) - canvasWidth / 2) * pageZoom + pagePanX - nextStickerSize / 2;
    const newY = canvasHeight / 2 + ((posY * canvasHeight) - canvasHeight / 2) * pageZoom + pagePanY - nextStickerSize / 2;
    positionRef.current = { x: newX, y: newY };
    setCurrentPos({ x: newX, y: newY });
    bookScaleRef.current = nextBookScale;
    rotationRef.current = nextRotation;
    setCurrentBookScale(nextBookScale);
    setCurrentRotation(nextRotation);
    pan.setOffset({ x: 0, y: 0 });
    pan.setValue({ x: 0, y: 0 });

    if (isNewlyPlaced) {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.94,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 12,
          stiffness: 420,
          useNativeDriver: true,
        }),
      ]).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [posX, posY, canvasWidth, canvasHeight, pagePanX, pagePanY, pageZoom, isNewlyPlaced, sticker.id, sticker.metadata, sticker.rotation]);

  useEffect(() => {
    if (isSelected) {
      setCurrentZIndex(998);
      return;
    }
    resetTemporaryStickerTransform();
    setCurrentZIndex(1);
    setIsDragging(false);
  }, [isSelected, resetTemporaryStickerTransform]);

  const getNormalizedPosition = useCallback((finalX: number, finalY: number) => {
    const finalBookScale = bookScaleRef.current;
    const finalStickerSize = STICKER_SIZE * pageZoom * finalBookScale;
    const centerX = finalX + finalStickerSize / 2;
    const centerY = finalY + finalStickerSize / 2;
    const unzoomedX = ((centerX - pagePanX - canvasWidth / 2) / pageZoom) + canvasWidth / 2;
    const unzoomedY = ((centerY - pagePanY - canvasHeight / 2) / pageZoom) + canvasHeight / 2;

    return {
      x: Math.max(0, Math.min(1, unzoomedX / canvasWidth)),
      y: Math.max(0, Math.min(1, unzoomedY / canvasHeight)),
    };
  }, [canvasHeight, canvasWidth, pagePanX, pagePanY, pageZoom]);

  const saveTransform = useCallback((finalX: number, finalY: number) => {
    const normalized = getNormalizedPosition(finalX, finalY);
    const finalBookScale = bookScaleRef.current;
    const finalRotation = normalizeRotation(rotationRef.current);

    onTransform(sticker.id, normalized.x, normalized.y, finalRotation, finalBookScale);
    updateStickerPageTransform(sticker.id, {
      pos_x: normalized.x,
      pos_y: normalized.y,
      rotation: finalRotation,
      bookScale: finalBookScale,
    });
  }, [getNormalizedPosition, sticker.id, onTransform]);

  const animateDropSequence = useCallback((finalX: number, finalY: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 0.93,
          duration: 85,
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: 0,
          duration: 85,
          useNativeDriver: true,
        }),
      ]),
      Animated.spring(scale, {
        toValue: 1,
        damping: 10,
        stiffness: 520,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentZIndex(1);
      setIsDragging(false);
    });

    positionRef.current = { x: finalX, y: finalY };
    saveTransform(finalX, finalY);
  }, [saveTransform]);

  const persistCurrentTransform = useCallback(() => {
    const finalStickerSize = STICKER_SIZE * pageZoom * bookScaleRef.current;
    const dragBounds = allowVisibleOverflowDrag
      ? getStickerLayoutDragBounds(canvasWidth, canvasHeight, finalStickerSize)
      : getStickerDragBounds(canvasWidth, canvasHeight, finalStickerSize, hitFrame);
    const finalX = clamp(positionRef.current.x, dragBounds.minX, dragBounds.maxX);
    const finalY = clamp(positionRef.current.y, dragBounds.minY, dragBounds.maxY);
    positionRef.current = { x: finalX, y: finalY };
    setCurrentPos({ x: finalX, y: finalY });
    saveTransform(finalX, finalY);
  }, [allowVisibleOverflowDrag, canvasHeight, canvasWidth, hitFrame, pageZoom, saveTransform]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (event, gestureState) =>
          event.nativeEvent.touches.length >= 2 ||
          Math.abs(gestureState.dx) > 4 ||
          Math.abs(gestureState.dy) > 4,
        onPanResponderGrant: (event) => {
          if (!isSelected) {
            gestureModeRef.current = null;
            return;
          }
          const touches = event.nativeEvent.touches;
          setCurrentZIndex(999);
          setIsDragging(true);
          pan.setOffset({ x: 0, y: 0 });
          pan.setValue({ x: 0, y: 0 });
          gestureStartPositionRef.current = { ...positionRef.current };
          if (touches.length >= 2) {
            gestureModeRef.current = 'pinch';
            gestureStartDistanceRef.current = getTouchDistance(touches);
            gestureStartAngleRef.current = getTouchAngle(touches);
            gestureStartScaleRef.current = bookScaleRef.current;
            gestureStartRotationRef.current = rotationRef.current;
          } else {
            gestureModeRef.current = 'drag';
          }
          Animated.parallel([
            Animated.spring(scale, {
              toValue: 1.08,
              damping: 14,
              stiffness: 220,
              useNativeDriver: true,
            }),
            Animated.spring(rotate, {
              toValue: -2,
              damping: 14,
              stiffness: 220,
              useNativeDriver: true,
            }),
          ]).start();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
        onPanResponderMove: (event, gestureState) => {
          if (!isSelected) return;
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            if (gestureModeRef.current !== 'pinch') {
              gestureModeRef.current = 'pinch';
              gestureStartDistanceRef.current = getTouchDistance(touches);
              gestureStartAngleRef.current = getTouchAngle(touches);
              gestureStartScaleRef.current = bookScaleRef.current;
              gestureStartRotationRef.current = rotationRef.current;
              pan.setValue({ x: 0, y: 0 });
            }

            const nextDistance = getTouchDistance(touches);
            const startDistance = gestureStartDistanceRef.current || nextDistance || 1;
            const nextScale = clamp(
              gestureStartScaleRef.current * (nextDistance / startDistance),
              0.35,
              2.8
            );
            const nextAngle = getTouchAngle(touches);
            const nextRotation = normalizeRotation(
              gestureStartRotationRef.current + nextAngle - gestureStartAngleRef.current
            );
            const oldSize = STICKER_SIZE * pageZoom * bookScaleRef.current;
            const newSize = STICKER_SIZE * pageZoom * nextScale;
            const centerX = positionRef.current.x + oldSize / 2;
            const centerY = positionRef.current.y + oldSize / 2;
            const dragBounds = allowVisibleOverflowDrag
              ? getStickerLayoutDragBounds(canvasWidth, canvasHeight, newSize)
              : getStickerDragBounds(canvasWidth, canvasHeight, newSize, hitFrame);
            const nextX = clamp(centerX - newSize / 2, dragBounds.minX, dragBounds.maxX);
            const nextY = clamp(centerY - newSize / 2, dragBounds.minY, dragBounds.maxY);
            bookScaleRef.current = nextScale;
            rotationRef.current = nextRotation;
            positionRef.current = { x: nextX, y: nextY };
            setCurrentBookScale(nextScale);
            setCurrentRotation(nextRotation);
            setCurrentPos({ x: nextX, y: nextY });
            return;
          }

          if (gestureModeRef.current === 'pinch') return;
          const dragBounds = allowVisibleOverflowDrag
            ? getStickerLayoutDragBounds(canvasWidth, canvasHeight, stickerSize)
            : getStickerDragBounds(canvasWidth, canvasHeight, stickerSize, hitFrame);
          const nextX = clamp(
            gestureStartPositionRef.current.x + gestureState.dx,
            dragBounds.minX,
            dragBounds.maxX
          );
          const nextY = clamp(
            gestureStartPositionRef.current.y + gestureState.dy,
            dragBounds.minY,
            dragBounds.maxY
          );
          positionRef.current = { x: nextX, y: nextY };
          pan.setValue({
            x: nextX - gestureStartPositionRef.current.x,
            y: nextY - gestureStartPositionRef.current.y,
          });
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!isSelected) {
            if (Math.abs(gestureState.dx) < 10 && Math.abs(gestureState.dy) < 10) {
              onTap();
            }
            return;
          }

          if (gestureModeRef.current === 'pinch') {
            pan.setValue({ x: 0, y: 0 });
            gestureModeRef.current = null;
            persistCurrentTransform();
            Animated.parallel([
              Animated.spring(scale, {
                toValue: 1,
                damping: 10,
                stiffness: 520,
                useNativeDriver: true,
              }),
              Animated.spring(rotate, {
                toValue: 0,
                damping: 14,
                stiffness: 220,
                useNativeDriver: true,
              }),
            ]).start(() => {
              setCurrentZIndex(1);
              setIsDragging(false);
            });
            return;
          }

          if (Math.abs(gestureState.dx) < 4 && Math.abs(gestureState.dy) < 4) {
            pan.setOffset({ x: 0, y: 0 });
            pan.setValue({ x: 0, y: 0 });
            gestureModeRef.current = null;
            setCurrentZIndex(1);
            setIsDragging(false);
            resetTemporaryStickerTransform();
            onTap();
            return;
          }

          const dragBounds = allowVisibleOverflowDrag
            ? getStickerLayoutDragBounds(canvasWidth, canvasHeight, stickerSize)
            : getStickerDragBounds(canvasWidth, canvasHeight, stickerSize, hitFrame);
          const finalX = clamp(positionRef.current.x, dragBounds.minX, dragBounds.maxX);
          const finalY = clamp(positionRef.current.y, dragBounds.minY, dragBounds.maxY);

          setCurrentPos({ x: finalX, y: finalY });
          gestureModeRef.current = null;
          requestAnimationFrame(() => {
            pan.setOffset({ x: 0, y: 0 });
            pan.setValue({ x: 0, y: 0 });
            animateDropSequence(finalX, finalY);
          });
        },
      }),
    [
      isSelected,
      allowVisibleOverflowDrag,
      canvasWidth,
      canvasHeight,
      stickerSize,
      pageZoom,
      hitFrame,
      animateDropSequence,
      persistCurrentTransform,
      pan,
      rotate,
      scale,
      onTap,
      resetTemporaryStickerTransform,
    ]
  );

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-2, 0, 2],
    outputRange: ['-2deg', '0deg', '2deg'],
  });

  const shadowStyle = Platform.OS === 'ios' && isDragging ? styles.shadow : {};

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.draggableSticker,
        {
          left: currentPos.x + touchFrame.left,
          top: currentPos.y + touchFrame.top,
          width: touchFrame.width,
          height: touchFrame.height,
          zIndex: currentZIndex,
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { scale },
            { rotate: rotateInterpolate },
          ],
        },
        shadowStyle,
        isCommittingDrop && styles.stickerCommittingDrop,
      ]}
    >
      <CachedStickerImage
        uri={sticker.image_url}
        style={[
          styles.stickerImage,
          {
            left: -(stickerRenderSize - stickerSize) / 2 - touchFrame.left,
            top: -(stickerRenderSize - stickerSize) / 2 - touchFrame.top,
            width: stickerRenderSize,
            height: stickerRenderSize,
            transform: [
              { scale: displayScale * stickerRenderScale },
              { rotate: `${currentRotation}deg` },
            ],
          },
        ]}
        resizeMode="contain"
      />
      <Animated.View
        pointerEvents={isSelected ? 'auto' : 'none'}
        style={[
          styles.stickerHitArea,
          {
            left: hitFrame.left - touchFrame.left,
            top: hitFrame.top - touchFrame.top,
            width: hitFrame.width,
            height: hitFrame.height,
            transform: [{ rotate: `${currentRotation}deg` }],
          },
          isSelected && styles.stickerHitAreaSelected,
        ]}
        {...(isSelected ? panResponder.panHandlers : {})}
      />
    </Animated.View>
  );
}

export default function BookDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    bookId,
    bookName,
    pageIndex: routePageIndex,
    placedStickerId,
    refresh,
  } = useLocalSearchParams<{
    bookId: string;
    bookName?: string;
    pageIndex?: string;
    placedStickerId?: string;
    refresh?: string;
  }>();

  const initialPageIndex = routePageIndex !== undefined ? parseInt(routePageIndex, 10) : 0;
  const [currentPage, setCurrentPage] = useState(
    Number.isFinite(initialPageIndex) ? Math.max(0, Math.min(4, initialPageIndex)) : 0
  );
  const [pages, setPages] = useState<Pages>({});
  const [pageElements, setPageElements] = useState<ElementsByPage>({});
  const [loading, setLoading] = useState(true);
  const [loadingPageIndexes, setLoadingPageIndexes] = useState<Set<number>>(new Set());
  const [isArrangeMode, setIsArrangeMode] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [bookTheme, setBookTheme] = useState<CoverTheme>(DEFAULT_COVER_THEME);
  const [bookPageColor, setBookPageColor] = useState<string>(DEFAULT_ACCENT_COLOR);
  const [displayBookName, setDisplayBookName] = useState(bookName || 'Book');
  const [pageZoom, setPageZoom] = useState(1);
  const [pagePan, setPagePan] = useState({ x: 0, y: 0 });
  const [isStickerSelected, setIsStickerSelected] = useState(false);
  const [selectedCanvasItemType, setSelectedCanvasItemType] = useState<CanvasSelectionType>(null);
  const [selectionAction, setSelectionAction] = useState<SelectionAction | null>(null);
  const [clearSelectionNonce, setClearSelectionNonce] = useState(0);
  const [canvasScreenFrame, setCanvasScreenFrame] = useState<CanvasScreenFrame>(null);
  const [showMovePagePopup, setShowMovePagePopup] = useState(false);
  const [showSizePopup, setShowSizePopup] = useState(false);
  const [showTurnPopup, setShowTurnPopup] = useState(false);
  const [showLayerPopup, setShowLayerPopup] = useState(false);
  const [moveNotice, setMoveNotice] = useState<string | null>(null);

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showPageColorSheet, setShowPageColorSheet] = useState(false);
  const [showElementComposer, setShowElementComposer] = useState(false);
  const [pendingElementType, setPendingElementType] = useState<BookPageElementType>('note');
  const [elementDraft, setElementDraft] = useState('');
  const [elementDraftColor, setElementDraftColor] = useState<string>('#F7D3E1');
  const [editingElement, setEditingElement] = useState<BookPageElement | null>(null);
  const [showUnplacedPicker, setShowUnplacedPicker] = useState(false);
  const [unplacedStickers, setUnplacedStickers] = useState<Sticker[]>([]);
  const [loadingUnplaced, setLoadingUnplaced] = useState(false);
  const [newlyPlacedId, setNewlyPlacedId] = useState<string | null>(null);

  const swipeAnim = useRef(new Animated.Value(0)).current;
  const pageZoomAnim = useRef(new Animated.Value(1)).current;
  const pageZoomRef = useRef(1);
  const pinchStartDistanceRef = useRef(0);
  const pinchStartZoomRef = useRef(1);
  const pagePanXAnim = useRef(new Animated.Value(0)).current;
  const pagePanYAnim = useRef(new Animated.Value(0)).current;
  const pagePanRef = useRef({ x: 0, y: 0 });
  const canvasCaptureRef = useRef<View>(null);
  const pendingPhotoSaveAfterSettingsRef = useRef(false);
  const initialPageRef = useRef(currentPage);
  const loadedPagesRef = useRef(new Set<number>());
  const pageLoadPromisesRef = useRef(new Map<number, Promise<void>>());
  const pageMutationVersionsRef = useRef(new Map<number, number>());
  const currentBookRef = useRef<Book | null>(null);

  const clearCanvasSelection = useCallback(() => {
    setIsStickerSelected(false);
    setSelectedCanvasItemType(null);
    setSelectionAction(null);
    setShowMovePagePopup(false);
    setShowSizePopup(false);
    setShowTurnPopup(false);
    setShowLayerPopup(false);
    setClearSelectionNonce((value) => value + 1);
  }, []);

  const applyBookToState = useCallback((book: Book) => {
    currentBookRef.current = book;
    setBookTheme(book.theme || DEFAULT_COVER_THEME);
    setBookPageColor(normalizeAccentColor(book.page_color || book.accent_color || book.cover_color));
    setDisplayBookName(book.name || bookName || 'Book');
  }, [bookName]);

  const cachePageSnapshot = useCallback((
    pageIndex: number,
    stickers: Sticker[],
    elements: BookPageElement[]
  ) => {
    if (!bookId) return;
    setCachedBookPage(bookId, pageIndex, stickers, elements);
  }, [bookId]);

  const getPageMutationVersion = useCallback((pageIndex: number) => (
    pageMutationVersionsRef.current.get(pageIndex) ?? 0
  ), []);

  const markPageLocallyMutated = useCallback((pageIndex: number) => {
    pageMutationVersionsRef.current.set(pageIndex, getPageMutationVersion(pageIndex) + 1);
  }, [getPageMutationVersion]);

  const hydrateInitialPageFromCache = useCallback(async () => {
    if (!bookId) return false;

    const [cachedBook, cachedPage] = await Promise.all([
      getCachedBookDetail(bookId),
      getCachedBookPage(bookId, initialPageRef.current),
    ]);

    let didHydrate = false;

    if (cachedBook) {
      applyBookToState(cachedBook);
      didHydrate = true;
    }

    if (cachedPage) {
      setPages((prev) => ({ ...prev, [initialPageRef.current]: cachedPage.stickers }));
      setPageElements((prev) => ({ ...prev, [initialPageRef.current]: cachedPage.elements }));
      didHydrate = true;
    }

    if (didHydrate) {
      setLoading(false);
    }

    return didHydrate;
  }, [applyBookToState, bookId]);

  const loadPage = useCallback(async (pageIndex: number, force = false) => {
    if (!bookId) return;
    if (!force && loadedPagesRef.current.has(pageIndex)) return;

    const requestMutationVersion = getPageMutationVersion(pageIndex);

    const existingRequest = pageLoadPromisesRef.current.get(pageIndex);
    if (existingRequest) {
      await existingRequest;
      if (!force) return;
    }

    if (!force) {
      const cachedPage = await getCachedBookPage(bookId, pageIndex);
      if (cachedPage) {
        setPages((prev) => ({ ...prev, [pageIndex]: cachedPage.stickers }));
        setPageElements((prev) => ({ ...prev, [pageIndex]: cachedPage.elements }));
      }
    }

    setLoadingPageIndexes((prev) => new Set(prev).add(pageIndex));

    const request = (async () => {
      try {
        const [stickersResult, elementsResult] = await Promise.all([
          getStickersInBookByPage(bookId, pageIndex),
          getBookPageElementsByPage(bookId, pageIndex),
        ]);

        if (stickersResult.error) {
          throw stickersResult.error;
        }
        if (elementsResult.error) {
          throw elementsResult.error;
        }

        if (requestMutationVersion !== getPageMutationVersion(pageIndex)) {
          return;
        }

        setPages((prev) => ({ ...prev, [pageIndex]: stickersResult.stickers }));
        setPageElements((prev) => ({ ...prev, [pageIndex]: elementsResult.elements }));
        cachePageSnapshot(pageIndex, stickersResult.stickers, elementsResult.elements);
        loadedPagesRef.current.add(pageIndex);
      } catch (error) {
        console.error(`Error fetching page ${pageIndex + 1}:`, error);
      } finally {
        pageLoadPromisesRef.current.delete(pageIndex);
        setLoadingPageIndexes((prev) => {
          const next = new Set(prev);
          next.delete(pageIndex);
          return next;
        });
      }
    })();

    pageLoadPromisesRef.current.set(pageIndex, request);
    await request;
  }, [bookId, cachePageSnapshot, getPageMutationVersion]);

  const fetchInitialPage = useCallback(async () => {
    if (!bookId) return;

    try {
      await hydrateInitialPageFromCache();

      const [bookResult] = await Promise.all([
        getBookForDetail(bookId),
        loadPage(initialPageRef.current, true),
      ]);

      if (bookResult.book) {
        applyBookToState(bookResult.book);
        setCachedBookDetail(bookId, bookResult.book);
      }
    } catch (error) {
      console.error('Error fetching initial book page:', error);
    } finally {
      setLoading(false);
    }
  }, [applyBookToState, bookId, hydrateInitialPageFromCache, loadPage]);

  useEffect(() => {
    fetchInitialPage();
  }, [fetchInitialPage]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        clearCanvasSelection();
      };
    }, [clearCanvasSelection])
  );

  useEffect(() => {
    if (loading) return;
    loadPage(currentPage);
  }, [currentPage, loadPage, loading]);

  useEffect(() => {
    if (routePageIndex === undefined) return;
    const nextPage = parseInt(routePageIndex, 10);
    if (!Number.isFinite(nextPage)) return;
    setCurrentPage(Math.max(0, Math.min(4, nextPage)));
  }, [routePageIndex, refresh]);

  useEffect(() => {
    if (!refresh) return;
    loadPage(currentPage, true);
    if (placedStickerId) {
      setNewlyPlacedId(placedStickerId);
      setTimeout(() => setNewlyPlacedId(null), 700);
    }
  }, [currentPage, loadPage, placedStickerId, refresh]);

  const goToPage = useCallback((page: number) => {
    if (page < 0 || page > 4) return;
    Haptics.selectionAsync();
    clearCanvasSelection();
    setCurrentPage(page);
    setIsArrangeMode(false);
    pagePanRef.current = { x: 0, y: 0 };
    pageZoomRef.current = 1;
    setPageZoom(1);
    setPagePan({ x: 0, y: 0 });
    pageZoomAnim.setValue(1);
    pagePanXAnim.setValue(0);
    pagePanYAnim.setValue(0);
    Animated.spring(swipeAnim, {
      toValue: 0,
      stiffness: 180,
      damping: 20,
      useNativeDriver: true,
    }).start();
  }, [clearCanvasSelection, swipeAnim, pageZoomAnim, pagePanXAnim, pagePanYAnim]);

  const clampPagePan = useCallback((x: number, y: number, zoom = pageZoomRef.current) => {
    const maxX = Math.max(0, (canvasSize.width * (zoom - 1)) / 2);
    const maxY = Math.max(0, (canvasSize.height * (zoom - 1)) / 2);

    return {
      x: clamp(x, -maxX, maxX),
      y: clamp(y, -maxY, maxY),
    };
  }, [canvasSize.width, canvasSize.height]);

  const pagePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (isStickerSelected) return false;
          if (isArrangeMode) return false;

          if (pageZoomRef.current > 1.04) {
            return Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
          }

          const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
          return isHorizontal && Math.abs(gestureState.dx) > 10;
        },
        onPanResponderMove: (_, gestureState) => {
          if (pageZoomRef.current > 1.04) {
            const nextPan = clampPagePan(
              pagePanRef.current.x + gestureState.dx,
              pagePanRef.current.y + gestureState.dy
            );
            setPagePan(nextPan);
            pagePanXAnim.setValue(nextPan.x);
            pagePanYAnim.setValue(nextPan.y);
            return;
          }

          swipeAnim.setValue(gestureState.dx);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (pageZoomRef.current > 1.04) {
            const nextPan = clampPagePan(
              pagePanRef.current.x + gestureState.dx,
              pagePanRef.current.y + gestureState.dy
            );
            pagePanRef.current = nextPan;
            setPagePan(nextPan);
            Animated.parallel([
              Animated.spring(pagePanXAnim, {
                toValue: nextPan.x,
                stiffness: 220,
                damping: 24,
                useNativeDriver: true,
              }),
              Animated.spring(pagePanYAnim, {
                toValue: nextPan.y,
                stiffness: 220,
                damping: 24,
                useNativeDriver: true,
              }),
            ]).start();
            return;
          }

          const shouldGoNext = gestureState.vx < -VELOCITY_THRESHOLD / 1000 || gestureState.dx < -SWIPE_THRESHOLD;
          const shouldGoPrev = gestureState.vx > VELOCITY_THRESHOLD / 1000 || gestureState.dx > SWIPE_THRESHOLD;

          if (shouldGoNext && currentPage < 4) {
            goToPage(currentPage + 1);
          } else if (shouldGoPrev && currentPage > 0) {
            goToPage(currentPage - 1);
          } else {
            Animated.spring(swipeAnim, {
              toValue: 0,
              stiffness: 180,
              damping: 20,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [isStickerSelected, isArrangeMode, currentPage, goToPage, swipeAnim, clampPagePan, pagePanXAnim, pagePanYAnim]
  );

  const pinchZoomResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) => !isStickerSelected && event.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponder: (event) => !isStickerSelected && event.nativeEvent.touches.length >= 2,
        onPanResponderGrant: (event) => {
          pinchStartDistanceRef.current = getTouchDistance(event.nativeEvent.touches);
          pinchStartZoomRef.current = pageZoomRef.current;
        },
        onPanResponderMove: (event) => {
          const distance = getTouchDistance(event.nativeEvent.touches);
          if (pinchStartDistanceRef.current <= 0 || distance <= 0) return;

          const nextZoom = clamp(
            pinchStartZoomRef.current * (distance / pinchStartDistanceRef.current),
            MIN_PAGE_ZOOM,
            MAX_PAGE_ZOOM
          );
          const nextPan = clampPagePan(pagePanRef.current.x, pagePanRef.current.y, nextZoom);
          pageZoomRef.current = nextZoom;
          setPageZoom(nextZoom);
          pagePanRef.current = nextPan;
          setPagePan(nextPan);
          pageZoomAnim.setValue(nextZoom);
          pagePanXAnim.setValue(nextPan.x);
          pagePanYAnim.setValue(nextPan.y);
        },
        onPanResponderRelease: () => {
          if (pageZoomRef.current < 1.04) {
            pageZoomRef.current = 1;
            setPageZoom(1);
            pagePanRef.current = { x: 0, y: 0 };
            setPagePan({ x: 0, y: 0 });
            Animated.parallel([
              Animated.spring(pageZoomAnim, {
                toValue: 1,
                stiffness: 180,
                damping: 20,
                useNativeDriver: true,
              }),
              Animated.spring(pagePanXAnim, {
                toValue: 0,
                stiffness: 180,
                damping: 20,
                useNativeDriver: true,
              }),
              Animated.spring(pagePanYAnim, {
                toValue: 0,
                stiffness: 180,
                damping: 20,
                useNativeDriver: true,
              }),
            ]).start();
          }
        },
      }),
    [isStickerSelected, pageZoomAnim, pagePanXAnim, pagePanYAnim, clampPagePan]
  );

  const handleStickerTransform = useCallback((id: string, pos_x: number, pos_y: number, rotation: number, bookScale: number) => {
    setPages((prev) => {
      const newPages = { ...prev };
      const pageStickers = newPages[currentPage] || [];
      const movedSticker = pageStickers.find((s) => s.id === id);
      if (!movedSticker) return prev;

      newPages[currentPage] = [
        ...pageStickers.filter((s) => s.id !== id),
        { ...movedSticker, pos_x, pos_y, rotation, metadata: { ...(movedSticker.metadata || {}), bookScale } },
      ];
      cachePageSnapshot(currentPage, newPages[currentPage], pageElements[currentPage] || []);
      return newPages;
    });
  }, [cachePageSnapshot, currentPage, pageElements]);

  const handleStickerMoveToPage = useCallback(async (
    id: string,
    targetPage: number,
    pos_x: number,
    pos_y: number,
    rotation: number,
    bookScale: number
  ) => {
    if (targetPage < 0 || targetPage > 4 || targetPage === currentPage) return;

    const sourceSticker = (pages[currentPage] || []).find((sticker) => sticker.id === id);
    if (!sourceSticker) return;

    const nextPosX = clamp(pos_x, 0.08, 0.92);
    const nextPosY = clamp(pos_y, 0.08, 0.92);
    const movedSticker: Sticker = {
      ...sourceSticker,
      page_index: targetPage,
      pos_x: nextPosX,
      pos_y: nextPosY,
      rotation,
      metadata: { ...(sourceSticker.metadata || {}), bookScale },
    };

    markPageLocallyMutated(currentPage);
    markPageLocallyMutated(targetPage);
    setPages((prev) => {
      const next = { ...prev };
      next[currentPage] = (next[currentPage] || []).filter((sticker) => sticker.id !== id);
      next[targetPage] = [...(next[targetPage] || []), movedSticker];
      cachePageSnapshot(currentPage, next[currentPage], pageElements[currentPage] || []);
      if (loadedPagesRef.current.has(targetPage)) {
        cachePageSnapshot(targetPage, next[targetPage], pageElements[targetPage] || []);
      }
      return next;
    });
    setIsStickerSelected(false);
    setSelectedCanvasItemType(null);

    const { error } = await updateStickerBookPageTransform(id, {
      bookId,
      page_index: targetPage,
      pos_x: nextPosX,
      pos_y: nextPosY,
      rotation,
      bookScale,
    });

    if (error) {
      console.error('Error moving sticker to page:', error);
      await Promise.all([loadPage(currentPage, true), loadPage(targetPage, true)]);
    } else {
      await Promise.all([loadPage(currentPage, true), loadPage(targetPage, true)]);
    }
  }, [cachePageSnapshot, currentPage, loadPage, markPageLocallyMutated, pageElements, pages]);

  const handleStickerLayerChange = useCallback((id: string, direction: 'up' | 'down') => {
    if (!bookId) return;

    markPageLocallyMutated(currentPage);
    setPages((prev) => {
      const currentStickers = sortByLayerOrder(prev[currentPage] || []);
      const movedStickers = reorderLayerItems(currentStickers, id, direction);
      if (movedStickers === currentStickers) return prev;

      const reordered = movedStickers.map((sticker, index) => ({
        ...sticker,
        metadata: {
          ...(sticker.metadata || {}),
          layerOrder: layerOrderForIndex(index),
        },
      }));

      const next = { ...prev, [currentPage]: reordered };
      cachePageSnapshot(currentPage, reordered, pageElements[currentPage] || []);

      Promise.all(
        reordered.map((sticker) =>
          updateStickerBookMetadata(sticker.id, bookId, sticker.metadata || {})
        )
      ).catch((error) => {
        console.warn('Failed to save sticker layer order:', error);
      });

      return next;
    });
  }, [bookId, cachePageSnapshot, currentPage, markPageLocallyMutated, pageElements]);

  const handleElementMove = useCallback((id: string, pos_x: number, pos_y: number, rotation: number, scale: number) => {
    setPageElements((prev) => {
      const next = { ...prev };
      const elements = next[currentPage] || [];
      next[currentPage] = elements.map((element) =>
        element.id === id
          ? { ...element, pos_x, pos_y, rotation, style: { ...(element.style || {}), scale } }
          : element
      );
      cachePageSnapshot(currentPage, pages[currentPage] || [], next[currentPage]);
      return next;
    });
  }, [cachePageSnapshot, currentPage, pages]);

  const handleElementMoveToPage = useCallback(async (
    id: string,
    targetPage: number,
    pos_x: number,
    pos_y: number,
    rotation: number,
    scale: number
  ) => {
    if (targetPage < 0 || targetPage > 4 || targetPage === currentPage) return;

    const sourceElement = (pageElements[currentPage] || []).find((element) => element.id === id);
    if (!sourceElement) return;

    const nextPosX = clamp(pos_x, 0.08, 0.92);
    const nextPosY = clamp(pos_y, 0.08, 0.92);
    const movedElement: BookPageElement = {
      ...sourceElement,
      page_index: targetPage,
      pos_x: nextPosX,
      pos_y: nextPosY,
      rotation,
      style: { ...(sourceElement.style || {}), scale },
    };

    markPageLocallyMutated(currentPage);
    markPageLocallyMutated(targetPage);
    setPageElements((prev) => {
      const next = { ...prev };
      next[currentPage] = (next[currentPage] || []).filter((element) => element.id !== id);
      next[targetPage] = [...(next[targetPage] || []), movedElement];
      cachePageSnapshot(currentPage, pages[currentPage] || [], next[currentPage]);
      if (loadedPagesRef.current.has(targetPage)) {
        cachePageSnapshot(targetPage, pages[targetPage] || [], next[targetPage]);
      }
      return next;
    });
    setIsStickerSelected(false);
    setSelectedCanvasItemType(null);

    const { error } = await updateBookPageElementLayout(id, {
      bookId,
      page_index: targetPage,
      pos_x: nextPosX,
      pos_y: nextPosY,
      rotation,
      scale,
    });

    if (error) {
      console.error('Error moving page element to page:', error);
      await Promise.all([loadPage(currentPage, true), loadPage(targetPage, true)]);
    } else {
      await Promise.all([loadPage(currentPage, true), loadPage(targetPage, true)]);
    }
  }, [cachePageSnapshot, currentPage, loadPage, markPageLocallyMutated, pageElements, pages]);

  const handleElementLayerChange = useCallback((id: string, direction: 'up' | 'down') => {
    if (!bookId) return;

    markPageLocallyMutated(currentPage);
    setPageElements((prev) => {
      const currentElements = sortByLayerOrder(prev[currentPage] || []);
      const movedElements = reorderLayerItems(currentElements, id, direction);
      if (movedElements === currentElements) return prev;

      const reordered = movedElements.map((element, index) => ({
        ...element,
        style: {
          ...(element.style || {}),
          layerOrder: layerOrderForIndex(index),
        },
      }));

      const next = { ...prev, [currentPage]: reordered };
      cachePageSnapshot(currentPage, pages[currentPage] || [], reordered);

      Promise.all(
        reordered.map((element) =>
          updateBookPageElementStyle(element.id, bookId, element.style || {})
        )
      ).catch((error) => {
        console.warn('Failed to save element layer order:', error);
      });

      return next;
    });
  }, [bookId, cachePageSnapshot, currentPage, markPageLocallyMutated, pages]);

  const handleElementDelete = useCallback(async (id: string) => {
    await deleteBookPageElement(id);
    setPageElements((prev) => {
      const next = { ...prev };
      next[currentPage] = (next[currentPage] || []).filter((element) => element.id !== id);
      cachePageSnapshot(currentPage, pages[currentPage] || [], next[currentPage]);
      return next;
    });
    setIsStickerSelected(false);
    setSelectedCanvasItemType(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [cachePageSnapshot, currentPage, pages]);

  const handleStickerPeelOff = useCallback(async (id: string) => {
    await removeStickerFromPage(id);
    setPages((prev) => {
      const newPages = { ...prev };
      const pageStickers = newPages[currentPage] || [];
      newPages[currentPage] = pageStickers.filter((s) => s.id !== id);
      cachePageSnapshot(currentPage, newPages[currentPage], pageElements[currentPage] || []);
      return newPages;
    });
    setIsStickerSelected(false);
    setSelectedCanvasItemType(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [cachePageSnapshot, currentPage, pageElements]);

  const handleCanvasLayout = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    setCanvasSize({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    });
    requestAnimationFrame(() => {
      canvasCaptureRef.current?.measureInWindow((x, y, width, height) => {
        setCanvasScreenFrame({ x, y, width, height });
      });
    });
  }, []);

  const handleAddButtonPress = useCallback(() => {
    setShowAddSheet(true);
  }, []);

  const handleSnapPress = useCallback(() => {
    setShowAddSheet(false);
    router.push(`/snap?bookId=${bookId}&pageIndex=${currentPage}`);
  }, [router, bookId, currentPage]);

  const handleFromCollectionPress = useCallback(async () => {
    setShowAddSheet(false);
    setLoadingUnplaced(true);
    setShowUnplacedPicker(true);

    const { stickers } = await getUnplacedStickers();
    setUnplacedStickers(stickers);
    setLoadingUnplaced(false);
  }, []);

  const openElementComposer = useCallback((type: BookPageElementType) => {
    const defaults: Record<BookPageElementType, string> = {
      note: 'Coffee,\nsunlight,\ngood music',
      text: 'Sunny day ♡',
      stamp: '♡',
    };
    const palette: Record<BookPageElementType, string> = {
      note: '#F7D3E1',
      text: '#8B6FEF',
      stamp: '#B994FF',
    };
    setEditingElement(null);
    setPendingElementType(type);
    setElementDraft(defaults[type]);
    setElementDraftColor(palette[type]);
    setShowElementComposer(true);
  }, []);

  const handleEditElementRequest = useCallback((element: BookPageElement) => {
    setEditingElement(element);
    setPendingElementType(element.type);
    setElementDraft(element.content);
    setElementDraftColor(element.color || (element.type === 'note' ? '#F7D3E1' : element.type === 'text' ? '#8B6FEF' : '#B994FF'));
    setShowElementComposer(true);
  }, []);

  const handleSaveElement = useCallback(async () => {
    if (!bookId || !elementDraft.trim()) return;

    if (editingElement) {
      const nextContent = elementDraft.trim();
      const nextColor = elementDraftColor;
      const nextStyle = editingElement.type === 'text' ? getTextElementSize(nextContent) : undefined;
      const { error } = await updateBookPageElementContent(editingElement.id, {
        content: nextContent,
        color: nextColor,
        style: nextStyle,
      });

      if (error) {
        console.error('Error updating page element:', error);
        return;
      }

      setPageElements((prev) => {
        const next = { ...prev };
        next[editingElement.page_index] = (next[editingElement.page_index] || []).map((element) =>
          element.id === editingElement.id
            ? { ...element, content: nextContent, color: nextColor, style: nextStyle ? { ...(element.style || {}), ...nextStyle } : element.style }
            : element
        );
        cachePageSnapshot(editingElement.page_index, pages[editingElement.page_index] || [], next[editingElement.page_index]);
        return next;
      });
      setShowElementComposer(false);
      setEditingElement(null);
      setElementDraft('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    const { element, error } = await createBookPageElement({
      bookId,
      pageIndex: currentPage,
      type: pendingElementType,
      content: elementDraft.trim(),
      pos_x: pendingElementType === 'text' ? 0.64 : 0.26,
      pos_y: pendingElementType === 'stamp' ? 0.32 : 0.22,
      rotation: pendingElementType === 'note' ? -4 : pendingElementType === 'stamp' ? 12 : -5,
      color: elementDraftColor,
      style: pendingElementType === 'text' ? getTextElementSize(elementDraft.trim()) : undefined,
    });

    if (error || !element) {
      console.error('Error creating page element:', error);
      return;
    }

    setPageElements((prev) => {
      const next = {
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), element],
      };
      cachePageSnapshot(currentPage, pages[currentPage] || [], next[currentPage]);
      return next;
    });
    setShowElementComposer(false);
    setEditingElement(null);
    setElementDraft('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [bookId, cachePageSnapshot, currentPage, editingElement, elementDraft, elementDraftColor, pages, pendingElementType]);

  const handleSelectUnplacedSticker = useCallback(async (sticker: Sticker) => {
    if (!bookId) return;

    const pos_x = randomBetween(0.2, 0.8);
    const pos_y = randomBetween(0.2, 0.8);
    const rotation = randomBetween(-15, 15);

    await placeStickerInBook(sticker.id, bookId, currentPage, pos_x, pos_y, rotation);

    const placedSticker: Sticker = {
      ...sticker,
      book_id: bookId,
      page_index: currentPage,
      pos_x,
      pos_y,
      rotation,
    };

    setPages((prev) => {
      const newPages = { ...prev };
      const pageStickers = newPages[currentPage] || [];
      newPages[currentPage] = [...pageStickers, placedSticker];
      cachePageSnapshot(currentPage, newPages[currentPage], pageElements[currentPage] || []);
      return newPages;
    });

    setNewlyPlacedId(sticker.id);
    setTimeout(() => setNewlyPlacedId(null), 500);

    setUnplacedStickers((prev) => prev.filter((item) => item.id !== sticker.id));
    setShowUnplacedPicker(false);
  }, [bookId, cachePageSnapshot, currentPage, pageElements]);

  const handleSnapNowFromPicker = useCallback(() => {
    setShowUnplacedPicker(false);
    router.push(`/snap?bookId=${bookId}&pageIndex=${currentPage}`);
  }, [router, bookId, currentPage]);

  const handleShareToX = useCallback(async () => {
    const message = `Peelzyで「${displayBookName || 'Book'}」のページを作りました`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(url);

    if (canOpen) {
      await Linking.openURL(url);
      return;
    }

    await Share.share({ message });
  }, [displayBookName]);

  const savePageImageToLibrary = useCallback(async () => {
    if (!canvasCaptureRef.current) {
      Alert.alert('Page image unavailable', 'The page image could not be prepared.');
      return;
    }

    const uri = await captureRef(canvasCaptureRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });

    await MediaLibrary.saveToLibraryAsync(uri);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Saved', 'The page image was saved to your photo library.');
  }, []);

  const handleSavePageImage = useCallback(async () => {
    try {
      let permission = await MediaLibrary.getPermissionsAsync(true);
      if (!permission.granted && permission.canAskAgain) {
        permission = await MediaLibrary.requestPermissionsAsync(true);
      }

      if (!permission.granted) {
        Alert.alert(
          'Photo access needed',
          'Allow Peelzy to save images to your photo library, then come back here.',
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                pendingPhotoSaveAfterSettingsRef.current = true;
                Linking.openSettings();
              },
            },
          ]
        );
        return;
      }

      await savePageImageToLibrary();
    } catch (error) {
      console.error('Error saving page image:', error);
      Alert.alert('Save failed', 'The page image could not be saved.');
    }
  }, [savePageImageToLibrary]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') {
        clearCanvasSelection();
      }

      if (state !== 'active' || !pendingPhotoSaveAfterSettingsRef.current) return;

      const permission = await MediaLibrary.getPermissionsAsync(true);
      if (!permission.granted) return;

      pendingPhotoSaveAfterSettingsRef.current = false;
      savePageImageToLibrary().catch((error) => {
        console.error('Error saving page image after settings:', error);
        Alert.alert('Save failed', 'The page image could not be saved.');
      });
    });

    return () => subscription.remove();
  }, [clearCanvasSelection, savePageImageToLibrary]);

  const handleSharePress = useCallback(() => {
    setShowShareSheet(true);
  }, []);

  const handlePageColorSelect = useCallback(async (color: string) => {
    if (!bookId) return;

    const previousColor = bookPageColor;
    setBookPageColor(color);
    setShowPageColorSheet(false);

    const { error } = await updateBookPageColor(bookId, color);
    if (error) {
      console.error('Error updating book page color:', error);
      setBookPageColor(previousColor);
      Alert.alert('Error', 'Failed to update the page color.');
      return;
    }

    if (currentBookRef.current) {
      const nextBook = { ...currentBookRef.current, page_color: color };
      currentBookRef.current = nextBook;
      setCachedBookDetail(bookId, nextBook);
    }
  }, [bookId, bookPageColor]);

  const requestStickerSelectionAction = useCallback((type: SelectionAction['type'], targetPage?: number) => {
    setSelectionAction({ type, targetPage, nonce: Date.now() });
  }, []);

  const closeSelectionPopups = useCallback(() => {
    setShowMovePagePopup(false);
    setShowSizePopup(false);
    setShowTurnPopup(false);
    setShowLayerPopup(false);
  }, []);

  useEffect(() => {
    if (!isStickerSelected) {
      closeSelectionPopups();
    }
  }, [closeSelectionPopups, isStickerSelected]);

  const toggleMovePagePopup = useCallback(() => {
    setShowSizePopup(false);
    setShowTurnPopup(false);
    setShowLayerPopup(false);
    setShowMovePagePopup((visible) => !visible);
  }, []);

  const toggleSizePopup = useCallback(() => {
    setShowMovePagePopup(false);
    setShowTurnPopup(false);
    setShowLayerPopup(false);
    setShowSizePopup((visible) => !visible);
  }, []);

  const toggleTurnPopup = useCallback(() => {
    setShowMovePagePopup(false);
    setShowSizePopup(false);
    setShowLayerPopup(false);
    setShowTurnPopup((visible) => !visible);
  }, []);

  const toggleLayerPopup = useCallback(() => {
    setShowMovePagePopup(false);
    setShowSizePopup(false);
    setShowTurnPopup(false);
    setShowLayerPopup((visible) => !visible);
  }, []);

  const handleMoveToPagePress = useCallback((targetPage: number) => {
    if (targetPage === currentPage) return;

    closeSelectionPopups();
    setMoveNotice(`Moved to Page ${targetPage + 1}`);
    requestStickerSelectionAction('moveToPage', targetPage);
    Haptics.selectionAsync();

    setTimeout(() => {
      setMoveNotice(null);
    }, 1500);
  }, [closeSelectionPopups, currentPage, requestStickerSelectionAction]);

  const renderPageIndicator = () => {
    return (
      <View style={styles.indicatorContainer}>
        <Text style={styles.pageCounter}>{currentPage + 1} / 5</Text>
        <View style={styles.dotsContainer}>
          {Array.from({ length: 5 }, (_, index) => {
            const isActive = index === currentPage;
            return (
              <View
                key={index}
                style={[
                  styles.dot,
                  isActive ? styles.dotActive : styles.dotInactive,
                ]}
              />
            );
          })}
        </View>
      </View>
    );
  };

  const renderCanvas = () => {
    const stickers = sortByLayerOrder(pages[currentPage] || []);
    const elements = sortByLayerOrder(pageElements[currentPage] || []);
    const footerClearance = TAB_BAR_HEIGHT + insets.bottom;
    const pageTilt = swipeAnim.interpolate({
      inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      outputRange: ['-8deg', '0deg', '8deg'],
      extrapolate: 'clamp',
    });
    const pageScale = swipeAnim.interpolate({
      inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
      outputRange: [0.96, 1, 0.96],
      extrapolate: 'clamp',
    });

    return (
      <View
        style={[styles.canvasContainer, { paddingBottom: footerClearance + 104 }]}
      >
        {currentPage > 0 && !isArrangeMode && !isStickerSelected && (
          <TouchableOpacity
            style={[styles.arrowButton, styles.arrowLeft]}
            onPress={() => goToPage(currentPage - 1)}
          >
            <Text style={styles.arrowText}>{'<'}</Text>
          </TouchableOpacity>
        )}

        <Animated.View
          ref={canvasCaptureRef}
          collapsable={false}
          style={[
            styles.canvas,
            bookTheme !== 'film' && { backgroundColor: bookPageColor },
            bookTheme === 'brutalist' && styles.canvasBrutalist,
            bookTheme === 'film' && styles.canvasFilm,
            pageZoom > 1.01 && styles.canvasZooming,
            {
              transform: [
                { perspective: 900 },
                { translateX: swipeAnim },
                { rotateY: pageTilt },
                { scale: pageScale },
              ],
            },
          ]}
          onLayout={handleCanvasLayout}
          {...(isStickerSelected ? {} : pagePanResponder.panHandlers)}
        >
          {canvasSize.width > 0 && (
            <PageCanvas
              stickers={stickers}
              elements={elements}
              isArranging={isArrangeMode}
              onStickerTransform={handleStickerTransform}
              onStickerMoveToPage={handleStickerMoveToPage}
              onStickerLayerChange={handleStickerLayerChange}
              onStickerPeelOff={handleStickerPeelOff}
              onElementMove={handleElementMove}
              onElementMoveToPage={handleElementMoveToPage}
              onElementLayerChange={handleElementLayerChange}
              onElementDelete={handleElementDelete}
              onElementEditRequest={handleEditElementRequest}
              onEmptyPress={handleAddButtonPress}
              onStickerSelectionChange={setIsStickerSelected}
              onSelectionTypeChange={setSelectedCanvasItemType}
              selectionAction={selectionAction}
              onSelectionActionHandled={() => setSelectionAction(null)}
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
              pageZoom={pageZoom}
              pagePanX={pagePan.x}
              pagePanY={pagePan.y}
              canvasScreenFrame={canvasScreenFrame}
              currentPage={currentPage}
              clearSelectionNonce={clearSelectionNonce}
              newlyPlacedId={newlyPlacedId}
              pageTheme={bookTheme}
              accentColor={bookPageColor}
            />
          )}
        </Animated.View>

        {loadingPageIndexes.has(currentPage) && (
          <View pointerEvents="none" style={styles.pageLoadingOverlay}>
            <ActivityIndicator size="small" color={theme.colors.purple} />
          </View>
        )}

        {currentPage < 4 && !isArrangeMode && !isStickerSelected && (
          <TouchableOpacity
            style={[styles.arrowButton, styles.arrowRight]}
            onPress={() => goToPage(currentPage + 1)}
          >
            <Text style={styles.arrowText}>{'>'}</Text>
          </TouchableOpacity>
        )}

      </View>
    );
  };

  const renderUnplacedItem = ({ item }: { item: Sticker }) => (
    <TouchableOpacity
      style={styles.pickerItem}
      onPress={() => handleSelectUnplacedSticker(item)}
      activeOpacity={0.7}
    >
      <CachedStickerImage
        uri={item.thumbnail_url || item.image_url}
        style={styles.pickerItemImage}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#A78BFA" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerIconButton} onPress={() => router.back()}>
          <Text style={styles.headerIconText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {displayBookName || 'Book'}
          </Text>
          {renderPageIndicator()}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerIconButton} onPress={handleSharePress}>
            <Text style={styles.headerActionText}>⇧</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={() => setShowPageColorSheet(true)}
          >
            <Text style={styles.headerActionText}>…</Text>
          </TouchableOpacity>
        </View>
      </View>

      {renderCanvas()}

      {(showMovePagePopup || showSizePopup || showTurnPopup || showLayerPopup) && (
        <TouchableOpacity
          style={styles.movePopupDismissLayer}
          activeOpacity={1}
          onPress={closeSelectionPopups}
        />
      )}

      {moveNotice && (
        <View pointerEvents="none" style={[styles.moveNotice, { bottom: TAB_BAR_HEIGHT + insets.bottom + 104 }]}>
          <Text style={styles.moveNoticeText}>{moveNotice}</Text>
        </View>
      )}

      {isStickerSelected ? (
        <>
          {showSizePopup && (
            <View style={[styles.selectionActionPopup, { bottom: TAB_BAR_HEIGHT + insets.bottom + 94 }]}>
              <TouchableOpacity
                style={styles.selectionActionPopupButton}
                onPress={() => requestStickerSelectionAction('scaleDown')}
                activeOpacity={0.78}
              >
                <Text style={styles.selectionActionPopupIcon}>−</Text>
              </TouchableOpacity>
              <Text style={styles.selectionActionPopupLabel}>Size</Text>
              <TouchableOpacity
                style={styles.selectionActionPopupButton}
                onPress={() => requestStickerSelectionAction('scaleUp')}
                activeOpacity={0.78}
              >
                <Text style={styles.selectionActionPopupIcon}>＋</Text>
              </TouchableOpacity>
            </View>
          )}

          {showTurnPopup && (
            <View style={[styles.selectionActionPopup, { bottom: TAB_BAR_HEIGHT + insets.bottom + 94 }]}>
              <TouchableOpacity
                style={styles.selectionActionPopupButton}
                onPress={() => requestStickerSelectionAction('rotateLeft')}
                activeOpacity={0.78}
              >
                <Text style={styles.selectionActionPopupIcon}>↺</Text>
              </TouchableOpacity>
              <Text style={styles.selectionActionPopupLabel}>Turn</Text>
              <TouchableOpacity
                style={styles.selectionActionPopupButton}
                onPress={() => requestStickerSelectionAction('rotateRight')}
                activeOpacity={0.78}
              >
                <Text style={styles.selectionActionPopupIcon}>↻</Text>
              </TouchableOpacity>
            </View>
          )}

          {showLayerPopup && (
            <View style={[styles.selectionActionPopup, { bottom: TAB_BAR_HEIGHT + insets.bottom + 94 }]}>
              <TouchableOpacity
                style={styles.selectionActionPopupButton}
                onPress={() => requestStickerSelectionAction('layerDown')}
                activeOpacity={0.78}
              >
                <Text style={styles.selectionActionPopupIcon}>↓</Text>
              </TouchableOpacity>
              <Text style={styles.selectionActionPopupLabel}>Layer</Text>
              <TouchableOpacity
                style={styles.selectionActionPopupButton}
                onPress={() => requestStickerSelectionAction('layerUp')}
                activeOpacity={0.78}
              >
                <Text style={styles.selectionActionPopupIcon}>↑</Text>
              </TouchableOpacity>
            </View>
          )}

          {showMovePagePopup && (
            <View style={[styles.movePagePopup, { bottom: TAB_BAR_HEIGHT + insets.bottom + 94 }]}>
              {Array.from({ length: 5 }, (_, page) => {
                const isCurrent = page === currentPage;
                return (
                  <TouchableOpacity
                    key={page}
                    style={[
                      styles.movePageButton,
                      isCurrent && styles.movePageButtonDisabled,
                    ]}
                    onPress={() => handleMoveToPagePress(page)}
                    disabled={isCurrent}
                    activeOpacity={0.78}
                  >
                    <Text style={[
                      styles.movePageButtonText,
                      isCurrent && styles.movePageButtonTextDisabled,
                    ]}>
                      Page {page + 1}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <View style={[styles.selectionToolDock, { bottom: TAB_BAR_HEIGHT + insets.bottom + 24 }]}>
            <TouchableOpacity style={styles.selectionIconButton} onPress={() => requestStickerSelectionAction('done')}>
              <Text style={styles.selectionToolIcon}>✓</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.selectionMoveButton, showSizePopup && styles.selectionMoveButtonActive]}
              onPress={toggleSizePopup}
            >
              <Text style={[styles.selectionMoveText, showSizePopup && styles.selectionMoveTextActive]}>Size</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.selectionMoveButton, showTurnPopup && styles.selectionMoveButtonActive]}
              onPress={toggleTurnPopup}
            >
              <Text style={[styles.selectionMoveText, showTurnPopup && styles.selectionMoveTextActive]}>Turn</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.selectionMoveButton, showLayerPopup && styles.selectionMoveButtonActive]}
              onPress={toggleLayerPopup}
            >
              <Text style={[styles.selectionMoveText, showLayerPopup && styles.selectionMoveTextActive]}>Layer</Text>
            </TouchableOpacity>

            {selectedCanvasItemType === 'element' && (
              <TouchableOpacity style={styles.selectionIconButton} onPress={() => requestStickerSelectionAction('edit')}>
                <Text style={styles.selectionEditText}>Aa</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.selectionMoveButton, showMovePagePopup && styles.selectionMoveButtonActive]}
              onPress={toggleMovePagePopup}
            >
              <Text style={[styles.selectionMoveText, showMovePagePopup && styles.selectionMoveTextActive]}>Move</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.selectionIconButton, styles.selectionToolDangerButton]}
              onPress={() => requestStickerSelectionAction(selectedCanvasItemType === 'element' ? 'delete' : 'peel')}
            >
              <Text style={[styles.selectionToolIcon, styles.selectionToolDangerIcon]}>
                {selectedCanvasItemType === 'element' ? '🗑' : '↯'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={[styles.toolDock, { bottom: TAB_BAR_HEIGHT + insets.bottom + 24 }]}>
          <TouchableOpacity style={styles.toolButton} onPress={handleAddButtonPress}>
            <Text style={styles.toolIcon}>+</Text>
            <Text style={styles.toolLabel}>Sticker</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolButton} onPress={() => openElementComposer('note')}>
            <Text style={styles.toolIcon}>▤</Text>
            <Text style={styles.toolLabel}>Note</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolButton} onPress={() => openElementComposer('text')}>
            <Text style={styles.toolIcon}>Aa</Text>
            <Text style={styles.toolLabel}>Text</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolButton} onPress={() => openElementComposer('stamp')}>
            <Text style={styles.toolIcon}>♡</Text>
            <Text style={styles.toolLabel}>Stamp</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={showShareSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowShareSheet(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowShareSheet(false)}
        >
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Share page</Text>

            <TouchableOpacity
              style={styles.sheetButton}
              onPress={() => {
                setShowShareSheet(false);
                handleShareToX();
              }}
            >
              <Text style={styles.sheetButtonIcon}>X</Text>
              <Text style={styles.sheetButtonText}>Share on X</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetButton}
              onPress={() => {
                setShowShareSheet(false);
                handleSavePageImage();
              }}
            >
              <Text style={styles.sheetButtonIcon}>↓</Text>
              <Text style={styles.sheetButtonTextPurple}>Save page image</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancelButton}
              onPress={() => setShowShareSheet(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showPageColorSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPageColorSheet(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowPageColorSheet(false)}
        >
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Page color</Text>
            <View style={styles.pageColorGrid}>
              {PEELZY_COLORS.map((color) => {
                const isActive = normalizeAccentColor(bookPageColor) === color;
                return (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.pageColorChoice,
                      { backgroundColor: color },
                      isActive && styles.pageColorChoiceActive,
                    ]}
                    onPress={() => handlePageColorSelect(color)}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityLabel={`Change page color to ${color}`}
                  />
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.sheetCancelButton}
              onPress={() => setShowPageColorSheet(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Options BottomSheet */}
      <Modal
        visible={showAddSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddSheet(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowAddSheet(false)}
        >
          <View style={styles.bottomSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add to this page</Text>

            <TouchableOpacity style={styles.sheetButton} onPress={handleSnapPress}>
              <Text style={styles.sheetButtonIcon}>📷</Text>
              <Text style={styles.sheetButtonText}>Snap a new one</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetButton} onPress={handleFromCollectionPress}>
              <Text style={styles.sheetButtonIcon}>✦</Text>
              <Text style={styles.sheetButtonTextPurple}>From my collection</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancelButton}
              onPress={() => setShowAddSheet(false)}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showElementComposer}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowElementComposer(false);
          setEditingElement(null);
        }}
      >
        <KeyboardAvoidingView
          style={styles.composerKeyboardAvoiding}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <TouchableOpacity
            style={[
              styles.composerOverlay,
              pendingElementType !== 'stamp' && styles.composerOverlayEditing,
            ]}
            activeOpacity={1}
            onPress={() => {
              setShowElementComposer(false);
              setEditingElement(null);
            }}
          >
            <TouchableOpacity
              style={styles.composerCard}
              activeOpacity={1}
              onPress={(event) => event.stopPropagation()}
            >
              <Text style={styles.composerTitle}>
                {editingElement
                  ? 'Edit item'
                  : pendingElementType === 'note'
                    ? 'New note'
                    : pendingElementType === 'text'
                      ? 'Write text'
                      : 'Choose stamp'}
              </Text>
              {pendingElementType === 'stamp' ? (
                <View style={styles.stampPicker}>
                  {STAMP_CHOICES.map((stamp) => (
                    <TouchableOpacity
                      key={stamp}
                      style={[
                        styles.stampChoice,
                        elementDraft === stamp && styles.stampChoiceActive,
                      ]}
                      onPress={() => setElementDraft(stamp)}
                    >
                      <Text style={[styles.stampChoiceText, { color: elementDraftColor }]}>{stamp}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TextInput
                  style={[
                    styles.composerInput,
                    pendingElementType === 'note' && styles.composerInputNote,
                    pendingElementType === 'text' && styles.composerInputText,
                    pendingElementType === 'note'
                      ? { backgroundColor: elementDraftColor }
                      : { color: elementDraftColor },
                  ]}
                  value={elementDraft}
                  onChangeText={setElementDraft}
                  multiline
                  autoFocus
                  placeholder={pendingElementType === 'note' ? 'Write a little memory...' : 'Sunny day ♡'}
                  placeholderTextColor="#B8AFA7"
                />
              )}
              <View style={styles.elementColorPicker}>
                {ELEMENT_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.elementColorChoice,
                      { backgroundColor: color },
                      elementDraftColor === color && styles.elementColorChoiceActive,
                    ]}
                    onPress={() => setElementDraftColor(color)}
                    activeOpacity={0.8}
                  />
                ))}
              </View>
              <View style={styles.composerActions}>
                <TouchableOpacity
                  style={styles.composerCancel}
                  onPress={() => {
                    setShowElementComposer(false);
                    setEditingElement(null);
                  }}
                >
                  <Text style={styles.composerCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.composerAdd}
                  onPress={handleSaveElement}
                >
                  <Text style={styles.composerAddText}>{editingElement ? 'Save' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Unplaced Sticker Picker Modal */}
      <Modal
        visible={showUnplacedPicker}
        animationType="slide"
        onRequestClose={() => setShowUnplacedPicker(false)}
      >
        <SafeAreaView style={styles.pickerContainer} edges={['top']}>
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowUnplacedPicker(false)}>
              <Text style={styles.pickerBackText}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Choose a sticker to place</Text>
            <View style={{ width: 24 }} />
          </View>

          {loadingUnplaced ? (
            <View style={styles.pickerLoading}>
              <ActivityIndicator size="large" color="#A78BFA" />
            </View>
          ) : unplacedStickers.length === 0 ? (
            <View style={styles.pickerEmpty}>
              <Text style={styles.pickerEmptyText}>
                No stickers in your collection yet.{'\n'}Snap one first ✦
              </Text>
              <TouchableOpacity
                style={styles.pickerSnapButton}
                onPress={handleSnapNowFromPicker}
              >
                <Text style={styles.pickerSnapButtonText}>Snap now →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={unplacedStickers}
              renderItem={renderUnplacedItem}
              keyExtractor={(item) => item.id}
              numColumns={NUM_COLUMNS}
              contentContainerStyle={styles.pickerGrid}
              columnWrapperStyle={styles.pickerRow}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7ECFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#DEC3FF',
    backgroundColor: theme.colors.background,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconText: {
    fontSize: 34,
    lineHeight: 34,
    color: theme.colors.purple,
    fontWeight: '300',
  },
  headerTitleBlock: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontFamily: theme.fonts.black,
    fontSize: 20,
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerActionText: {
    fontSize: 24,
    color: theme.colors.purple,
    fontWeight: '700',
  },
  headerActionTextActive: {
    color: theme.colors.black,
  },
  indicatorContainer: {
    alignItems: 'center',
    paddingTop: 0,
  },
  pageCounter: {
    fontFamily: theme.fonts.extraBold,
    color: theme.colors.purple,
    fontSize: 13,
    marginBottom: 3,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    height: 5,
    borderRadius: 2.5,
  },
  dotActive: {
    width: 12,
    backgroundColor: theme.colors.purple,
  },
  dotInactive: {
    width: 5,
    backgroundColor: '#D8D2CC',
  },
  pageText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  pageTextArranging: {
    color: '#A78BFA',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    paddingTop: 8,
  },
  canvas: {
    flex: 1,
    backgroundColor: '#FFF7E8',
    marginHorizontal: CANVAS_MARGIN,
    marginTop: 4,
    marginBottom: 18,
    borderRadius: 26,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EBDCC6',
    shadowColor: '#9D7A6C',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 8,
  },
  pageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    marginHorizontal: CANVAS_MARGIN,
    marginTop: 12,
    marginBottom: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.38)',
  },
  canvasBrutalist: {
    borderRadius: 10,
    borderWidth: 3,
    borderColor: '#1A1A1A',
    shadowColor: '#1A1A1A',
    shadowOffset: { width: 8, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 10,
  },
  canvasFilm: {
    borderRadius: 8,
    borderWidth: 0,
    backgroundColor: '#111111',
    shadowColor: '#7B61FF',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 18,
    elevation: 10,
  },
  canvasZooming: {
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  canvasPaperTint: {},
  pageCanvasContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#FFF8EA',
  },
  pageCanvasBrutalist: {
    borderWidth: 0,
  },
  pageCanvasFilm: {
    backgroundColor: '#111111',
  },
  paperGrid: {
    ...StyleSheet.absoluteFillObject,
  },
  paperGridBrutalist: {
    opacity: 0.36,
  },
  paperGridFilm: {
    left: 28,
    right: 28,
    top: 10,
    bottom: 32,
    borderWidth: 1.5,
    borderColor: '#7B61FF',
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(202, 181, 145, 0.12)',
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(202, 181, 145, 0.12)',
  },
  gridLineBrutalist: {
    backgroundColor: 'rgba(26, 26, 26, 0.18)',
  },
  gridLineFilm: {
    backgroundColor: 'rgba(123, 97, 255, 0.16)',
  },
  filmPerforationLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  filmPerforation: {
    position: 'absolute',
    width: 12,
    height: 8,
    borderRadius: 2,
    backgroundColor: '#2A2A2A',
  },
  filmOuterBorder: {
    position: 'absolute',
    left: 28,
    right: 28,
    top: 10,
    bottom: 32,
    borderWidth: 1.5,
    borderColor: '#7B61FF',
    borderRadius: 2,
  },
  filmInnerBorder: {
    position: 'absolute',
    left: 32,
    right: 32,
    top: 14,
    bottom: 36,
    borderWidth: 0.5,
    borderColor: '#FF6B9D',
    borderRadius: 1,
  },
  filmMetaStrip: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 0,
    height: 24,
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filmMetaText: {
    color: '#7B61FF',
    fontFamily: 'Courier',
    fontSize: 9,
    fontWeight: '700',
  },
  emptyPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPageBrutalist: {
    padding: 24,
  },
  emptyPageFilm: {
    paddingHorizontal: 46,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DEC3FF',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIconBrutalist: {
    borderStyle: 'solid',
    borderWidth: 2,
    borderColor: '#1A1A1A',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  emptyIconFilm: {
    borderStyle: 'solid',
    borderColor: '#7B61FF',
    backgroundColor: '#1A1A2E',
  },
  emptyIconText: {
    fontSize: 24,
    color: theme.colors.purple,
  },
  emptyIconTextBrutalist: {
    color: '#1A1A1A',
  },
  emptyIconTextFilm: {
    color: '#FF6B9D',
  },
  emptyText: {
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyTextBrutalist: {
    color: '#1A1A1A',
    fontFamily: 'Courier',
    textTransform: 'uppercase',
  },
  emptyTextFilm: {
    color: '#8E82C9',
  },
  draggableSticker: {
    position: 'absolute',
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    borderRadius: 8,
    overflow: 'visible',
  },
  stickerHitArea: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.01)',
  },
  stickerHitAreaSelected: {
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.75)',
    borderStyle: 'dashed',
    borderRadius: 18,
  },
  stickerCommittingDrop: {
    opacity: 0,
  },
  stickerImage: {
    position: 'absolute',
    left: -(STICKER_RENDER_SIZE - STICKER_SIZE) / 2,
    top: -(STICKER_RENDER_SIZE - STICKER_SIZE) / 2,
    width: STICKER_RENDER_SIZE,
    height: STICKER_RENDER_SIZE,
    borderRadius: 8,
  },
  pageElement: {
    position: 'absolute',
    zIndex: 2,
    overflow: 'visible',
  },
  pageElementSelected: {
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.8)',
    borderStyle: 'dashed',
    borderRadius: 14,
  },
  noteElement: {
    flex: 1,
    borderRadius: 4,
    paddingHorizontal: 16,
    paddingTop: 28,
    paddingBottom: 12,
    shadowColor: '#806B72',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  noteTape: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    width: 62,
    height: 20,
    borderRadius: 3,
    backgroundColor: 'rgba(188, 161, 246, 0.48)',
    transform: [{ rotate: '-3deg' }],
  },
  noteText: {
    fontFamily: theme.fonts.handwritten,
    color: '#2F2A29',
    fontSize: 23,
    lineHeight: 26,
  },
  handTextElement: {
    fontFamily: theme.fonts.handwrittenBold,
    fontSize: TEXT_FONT_SIZE,
    lineHeight: TEXT_LINE_HEIGHT,
    flexShrink: 0,
    includeFontPadding: false,
    textShadowColor: 'rgba(139, 111, 239, 0.18)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  stampElement: {
    fontFamily: theme.fonts.black,
    fontSize: 42,
    lineHeight: 48,
    textShadowColor: 'rgba(139, 111, 239, 0.22)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  elementDeleteButton: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  elementDeleteText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  deleteButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
    marginTop: -1,
  },
  stickerSelectionDock: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 252, 247, 0.96)',
    borderWidth: 1,
    borderColor: '#E8DED1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    zIndex: 1000,
    shadowColor: '#806B72',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  stickerSelectionHint: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  stickerSelectionPeelButton: {
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  stickerSelectionDoneButton: {
    minHeight: 36,
    borderRadius: 18,
    backgroundColor: '#F1ECE5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginRight: 8,
  },
  stickerSelectionDoneText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  stickerSelectionPeelText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  arrowButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -24,
    width: 32,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  arrowLeft: {
    left: 0,
  },
  arrowRight: {
    right: 0,
  },
  arrowText: {
    fontSize: 28,
    color: theme.colors.purple,
    fontWeight: '300',
  },
  toolDock: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: 64,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    borderWidth: 1,
    borderColor: theme.colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    shadowColor: '#7D695C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 9,
  },
  toolButton: {
    width: 68,
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolIcon: {
    color: theme.colors.purple,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 2,
  },
  toolLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  selectionToolDock: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 0,
    zIndex: 1100,
  },
  selectionIconButton: {
    width: 36,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7D695C',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  selectionToolDangerButton: {
    backgroundColor: '#F1ECE5',
  },
  selectionToolIcon: {
    color: theme.colors.purple,
    fontSize: 21,
    fontWeight: '900',
  },
  selectionToolDangerIcon: {
    color: '#1E1E1E',
  },
  selectionEditText: {
    color: theme.colors.purple,
    fontSize: 16,
    fontWeight: '900',
  },
  selectionMoveButton: {
    height: 46,
    minWidth: 50,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
    shadowColor: '#7D695C',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  selectionMoveButtonActive: {
    backgroundColor: theme.colors.purple,
  },
  selectionMoveText: {
    color: theme.colors.purple,
    fontSize: 12,
    fontWeight: '900',
  },
  selectionMoveTextActive: {
    color: '#FFFFFF',
  },
  movePopupDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  selectionActionPopup: {
    position: 'absolute',
    alignSelf: 'center',
    minWidth: 184,
    height: 50,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 253, 248, 0.98)',
    borderWidth: 1,
    borderColor: theme.colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    shadowColor: '#7D695C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 1200,
  },
  selectionActionPopupButton: {
    width: 54,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#F7F0EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionActionPopupIcon: {
    color: theme.colors.purple,
    fontSize: 20,
    fontWeight: '900',
  },
  selectionActionPopupLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: 10,
  },
  movePagePopup: {
    position: 'absolute',
    left: 18,
    right: 18,
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 253, 248, 0.98)',
    borderWidth: 1,
    borderColor: theme.colors.line,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 6,
    shadowColor: '#7D695C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 1200,
  },
  movePageButton: {
    flex: 1,
    height: 38,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 2,
    backgroundColor: '#F7F0EA',
  },
  movePageButtonDisabled: {
    backgroundColor: '#ECE6DF',
    opacity: 0.58,
  },
  movePageButtonText: {
    color: theme.colors.purple,
    fontSize: 11,
    fontWeight: '900',
  },
  movePageButtonTextDisabled: {
    color: theme.colors.textMuted,
  },
  moveNotice: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 16,
    backgroundColor: 'rgba(30, 30, 30, 0.88)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 1300,
  },
  moveNoticeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    alignItems: 'center',
    padding: 20,
  },
  modalImage: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    borderRadius: 16,
    marginBottom: 24,
  },
  peelOffHint: {
    maxWidth: SCREEN_WIDTH * 0.72,
    color: '#B8B8B8',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  rotateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  rotateButton: {
    minWidth: 72,
    alignItems: 'center',
    backgroundColor: '#252525',
    borderWidth: 1,
    borderColor: '#333333',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 22,
  },
  rotateButtonText: {
    fontSize: 15,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  moveStickerButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    marginBottom: 12,
    minWidth: 180,
    alignItems: 'center',
  },
  moveStickerButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
  },
  peelOffButton: {
    backgroundColor: '#A78BFA',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
    marginBottom: 12,
  },
  peelOffButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#888',
  },
  composerKeyboardAvoiding: {
    flex: 1,
  },
  composerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(48, 37, 31, 0.34)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  composerOverlayEditing: {
    justifyContent: 'flex-start',
    paddingTop: Platform.OS === 'ios' ? 84 : 56,
  },
  composerCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 16,
    shadowColor: '#7D695C',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  composerTitle: {
    fontFamily: theme.fonts.black,
    color: theme.colors.text,
    fontSize: 21,
    textAlign: 'center',
    marginBottom: 12,
  },
  composerInput: {
    fontFamily: theme.fonts.handwrittenBold,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: theme.colors.text,
    fontSize: 30,
  },
  composerInputNote: {
    minHeight: 112,
    textAlignVertical: 'top',
    backgroundColor: '#F7D3E1',
    lineHeight: 34,
  },
  composerInputText: {
    minHeight: 112,
    maxHeight: 190,
    textAlignVertical: 'top',
    lineHeight: 38,
  },
  stampPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 4,
  },
  stampChoice: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stampChoiceActive: {
    backgroundColor: '#F1E8FF',
    borderColor: theme.colors.purple,
  },
  stampChoiceText: {
    fontSize: 28,
    fontWeight: '900',
  },
  elementColorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
  },
  elementColorChoice: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(48, 37, 31, 0.10)',
  },
  elementColorChoiceActive: {
    borderColor: '#1E1E1E',
    borderWidth: 3,
  },
  pageColorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  pageColorChoice: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(48, 37, 31, 0.12)',
  },
  pageColorChoiceActive: {
    borderColor: '#1E1E1E',
    borderWidth: 4,
  },
  composerActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  composerCancel: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: theme.colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerCancelText: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontWeight: '800',
  },
  composerAdd: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  composerAddText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(48, 37, 31, 0.32)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#D8D2CC',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  sheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 0.5,
    borderColor: theme.colors.line,
    borderRadius: 16,
    height: 52,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sheetButtonIcon: {
    fontSize: 18,
    marginRight: 12,
  },
  sheetButtonText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '800',
  },
  sheetButtonTextPurple: {
    fontSize: 16,
    color: theme.colors.purple,
    fontWeight: '800',
  },
  sheetCancelButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  sheetCancelText: {
    fontSize: 16,
    color: theme.colors.textMuted,
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  pickerBackText: {
    fontSize: 24,
    color: theme.colors.purple,
  },
  pickerTitle: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '600',
  },
  pickerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  pickerEmptyText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  pickerSnapButton: {
    backgroundColor: theme.colors.purple,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  pickerSnapButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pickerGrid: {
    padding: 16,
  },
  pickerRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  pickerItem: {
    width: PICKER_CARD_SIZE,
    height: PICKER_CARD_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSoft,
  },
  pickerItemImage: {
    width: '100%',
    height: '100%',
  },
});
