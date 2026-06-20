import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
  Dimensions,
  Easing,
  Modal,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sticker, getBooks, Book, createBook, placeStickerInBook, StickerPlacementIntent } from '../../lib/storage';
import { getEffectiveAccountStatus } from '../../lib/accountStatus';
import { removeBackground, BackgroundRemovalProvider } from '../../lib/backgroundRemoval';
import { useAuth } from '../../contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { captureRef } from 'react-native-view-shot';
import Svg, { ClipPath, Defs, Image as SvgImage, Path, Rect } from 'react-native-svg';
import {
  DEFAULT_STICKER_FRAME_COLOR,
  normalizeStickerFrameColor,
  normalizeStickerFrameMode,
  StickerFrameMode,
} from '../../lib/stickerFrames';
import { getStickerFrameHeartPath, getStickerFrameStarPath } from '../../lib/stickerFrameShapes';
import { createFrameAlphaMask, createNativeAlphaMask } from '../../lib/stickerAlphaMask';
import {
  canManualRetryPendingSticker,
  createPendingSticker,
  getLocalStickerFromPending,
  getPendingStickers,
  syncPendingSticker,
  syncPendingStickerManually,
} from '../../lib/pendingStickerSync';

const TAB_BAR_HEIGHT = 80;
const STICKER_UPLOAD_MAX_EDGE = 1024;
const FRAMED_STICKER_SQUARE_SIZE = 1024;
const FRAMED_STICKER_ROUNDED_WIDTH = 1024;
const FRAMED_STICKER_ROUNDED_HEIGHT = 768;
const PENDING_SAVE_MS = 5000;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STICKER_MAX_WIDTH = 280;
const FRAMED_PREVIEW_MAX_WIDTH = Math.min(340, SCREEN_WIDTH - 44);

type ProcessingState = 'idle' | 'preparing-frame' | 'removing-bg' | 'uploading' | 'done' | 'error';
type ProcessingTimings = Record<string, number>;

type BackgroundRemovalPreviewResult = {
  error: Error | null;
  provider: BackgroundRemovalProvider;
  nativeResult?: {
    uri: string;
    subjectCount: number;
    width: number;
    height: number;
    elapsedMs: number;
    alphaMask?: string;
    contentBounds?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
};

type FramedStickerCapture = {
  uri: string;
  width: number;
  height: number;
  bytes?: number;
};

type PreparedStickerUpload = {
  uri: string;
  width: number;
  height: number;
  bytes?: number;
};

function getNormalizedContentBounds(result?: BackgroundRemovalPreviewResult['nativeResult']) {
  const bounds = result?.contentBounds;
  if (!result?.width || !result?.height || !bounds) return undefined;

  return {
    x: Math.max(0, Math.min(1, bounds.x / result.width)),
    y: Math.max(0, Math.min(1, bounds.y / result.height)),
    width: Math.max(0, Math.min(1, bounds.width / result.width)),
    height: Math.max(0, Math.min(1, bounds.height / result.height)),
  };
}

function waitForProcessingScreen(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

async function measureAsyncStep<T>(
  timings: ProcessingTimings,
  name: string,
  task: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await task();
  } finally {
    timings[name] = Date.now() - startedAt;
  }
}

function logProcessingTimings(
  mode: StickerFrameMode,
  outcome: 'success' | 'error',
  timings: ProcessingTimings,
  totalStartedAt: number
) {
  console.info('[StickerProcessingTiming]', {
    mode,
    outcome,
    ...timings,
    total_ms: Date.now() - totalStartedAt,
  });
}

function getLocalFileSizeBytes(uri: string): number | undefined {
  try {
    const size = new File(uri).size;
    return typeof size === 'number' && Number.isFinite(size) ? size : undefined;
  } catch {
    return undefined;
  }
}

function parsePlacementPageIndex(value?: string) {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 4 ? parsed : null;
}

const PROCESSING_LINES: Record<ProcessingState, string[]> = {
  idle: [
    'Ready to peel this into a sticker.',
    'Tap Peel when this one feels right.',
  ],
  'removing-bg': [
    'Cutting out your sticker...',
  ],
  'preparing-frame': [
    'Building your sticker frame...',
  ],
  uploading: [
    'Saving your sticker...',
  ],
  done: [
    'Preparing your sticker preview...',
  ],
  error: [''],
};

function PeelingAnimation({ imageUrl }: { imageUrl: string }) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animValue, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(animValue, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [animValue]);

  const translateY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  const scale = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.97],
  });

  return (
    <View style={styles.peelingContainer}>
      <Animated.View
        style={[
          styles.peelingImageWrapper,
          {
            transform: [
              { translateY },
              { scale },
            ],
          },
        ]}
      >
        <Image
          source={{ uri: imageUrl }}
          style={styles.peelingImage}
          resizeMode="cover"
        />
      </Animated.View>
    </View>
  );
}

type DropAnimationProps = {
  stickerUrl: string;
  onLanded: () => void;
  onReady?: () => void;
};

function DropAnimation({ stickerUrl, onLanded, onReady }: DropAnimationProps) {
  const translateY = useRef(new Animated.Value(28)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const rotate = useRef(new Animated.Value(-4)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const haloScale = useRef(new Animated.Value(0.4)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;
  const outlineGlowOpacity = useRef(new Animated.Value(0)).current;
  const outlineGlowScale = useRef(new Animated.Value(0.96)).current;
  const auraGlowOpacity = useRef(new Animated.Value(0)).current;
  const auraGlowScale = useRef(new Animated.Value(0.98)).current;
  const sparkleValues = useRef(
    Array.from({ length: 10 }, () => new Animated.Value(0))
  ).current;
  const [imageLoaded, setImageLoaded] = useState(false);
  const animationStarted = useRef(false);

  const startAnimation = () => {
    if (animationStarted.current) return;
    animationStarted.current = true;

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1.06,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(rotate, {
        toValue: 1.5,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 0.96,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 13,
          stiffness: 360,
          useNativeDriver: true,
        }),
      ]).start(() => onLanded());

      Animated.spring(rotate, {
        toValue: 0,
        damping: 12,
        stiffness: 280,
        useNativeDriver: true,
      }).start();

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Animated.parallel([
        Animated.timing(haloOpacity, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(outlineGlowOpacity, {
            toValue: 0.9,
            duration: 120,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(outlineGlowOpacity, {
            toValue: 0.36,
            duration: 420,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(outlineGlowScale, {
            toValue: 1.12,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.spring(outlineGlowScale, {
            toValue: 1.04,
            damping: 14,
            stiffness: 150,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(auraGlowOpacity, {
            toValue: 0.42,
            duration: 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(auraGlowOpacity, {
            toValue: 0,
            duration: 520,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(auraGlowScale, {
          toValue: 1.26,
          duration: 680,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(haloScale, {
            toValue: 1.16,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0,
            duration: 160,
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      Animated.stagger(
        18,
        sparkleValues.map((value) =>
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: 260,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0,
              duration: 120,
              useNativeDriver: true,
            }),
          ])
        )
      ).start();

      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }).start();
    });
  };

  useEffect(() => {
    if (imageLoaded) {
      onReady?.();
      requestAnimationFrame(() => startAnimation());
    }
  }, [imageLoaded, onReady]);

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-6, 0, 2],
    outputRange: ['-6deg', '0deg', '2deg'],
  });

  const sparkles = [
    { x: -122, y: -112, size: 20, mark: '✦' },
    { x: -64, y: -146, size: 14, mark: '✧' },
    { x: 96, y: -126, size: 22, mark: '✦' },
    { x: 138, y: -38, size: 14, mark: '✧' },
    { x: 116, y: 92, size: 18, mark: '✦' },
    { x: 34, y: 142, size: 14, mark: '✧' },
    { x: -106, y: 110, size: 20, mark: '✦' },
    { x: -150, y: 24, size: 13, mark: '✧' },
    { x: 0, y: -166, size: 12, mark: '✦' },
    { x: 154, y: 34, size: 12, mark: '✧' },
  ];

  return (
    <View style={styles.dropContainer}>
      <View style={styles.dropStage}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dropHalo,
            {
              opacity: haloOpacity,
              transform: [{ scale: haloScale }],
            },
          ]}
        />
        <Animated.Image
          source={{ uri: stickerUrl }}
          style={[
            styles.dropAuraGlowImage,
            {
              opacity: auraGlowOpacity,
              transform: [{ scale: auraGlowScale }],
            },
          ]}
          resizeMode="contain"
          blurRadius={24}
        />
        <Animated.Image
          source={{ uri: stickerUrl }}
          style={[
            styles.dropOutlineGlowImage,
            {
              opacity: outlineGlowOpacity,
              transform: [{ scale: outlineGlowScale }],
            },
          ]}
          resizeMode="contain"
          blurRadius={8}
        />
        {sparkles.map((sparkle, index) => {
          const value = sparkleValues[index];
          const sparkleTranslateX = value.interpolate({
            inputRange: [0, 1],
            outputRange: [0, sparkle.x],
          });
          const sparkleTranslateY = value.interpolate({
            inputRange: [0, 1],
            outputRange: [0, sparkle.y],
          });
          const sparkleScale = value.interpolate({
            inputRange: [0, 0.4, 1],
            outputRange: [0.2, 1.2, 0.8],
          });

          return (
            <Animated.Text
              key={index}
              pointerEvents="none"
              style={[
                styles.sparkle,
                {
                  fontSize: sparkle.size,
                  opacity: value,
                  transform: [
                    { translateX: sparkleTranslateX },
                    { translateY: sparkleTranslateY },
                    { scale: sparkleScale },
                  ],
                },
              ]}
            >
              {sparkle.mark}
            </Animated.Text>
          );
        })}
        <Animated.View
          style={[
            styles.dropStickerWrapper,
            {
              transform: [
                { translateY },
                { scale },
                { rotate: rotateInterpolate },
              ],
            },
          ]}
        >
          <Image
            source={{ uri: stickerUrl }}
            style={styles.dropStickerImage}
            resizeMode="contain"
            onLoad={() => setImageLoaded(true)}
          />
        </Animated.View>
      </View>
      <Animated.Text style={[styles.dropText, { opacity: textOpacity }]}>
        Freshly peeled. Ready for a page.
      </Animated.Text>
    </View>
  );
}

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

type FramedStickerCanvasProps = {
  imageUrl: string;
  mode: Exclude<StickerFrameMode, 'cutout'>;
  frameColor: string;
  displayWidth: number;
  displayHeight: number;
  onImageLoad?: () => void;
};

const FramedStickerCanvas = React.forwardRef<View, FramedStickerCanvasProps>(
  ({ imageUrl, mode, frameColor, displayWidth, displayHeight, onImageLoad }, ref) => {
    const isRounded = mode === 'rounded';
    const width = isRounded ? FRAMED_STICKER_ROUNDED_WIDTH : FRAMED_STICKER_SQUARE_SIZE;
    const height = isRounded ? FRAMED_STICKER_ROUNDED_HEIGHT : FRAMED_STICKER_SQUARE_SIZE;
    const strokeWidth = isRounded ? 16 : 19;
    const roundedRadius = 132;
    const starPath = getStickerFrameStarPath(FRAMED_STICKER_SQUARE_SIZE, 490, 245);
    const heartPath = getStickerFrameHeartPath(FRAMED_STICKER_SQUARE_SIZE);

    return (
      <View
        ref={ref}
        collapsable={false}
        style={[
          styles.frameCanvas,
          {
            width: displayWidth,
            height: displayHeight,
          },
        ]}
      >
        <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            {isRounded ? (
              <ClipPath id="frameClip">
                <Rect
                  x={strokeWidth / 2}
                  y={strokeWidth / 2}
                  width={width - strokeWidth}
                  height={height - strokeWidth}
                  rx={roundedRadius}
                  ry={roundedRadius}
                />
              </ClipPath>
            ) : (
              <ClipPath id="frameClip">
                <Path d={mode === 'heart' ? heartPath : starPath} />
              </ClipPath>
            )}
          </Defs>
          <SvgImage
            href={{ uri: imageUrl }}
            x="0"
            y="0"
            width={width}
            height={height}
            preserveAspectRatio="xMidYMid slice"
            clipPath="url(#frameClip)"
            onLoad={onImageLoad}
          />
          {isRounded ? (
            <Rect
              x={strokeWidth / 2}
              y={strokeWidth / 2}
              width={width - strokeWidth}
              height={height - strokeWidth}
              rx={roundedRadius}
              ry={roundedRadius}
              fill="none"
              stroke={frameColor}
              strokeWidth={strokeWidth}
            />
          ) : (
            <Path
              d={mode === 'heart' ? heartPath : starPath}
              fill="none"
              stroke={frameColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
            />
          )}
        </Svg>
      </View>
    );
  }
);

FramedStickerCanvas.displayName = 'FramedStickerCanvas';

async function prepareStickerFileForUpload(
  result: BackgroundRemovalPreviewResult
): Promise<PreparedStickerUpload> {
  const sourceUri = result.nativeResult?.uri;
  if (!sourceUri || !result.nativeResult?.width || !result.nativeResult?.height) {
    throw new Error('Sticker file is not ready.');
  }

  const longestEdge = Math.max(result.nativeResult.width, result.nativeResult.height);
  if (longestEdge <= STICKER_UPLOAD_MAX_EDGE) {
    return {
      uri: sourceUri,
      width: result.nativeResult.width,
      height: result.nativeResult.height,
      bytes: getLocalFileSizeBytes(sourceUri),
    };
  }

  const resized = await ImageManipulator.manipulateAsync(
    sourceUri,
    [
      {
        resize: result.nativeResult.width >= result.nativeResult.height
          ? { width: STICKER_UPLOAD_MAX_EDGE }
          : { height: STICKER_UPLOAD_MAX_EDGE },
      },
    ],
    {
      compress: 1,
      format: ImageManipulator.SaveFormat.PNG,
    }
  );

  return {
    uri: resized.uri,
    width: resized.width,
    height: resized.height,
    bytes: getLocalFileSizeBytes(resized.uri),
  };
}

export default function CropScreen() {
  const { photoUri, captureId, bookId, pageIndex, frameMode, frameColor } = useLocalSearchParams<{
    photoUri?: string;
    captureId?: string;
    bookId?: string;
    pageIndex?: string;
    frameMode?: string;
    frameColor?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [statusLineIndex, setStatusLineIndex] = useState(0);
  const [stickerUrl, setStickerUrl] = useState<string | null>(null);
  const [sticker, setSticker] = useState<Sticker | null>(null);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [dropAnimationReady, setDropAnimationReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showBookSelector, setShowBookSelector] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [selectedBookForPlacement, setSelectedBookForPlacement] = useState<Book | null>(null);
  const [showNewBookInput, setShowNewBookInput] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [savingToBook, setSavingToBook] = useState(false);
  const [pendingStickerId, setPendingStickerId] = useState<string | null>(null);
  const [pendingSyncMessage, setPendingSyncMessage] = useState<string | null>(null);
  const backgroundRemovalPromiseRef = useRef<Promise<BackgroundRemovalPreviewResult> | null>(null);
  const backgroundRemovalImageRef = useRef<string | null>(null);
  const framedStickerRef = useRef<View>(null);
  const [framePreviewReady, setFramePreviewReady] = useState(false);
  const framedCapturePromiseRef = useRef<Promise<FramedStickerCapture> | null>(null);
  const framedCaptureKeyRef = useRef<string | null>(null);
  const [processingElapsedSeconds, setProcessingElapsedSeconds] = useState(0);
  const processingStartedAtRef = useRef<number | null>(null);
  const processingRequestRef = useRef(false);

  const imageUrl = photoUri ?? null;
  const explicitPlacementPageIndex = parsePlacementPageIndex(pageIndex);
  const stickerFrameMode = normalizeStickerFrameMode(frameMode);
  const stickerFrameColor = normalizeStickerFrameColor(frameColor);
  const isFramedSticker = stickerFrameMode !== 'cutout';
  const framedPreviewWidth = isFramedSticker && stickerFrameMode === 'rounded'
    ? FRAMED_PREVIEW_MAX_WIDTH
    : FRAMED_PREVIEW_MAX_WIDTH;
  const framedPreviewHeight = isFramedSticker && stickerFrameMode === 'rounded'
    ? Math.round(FRAMED_PREVIEW_MAX_WIDTH * 0.75)
    : FRAMED_PREVIEW_MAX_WIDTH;
  const framedCaptureWidth = stickerFrameMode === 'rounded'
    ? FRAMED_STICKER_ROUNDED_WIDTH
    : FRAMED_STICKER_SQUARE_SIZE;
  const framedCaptureHeight = stickerFrameMode === 'rounded'
    ? FRAMED_STICKER_ROUNDED_HEIGHT
    : FRAMED_STICKER_SQUARE_SIZE;

  useEffect(() => {
    setProcessingState('idle');
    setStatusLineIndex(0);
    setStickerUrl(null);
    setSticker(null);
    setAnimationComplete(false);
    setDropAnimationReady(false);
    setErrorMessage(null);
    setShowBookSelector(false);
    setSelectedBookForPlacement(null);
    setShowNewBookInput(false);
    setNewBookName('');
    setSavingToBook(false);
    setPendingStickerId(null);
    setPendingSyncMessage(null);
    setProcessingElapsedSeconds(0);
    processingStartedAtRef.current = null;
    processingRequestRef.current = false;
    backgroundRemovalPromiseRef.current = null;
    backgroundRemovalImageRef.current = null;
    framedCapturePromiseRef.current = null;
    framedCaptureKeyRef.current = null;
    setFramePreviewReady(false);
  }, [photoUri, captureId, frameMode, frameColor]);

  useEffect(() => {
    if (!imageUrl || processingState !== 'idle' || isFramedSticker) return;
    if (backgroundRemovalImageRef.current === imageUrl && backgroundRemovalPromiseRef.current) return;

    backgroundRemovalImageRef.current = imageUrl;
    backgroundRemovalPromiseRef.current = removeBackground(imageUrl);
  }, [imageUrl, isFramedSticker, processingState]);

  useEffect(() => {
    if (!imageUrl || !isFramedSticker || processingState !== 'idle') return;

    const fallback = setTimeout(() => {
      setFramePreviewReady(true);
    }, 700);

    return () => clearTimeout(fallback);
  }, [imageUrl, isFramedSticker, processingState, stickerFrameColor, stickerFrameMode]);

  const getFramedCaptureKey = useCallback(() => (
    imageUrl
      ? [
          imageUrl,
          stickerFrameMode,
          stickerFrameColor,
          framedCaptureWidth,
          framedCaptureHeight,
        ].join(':')
      : null
  ), [framedCaptureHeight, framedCaptureWidth, imageUrl, stickerFrameColor, stickerFrameMode]);

  useEffect(() => {
    setStatusLineIndex(0);
    const lines = PROCESSING_LINES[processingState];
    if (lines.length <= 1) return;

    const interval = setInterval(() => {
      setStatusLineIndex((prev) => (prev + 1) % lines.length);
    }, processingState === 'idle' ? 2400 : 1500);

    return () => clearInterval(interval);
  }, [processingState]);

  useEffect(() => {
    const active =
      processingState === 'preparing-frame' ||
      processingState === 'removing-bg' ||
      processingState === 'uploading';

    if (!active) {
      processingStartedAtRef.current = null;
      setProcessingElapsedSeconds(0);
      return;
    }

    if (processingStartedAtRef.current === null) {
      processingStartedAtRef.current = Date.now();
    }

    const updateElapsed = () => {
      if (processingStartedAtRef.current !== null) {
        setProcessingElapsedSeconds(
          Math.floor((Date.now() - processingStartedAtRef.current) / 1000)
        );
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [processingState]);

  const fetchBooks = async () => {
    setLoadingBooks(true);
    const { books: fetchedBooks } = await getBooks();
    setBooks(fetchedBooks);
    setLoadingBooks(false);
  };

  const captureFramedStickerNow = useCallback(async (): Promise<FramedStickerCapture> => {
    if (!framedStickerRef.current) {
      throw new Error('Frame preview is not ready yet.');
    }

    const uri = await captureRef(framedStickerRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: framedCaptureWidth,
        height: framedCaptureHeight,
    });

    return {
      uri,
      width: framedCaptureWidth,
      height: framedCaptureHeight,
      bytes: getLocalFileSizeBytes(uri),
    };
  }, [framedCaptureHeight, framedCaptureWidth]);

  useEffect(() => {
    if (!imageUrl || !isFramedSticker || !framePreviewReady || processingState !== 'idle') return;

    const captureKey = getFramedCaptureKey();
    if (!captureKey || framedCaptureKeyRef.current === captureKey) return;

    framedCaptureKeyRef.current = captureKey;
    const capturePromise = captureFramedStickerNow();
    capturePromise.catch((error: unknown) => {
      if (framedCaptureKeyRef.current === captureKey) {
        framedCaptureKeyRef.current = null;
        framedCapturePromiseRef.current = null;
      }
      console.warn('Framed sticker preload capture failed:', error);
    });
    framedCapturePromiseRef.current = capturePromise;
  }, [
    captureFramedStickerNow,
    framePreviewReady,
    getFramedCaptureKey,
    imageUrl,
    isFramedSticker,
    processingState,
  ]);

  const captureFramedSticker = async (
    timings: ProcessingTimings
  ): Promise<FramedStickerCapture> => {
    const captureKey = getFramedCaptureKey();
    const pendingCapture =
      captureKey &&
      framedCaptureKeyRef.current === captureKey &&
      framedCapturePromiseRef.current
        ? framedCapturePromiseRef.current
        : captureFramedStickerNow();

    return measureAsyncStep(timings, 'frame_capture_wait_ms', () => pendingCapture);
  };

  const processImage = async () => {
    if (processingRequestRef.current) return;

    if (!imageUrl || !user) {
      setErrorMessage('Image information is missing.');
      setProcessingState('error');
      return;
    }

    processingRequestRef.current = true;
    const totalStartedAt = Date.now();
    const timings: ProcessingTimings = {};

    setDropAnimationReady(false);
    setProcessingState(isFramedSticker ? 'preparing-frame' : 'removing-bg');
    setErrorMessage(null);

    try {
      await waitForProcessingScreen();
      timings.processing_ui_ready_ms = Date.now() - totalStartedAt;

      const { status: accountStatus, error: quotaError } = await measureAsyncStep(
        timings,
        'account_status_ms',
        () => getEffectiveAccountStatus(user.id)
      );

      if (!quotaError && accountStatus.stickers_remaining <= 0) {
        throw new Error(
          accountStatus.plan === 'paid'
            ? 'You have used all 100 stickers for this month.'
            : 'You have used all 5 free stickers for this month. Upgrade to Peelzy Plus for 100 stickers per month.'
        );
      }
      if (quotaError) {
        timings.account_status_skipped = 1;
      }

      let uploadFile: PreparedStickerUpload;
      let previewUriForThumbnail: string | null = null;
      let previewDimensions: { width?: number; height?: number } | undefined;
      let provider: BackgroundRemovalProvider | 'frame' = 'frame';
      let nativeResult: BackgroundRemovalPreviewResult['nativeResult'] | undefined;

      if (isFramedSticker) {
        const framedResult = await captureFramedSticker(timings);
        setProcessingState('uploading');
        uploadFile = framedResult;
        previewUriForThumbnail = framedResult.uri;
        previewDimensions = {
          width: framedResult.width,
          height: framedResult.height,
        };
      } else {
        const backgroundRemovalPromise =
          backgroundRemovalImageRef.current === imageUrl && backgroundRemovalPromiseRef.current
            ? backgroundRemovalPromiseRef.current
            : removeBackground(imageUrl);

        const {
          error: bgError,
          provider: removalProvider,
          nativeResult: removalNativeResult,
        } = await measureAsyncStep(
          timings,
          'background_removal_wait_ms',
          () => backgroundRemovalPromise
        );

        if (bgError || !removalNativeResult?.uri) {
          throw new Error(bgError?.message || 'Failed to remove background');
        }

        setProcessingState('uploading');
        provider = removalProvider;
        nativeResult = removalNativeResult;
        if (removalNativeResult?.elapsedMs !== undefined) {
          timings.background_removal_native_ms = removalNativeResult.elapsedMs;
        }

        uploadFile = await measureAsyncStep(
          timings,
          'prepare_upload_ms',
          () => prepareStickerFileForUpload({
            error: null,
            provider: removalProvider,
            nativeResult: removalNativeResult,
          })
        );
        previewUriForThumbnail = removalNativeResult?.uri ?? null;
        previewDimensions = {
          width: removalNativeResult?.width,
          height: removalNativeResult?.height,
        };
      }

      timings.upload_bytes = uploadFile.bytes ?? 0;
      timings.upload_width = uploadFile.width;
      timings.upload_height = uploadFile.height;
      timings.upload_megapixels = Math.round((uploadFile.width * uploadFile.height) / 1000) / 1000;

      const placementIntent: StickerPlacementIntent | null =
        bookId && explicitPlacementPageIndex !== null
          ? {
              bookId,
              pageIndex: explicitPlacementPageIndex,
              pos_x: randomBetween(0.2, 0.8),
              pos_y: randomBetween(0.2, 0.8),
              rotation: randomBetween(-15, 15),
            }
          : null;

      const metadata = {
        capturedAt: new Date().toISOString(),
        sourceCanvas: photoUri ? 'square' as const : 'unknown' as const,
        backgroundRemovalProvider: provider === 'frame' ? undefined : provider,
        backgroundRemovalElapsedMs: nativeResult?.elapsedMs,
        subjectCount: nativeResult?.subjectCount,
        frameMode: stickerFrameMode,
        frameColor: isFramedSticker ? stickerFrameColor : undefined,
        displayScale: 0.9,
        hitBounds: isFramedSticker
          ? { x: 0, y: 0, width: 1, height: 1 }
          : getNormalizedContentBounds(nativeResult),
        alphaMask: isFramedSticker
          ? createFrameAlphaMask(stickerFrameMode as Exclude<StickerFrameMode, 'cutout'>)
          : createNativeAlphaMask(nativeResult?.alphaMask),
        minDisplayScaleApplied: false,
        processingMetrics: {
          ...timings,
          total_ms: Date.now() - totalStartedAt,
        },
      };

      const pendingRecord = await measureAsyncStep(
        timings,
        'local_pending_save_ms',
        () => createPendingSticker({
          userId: user.id,
          sourceUri: uploadFile.uri,
          previewUri: previewUriForThumbnail,
          width: previewDimensions?.width,
          height: previewDimensions?.height,
          metadata,
          placementIntent,
        })
      );

      setPendingStickerId(pendingRecord.pendingId);
      setPendingSyncMessage(null);

      const localSticker = getLocalStickerFromPending(pendingRecord);
      let completedScreen = false;
      const completeWithLocalSticker = (message: string | null) => {
        if (completedScreen) return;
        completedScreen = true;
        setSticker(localSticker);
        setStickerUrl(uploadFile.uri);
        setPendingSyncMessage(message);
        setProcessingState('done');
      };

      const syncPromise = measureAsyncStep(
        timings,
        'sticker_sync_ms',
        () => syncPendingSticker(pendingRecord.pendingId)
      );

      const timeoutPromise = new Promise<'pending-timeout'>((resolve) => {
        setTimeout(() => resolve('pending-timeout'), PENDING_SAVE_MS);
      });

      const firstResult = await Promise.race([syncPromise, timeoutPromise]);
      if (firstResult === 'pending-timeout') {
        completeWithLocalSticker('Saved on this device. Will save when online.');
        syncPromise.then(({ sticker: syncedSticker, error }) => {
          if (syncedSticker) {
            setSticker(syncedSticker);
            setPendingStickerId(null);
            setPendingSyncMessage(null);
            return;
          }
          if (error) {
            setPendingSyncMessage('Not saved to cloud. Retry when your connection improves.');
          }
        });
      } else if (firstResult.sticker) {
        setSticker(firstResult.sticker);
        setStickerUrl(uploadFile.uri);
        setPendingStickerId(null);
        setPendingSyncMessage(null);
        setProcessingState('done');
      } else {
        completeWithLocalSticker('Saved on this device. Will save when online.');
      }

      logProcessingTimings(stickerFrameMode, 'success', timings, totalStartedAt);
    } catch (error) {
      logProcessingTimings(stickerFrameMode, 'error', timings, totalStartedAt);
      setProcessingState('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong peeling this one.'
      );
    } finally {
      processingRequestRef.current = false;
    }
  };

  const handleRetry = () => {
    if (isFramedSticker) {
      setProcessingState('idle');
      setErrorMessage(null);
      setFramePreviewReady(false);
      return;
    }

    processImage();
  };

  const handleAnimationLanded = () => {
    setAnimationComplete(true);
    fetchBooks();
  };

  const handleRetryPendingSync = async () => {
    if (!pendingStickerId) return;

    const pending = (await getPendingStickers()).find((item) => item.pendingId === pendingStickerId);
    if (!pending) {
      setPendingStickerId(null);
      setPendingSyncMessage(null);
      return;
    }

    const retryState = canManualRetryPendingSticker(pending);
    if (!retryState.canRetry) {
      setPendingSyncMessage(retryState.message || 'Try again later.');
      return;
    }

    setPendingSyncMessage('Syncing...');
    const { sticker: syncedSticker, error } = await syncPendingStickerManually(pendingStickerId);
    if (syncedSticker) {
      setSticker(syncedSticker);
      setPendingStickerId(null);
      setPendingSyncMessage(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    setPendingSyncMessage(
      error?.message
        ? 'Connection looks unstable. Try again in a moment.'
        : 'Not saved to cloud. Retry when your connection improves.'
    );
  };

  const handleSelectBook = (selectedBook: Book) => {
    setSelectedBookForPlacement(selectedBook);
  };

  const handleSelectBookPage = async (selectedBook: Book, selectedPageIndex: number) => {
    if (!sticker) return;
    if (pendingStickerId) {
      setPendingSyncMessage('Save to cloud before adding this sticker to a book.');
      return;
    }

    setSavingToBook(true);
    const posX = randomBetween(0.2, 0.8);
    const posY = randomBetween(0.2, 0.8);
    const rotation = randomBetween(-15, 15);

    const { error } = await placeStickerInBook(
      sticker.id,
      selectedBook.id,
      selectedPageIndex,
      posX,
      posY,
      rotation
    );

    setSavingToBook(false);

    if (error) {
      console.error('Error updating sticker book:', error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowBookSelector(false);
    setSelectedBookForPlacement(null);
    setShowNewBookInput(false);
    setNewBookName('');
    router.replace({
      pathname: '/(app)/book-detail',
      params: {
        bookId: selectedBook.id,
        bookName: selectedBook.name,
        pageIndex: String(selectedPageIndex),
        placedStickerId: sticker.id,
        refresh: String(Date.now()),
      },
    });
  };

  const handleCreateNewBook = async () => {
    if (!newBookName.trim()) return;

    setSavingToBook(true);
    const { book: newBook, error: createError } = await createBook(newBookName.trim());
    setSavingToBook(false);

    if (createError || !newBook) {
      console.error('Error creating book:', createError);
      return;
    }

    setShowNewBookInput(false);
    setNewBookName('');
    setBooks((current) => [newBook, ...current]);
    setSelectedBookForPlacement(newBook);
  };

  const handleSkipBookSelection = () => {
    setShowBookSelector(false);
    setSelectedBookForPlacement(null);
    router.replace('/(app)/home');
  };

  const handleComplete = () => {
    if (pendingStickerId) {
      if (bookId && explicitPlacementPageIndex !== null) {
        router.replace({
          pathname: '/(app)/book-detail',
          params: {
            bookId,
            pageIndex: String(explicitPlacementPageIndex),
            placedStickerId: sticker?.id,
            refresh: String(Date.now()),
          },
        });
        return;
      }

      setPendingSyncMessage('Saved on this device. Save to cloud before adding to a book.');
      return;
    }

    // If bookId and pageIndex were passed, go to book-detail
    if (bookId && explicitPlacementPageIndex !== null) {
      router.replace({
        pathname: '/(app)/book-detail',
        params: {
          bookId,
          pageIndex: String(explicitPlacementPageIndex),
          placedStickerId: sticker?.id,
          refresh: String(Date.now()),
        },
      });
      return;
    }

    // If only bookId was passed, still require an explicit page choice.
    if (bookId) {
      const matchingBook = books.find((book) => book.id === bookId);
      setSelectedBookForPlacement(matchingBook ?? null);
      setShowNewBookInput(false);
      setShowBookSelector(true);
      return;
    }
    // Otherwise, show book selector. It also allows creating the first book.
    if (sticker) {
      setSelectedBookForPlacement(null);
      setShowNewBookInput(false);
      setShowBookSelector(true);
    } else {
      router.replace('/(app)/home');
    }
  };

  const handleBackToSnap = () => {
    router.replace({
      pathname: '/(app)/snap',
      params: {
        ...(bookId && { bookId }),
        ...(explicitPlacementPageIndex !== null && { pageIndex: String(explicitPlacementPageIndex) }),
      },
    });
  };

  const handlePeelAnother = () => {
    router.replace({
      pathname: '/(app)/snap',
      params: {
        ...(bookId && { bookId }),
        ...(explicitPlacementPageIndex !== null && { pageIndex: String(explicitPlacementPageIndex) }),
      },
    });
  };

  const getStatusText = () => {
    const lines = PROCESSING_LINES[processingState];
    return lines[statusLineIndex % lines.length] || '';
  };

  const isProcessing =
    processingState === 'preparing-frame' ||
    processingState === 'removing-bg' ||
    processingState === 'uploading';
  const isWaitingForStickerPreview =
    processingState === 'done' && !!stickerUrl && !dropAnimationReady;
  const showProcessingAnimation =
    isProcessing || isWaitingForStickerPreview;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Peel</Text>
      </View>

      <View style={styles.contentContainer}>
        {(processingState === 'idle' || (processingState === 'preparing-frame' && isFramedSticker)) && imageUrl && (
          <View style={styles.imageContainer}>
            {isFramedSticker ? (
              <View style={styles.framePreviewStage}>
                <FramedStickerCanvas
                  ref={framedStickerRef}
                  imageUrl={imageUrl}
                  mode={stickerFrameMode}
                  frameColor={stickerFrameColor}
                  displayWidth={framedPreviewWidth}
                  displayHeight={framedPreviewHeight}
                  onImageLoad={() => setFramePreviewReady(true)}
                />
                <Text style={styles.framePreviewLabel}>
                  {stickerFrameMode === 'rounded' ? 'Rounded frame' : stickerFrameMode === 'heart' ? 'Heart frame' : 'Star frame'}
                </Text>
              </View>
            ) : (
              <Image
                source={{ uri: imageUrl }}
                style={styles.image}
                resizeMode="contain"
              />
            )}
          </View>
        )}

        {processingState === 'done' && stickerUrl && (
          <DropAnimation
            stickerUrl={stickerUrl}
            onLanded={handleAnimationLanded}
            onReady={() => setDropAnimationReady(true)}
          />
        )}

        {showProcessingAnimation && imageUrl && (
          <View style={styles.processingContainer}>
            <PeelingAnimation imageUrl={imageUrl} />
            {(isProcessing || isWaitingForStickerPreview) && (
              <View style={styles.processingStatusCard}>
                <View style={styles.processingStatusRow}>
                  <ActivityIndicator size="small" color="#A78BFA" />
                  <Text style={styles.processingText}>{getStatusText()}</Text>
                </View>
                {processingElapsedSeconds >= 15 && (
                  <Text style={styles.processingLongText}>
                    Still working. Keep Peelzy open.
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {processingState === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>😕</Text>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}
      </View>

      <View style={[styles.actions, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24 }]}>
        {processingState !== 'done' && !isProcessing && processingState !== 'error' && (
          <Text style={styles.statusText}>{getStatusText()}</Text>
        )}

        {processingState === 'idle' && (
          <View style={styles.peelActionRow}>
            <TouchableOpacity
              onPress={handleBackToSnap}
              disabled={isProcessing}
              style={styles.peelBackButton}
            >
              <Text style={[styles.peelBackButtonText, isProcessing && styles.headerButtonDisabled]}>
                ‹ Back
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.processButton, isFramedSticker && !framePreviewReady && styles.processButtonDisabled]}
              onPress={processImage}
              disabled={isFramedSticker && !framePreviewReady}
            >
              <Text style={styles.processButtonText}>✂️ Peel</Text>
            </TouchableOpacity>
          </View>
        )}

        {processingState === 'error' && (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        )}

        {processingState === 'done' && animationComplete && (
          <View style={styles.doneActionsContainer}>
            {pendingSyncMessage && (
              <Text style={styles.pendingSyncText}>{pendingSyncMessage}</Text>
            )}
            {pendingStickerId && (
              <TouchableOpacity style={styles.pendingRetryButton} onPress={handleRetryPendingSync}>
                <Text style={styles.pendingRetryButtonText}>Retry cloud save</Text>
              </TouchableOpacity>
            )}
            <View style={styles.doneActionsRow}>
              <TouchableOpacity
                style={[
                  styles.doneButton,
                  styles.addToBookButton,
                  pendingStickerId && !(bookId && explicitPlacementPageIndex !== null) && styles.doneButtonDisabled,
                ]}
                onPress={handleComplete}
              >
                <Text style={styles.doneButtonText}>Add to Book</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.doneButton, styles.peelAnotherButton]} onPress={handlePeelAnother}>
                <Text style={styles.peelAnotherButtonText}>Peel another</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <Modal
        visible={showBookSelector}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowBookSelector(false);
          setSelectedBookForPlacement(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.bookSelectorSheet}>
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.bookSelectorHeaderRow}>
              <Text style={styles.bookSelectorTitle}>
                {selectedBookForPlacement ? 'Select Page' : 'Add to Book'}
              </Text>
              <TouchableOpacity
                style={styles.bookSelectorHeaderButton}
                onPress={() => {
                  if (selectedBookForPlacement) {
                    setSelectedBookForPlacement(null);
                    return;
                  }
                  setShowBookSelector(false);
                }}
              >
                <Text style={styles.bookSelectorHeaderButtonText}>
                  {selectedBookForPlacement ? '←' : '✕'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.bookSelectorSubtitle}>
              {selectedBookForPlacement
                ? `Choose a page in "${selectedBookForPlacement.name}"`
                : 'Choose a book for this sticker'}
            </Text>

            {loadingBooks ? (
              <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />
            ) : selectedBookForPlacement ? (
              <View style={styles.pageSelector}>
                <View style={styles.pageButtons}>
                  {[0, 1, 2, 3, 4].map((targetPageIndex) => (
                    <TouchableOpacity
                      key={targetPageIndex}
                      style={styles.pageButton}
                      onPress={() => handleSelectBookPage(selectedBookForPlacement, targetPageIndex)}
                      disabled={savingToBook}
                    >
                      {savingToBook ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.pageButtonText}>{targetPageIndex + 1}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : showNewBookInput ? (
              <View style={styles.newBookInputContainer}>
                <TextInput
                  style={styles.newBookInput}
                  placeholder="Book name"
                  placeholderTextColor="#666"
                  value={newBookName}
                  onChangeText={setNewBookName}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleCreateNewBook}
                />
                <View style={styles.newBookActions}>
                  <TouchableOpacity
                    style={styles.newBookCancelButton}
                    onPress={() => {
                      setShowNewBookInput(false);
                      setNewBookName('');
                    }}
                  >
                    <Text style={styles.newBookCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.newBookCreateButton,
                      !newBookName.trim() && styles.newBookCreateButtonDisabled
                    ]}
                    onPress={handleCreateNewBook}
                    disabled={!newBookName.trim() || savingToBook}
                  >
                    {savingToBook ? (
                      <ActivityIndicator size="small" color="#000" />
                    ) : (
                      <Text style={styles.newBookCreateText}>Create</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <FlatList
                  data={books}
                  keyExtractor={(item) => item.id}
                  style={styles.bookList}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.bookItem}
                      onPress={() => handleSelectBook(item)}
                      disabled={savingToBook}
                    >
                      <View
                        style={[
                          styles.bookColorDot,
                          { backgroundColor: item.cover_color || '#A78BFA' }
                        ]}
                      />
                      <Text style={styles.bookItemName}>{item.name}</Text>
                      <Text style={styles.bookItemCount}>
                        {item.sticker_count} sticker{item.sticker_count !== 1 ? 's' : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                  ListFooterComponent={
                    <TouchableOpacity
                      style={styles.newBookButton}
                      onPress={() => setShowNewBookInput(true)}
                    >
                      <Text style={styles.newBookButtonIcon}>+</Text>
                      <Text style={styles.newBookButtonText}>New Book</Text>
                    </TouchableOpacity>
                  }
                />

                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleSkipBookSelection}
                >
                  <Text style={styles.skipButtonText}>Skip for now</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  headerButtonDisabled: {
    opacity: 0.4,
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
    overflow: 'visible',
  },
  imageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  framePreviewStage: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
  },
  frameCanvas: {
    backgroundColor: 'transparent',
  },
  framePreviewLabel: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 14,
    fontWeight: '800',
  },
  processingContainer: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    overflow: 'visible',
    paddingHorizontal: 24,
    backgroundColor: '#111',
    zIndex: 10,
  },
  peelingContainer: {
    width: STICKER_MAX_WIDTH,
    height: STICKER_MAX_WIDTH + 60,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  peelingImageWrapper: {
    width: STICKER_MAX_WIDTH,
    height: STICKER_MAX_WIDTH,
    borderRadius: 16,
    backgroundColor: '#1a1a1a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'visible',
  },
  peelingImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  processingText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '800',
  },
  processingStatusCard: {
    minWidth: 250,
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#1b1b1b',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.45)',
    alignItems: 'center',
    gap: 7,
  },
  processingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  processingLongText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 12,
    textAlign: 'center',
  },
  dropContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 32,
  },
  dropStage: {
    width: STICKER_MAX_WIDTH + 120,
    height: STICKER_MAX_WIDTH + 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropHalo: {
    position: 'absolute',
    width: STICKER_MAX_WIDTH,
    height: STICKER_MAX_WIDTH,
    borderRadius: STICKER_MAX_WIDTH / 2,
    backgroundColor: 'rgba(167, 139, 250, 0.24)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.36)',
  },
  dropAuraGlowImage: {
    position: 'absolute',
    width: STICKER_MAX_WIDTH,
    height: STICKER_MAX_WIDTH,
  },
  dropOutlineGlowImage: {
    position: 'absolute',
    width: STICKER_MAX_WIDTH,
    height: STICKER_MAX_WIDTH,
  },
  sparkle: {
    position: 'absolute',
    color: '#F7D675',
    fontWeight: '900',
    textShadowColor: 'rgba(255, 255, 255, 0.7)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  dropStickerWrapper: {
    width: STICKER_MAX_WIDTH,
    height: STICKER_MAX_WIDTH,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  dropStickerImage: {
    width: '100%',
    height: '100%',
  },
  dropText: {
    marginTop: 32,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 22,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  errorText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    padding: 24,
    alignItems: 'center',
    gap: 16,
    minHeight: 100,
  },
  statusText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
  },
  processButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 28,
  },
  peelActionRow: {
    width: '100%',
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  peelBackButton: {
    position: 'absolute',
    left: 8,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  peelBackButtonText: {
    fontSize: 16,
    color: '#A78BFA',
    fontWeight: '800',
  },
  processButtonDisabled: {
    opacity: 0.45,
  },
  processButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: '#A78BFA',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 28,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    backgroundColor: '#A78BFA',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 28,
    minWidth: 142,
    alignItems: 'center',
  },
  doneButtonDisabled: {
    opacity: 0.5,
  },
  doneActionsContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  doneActionsRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  addToBookButton: {
    flex: 1,
    maxWidth: 180,
  },
  peelAnotherButton: {
    flex: 1,
    maxWidth: 180,
    backgroundColor: '#FFFFFF',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  peelAnotherButtonText: {
    color: '#111111',
    fontSize: 16,
    fontWeight: '700',
  },
  pendingSyncText: {
    color: '#D8D2CC',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  pendingRetryButton: {
    borderWidth: 1,
    borderColor: '#A78BFA',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pendingRetryButtonText: {
    color: '#D8C7FF',
    fontSize: 13,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  bookSelectorSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 40,
    maxHeight: '70%',
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
  },
  bookSelectorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
    marginLeft: 48,
  },
  bookSelectorHeaderRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  bookSelectorHeaderButton: {
    width: 48,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookSelectorHeaderButtonText: {
    color: '#A78BFA',
    fontSize: 22,
    fontWeight: '800',
  },
  bookSelectorSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  bookList: {
    maxHeight: 300,
    paddingHorizontal: 16,
  },
  pageSelector: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  pageButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  pageButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#A78BFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  bookItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  bookColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  bookItemName: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  bookItemCount: {
    fontSize: 14,
    color: '#666',
  },
  newBookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  newBookButtonIcon: {
    fontSize: 20,
    color: '#A78BFA',
    marginRight: 8,
  },
  newBookButtonText: {
    fontSize: 16,
    color: '#A78BFA',
    fontWeight: '500',
  },
  newBookInputContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  newBookInput: {
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  newBookActions: {
    flexDirection: 'row',
    gap: 12,
  },
  newBookCancelButton: {
    flex: 1,
    backgroundColor: '#333',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  newBookCancelText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '500',
  },
  newBookCreateButton: {
    flex: 1,
    backgroundColor: '#A78BFA',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  newBookCreateButtonDisabled: {
    opacity: 0.5,
  },
  newBookCreateText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 14,
    color: '#666',
  },
});
