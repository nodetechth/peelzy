import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  AppState,
  DeviceEventEmitter,
  Dimensions,
  GestureResponderEvent,
  Linking,
  Modal,
} from 'react-native';
import { CameraType, CameraView, FlashMode, FocusMode, useCameraPermissions } from 'expo-camera';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { SNAP_TAB_PRESS_EVENT } from '../../lib/snapEvents';
import { AccountStatus } from '../../lib/storage';
import { getEffectiveAccountStatus } from '../../lib/accountStatus';
import { useAuth } from '../../contexts/AuthContext';
import {
  DEFAULT_STICKER_FRAME_COLOR,
  DEFAULT_STICKER_FRAME_MODE,
  getStickerFrameLabel,
  STICKER_FRAME_COLORS,
  StickerFrameMode,
} from '../../lib/stickerFrames';
import { getStickerFrameHeartPath, getStickerFrameStarPath } from '../../lib/stickerFrameShapes';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const TAB_BAR_HEIGHT = 80;

export default function SnapScreen() {
  const { user } = useAuth();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<FlashMode>('off');
  const [exposureCompensation, setExposureCompensation] = useState(0);
  const [focusMode, setFocusMode] = useState<FocusMode>('off');
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const [cameraMountError, setCameraMountError] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [selectedFrameMode, setSelectedFrameMode] = useState<StickerFrameMode>(DEFAULT_STICKER_FRAME_MODE);
  const [selectedFrameColor, setSelectedFrameColor] = useState(DEFAULT_STICKER_FRAME_COLOR);
  const [showPlusFrameSheet, setShowPlusFrameSheet] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { bookId, pageIndex } = useLocalSearchParams<{ bookId?: string; pageIndex?: string }>();
  const isPlus = accountStatus?.plan === 'paid';
  const safeBottom = TAB_BAR_HEIGHT + insets.bottom;
  const lowerControlHeight = 74;
  const frameModeHeight = 58;
  const colorRowHeight = selectedFrameMode !== 'cutout' && isPlus ? 38 : 0;
  const stackGap = 10;
  const bottomLimit = SCREEN_HEIGHT - safeBottom - 14;
  const lowerControlsTop = bottomLimit - lowerControlHeight;
  const framePickerHeight = frameModeHeight + colorRowHeight + (colorRowHeight > 0 ? 8 : 0);
  const isFramedMode = selectedFrameMode !== 'cutout' && isPlus;
  const framePickerTop = lowerControlsTop - stackGap - framePickerHeight;
  const captureAreaTop = Math.max(insets.top + 112, 126);
  const captureAreaBottom = framePickerTop - 16;
  const captureAreaHeight = Math.max(280, captureAreaBottom - captureAreaTop);
  const cutoutSize = Math.max(280, Math.min(SCREEN_WIDTH - 28, captureAreaHeight));
  const framedMaxWidth = SCREEN_WIDTH - 12;
  const framedWidth = selectedFrameMode === 'rounded'
    ? Math.min(framedMaxWidth, captureAreaHeight / 0.75)
    : Math.min(framedMaxWidth, captureAreaHeight);
  const captureWidth = isFramedMode ? framedWidth : cutoutSize;
  const captureHeight = isFramedMode && selectedFrameMode === 'rounded'
    ? framedWidth * 0.75
    : captureWidth;
  const captureTop = captureAreaTop + Math.max(0, (captureAreaHeight - captureHeight) / 2);
  const captureLeft = (SCREEN_WIDTH - captureWidth) / 2;
  const resolvedFramePickerTop = framePickerTop;
  const frameGuideStroke = Math.max(4, Math.round(captureWidth * 0.018));

  const handleRequestCameraPermission = useCallback(async () => {
    const nextPermission = await requestPermission();
    if (!nextPermission.granted && !nextPermission.canAskAgain) {
      Alert.alert(
        'Camera access is off',
        'Open Settings and allow Peelzy to use the camera.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]
      );
    }
  }, [requestPermission]);

  const handleCapture = useCallback(async () => {
    if (isCapturing || !cameraRef.current) return;

    if (cameraMountError) {
      Alert.alert('Camera could not start', cameraMountError);
      return;
    }

    if (!isCameraReady) {
      Alert.alert('Camera is getting ready', 'Wait a moment, then tap Snap again.');
      return;
    }

    if (!permission?.granted) {
      Alert.alert(
        'Camera access needed',
        'Open Settings and allow Peelzy to use the camera.'
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });

      if (!photo?.uri) {
        Alert.alert('Oops, let\'s try that again', 'The photo could not be captured.');
        setIsCapturing(false);
        return;
      }

      const squarePhoto = await cropPhotoToViewfinder(photo, {
        top: captureTop,
        left: captureLeft,
        width: captureWidth,
        height: captureHeight,
      });

      router.push({
        pathname: '/(app)/crop',
        params: {
          photoUri: squarePhoto.uri,
          captureId: String(Date.now()),
          ...(bookId && { bookId }),
          ...(pageIndex && { pageIndex }),
          frameMode: selectedFrameMode,
          frameColor: selectedFrameColor,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      Alert.alert('Oops, let\'s try that again', errorMessage);
      console.error('Capture error:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [
    isCapturing,
    isCameraReady,
    cameraMountError,
    permission?.granted,
    bookId,
    pageIndex,
    router,
    selectedFrameColor,
    selectedFrameMode,
    captureHeight,
    captureLeft,
    captureTop,
    captureWidth,
  ]);

  const handleSelectFrameMode = useCallback((mode: StickerFrameMode) => {
    if (mode !== 'cutout' && !isPlus) {
      Haptics.selectionAsync();
      setShowPlusFrameSheet(true);
      return;
    }

    Haptics.selectionAsync();
    setSelectedFrameMode(mode);
  }, [isPlus]);

  const handleFlipCamera = useCallback(() => {
    if (isCapturing) return;

    Haptics.selectionAsync();
    setIsCameraReady(false);
    setCameraMountError(null);
    setCameraFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, [isCapturing]);

  const handleToggleFlash = useCallback(() => {
    if (isCapturing || cameraFacing === 'front') return;
    Haptics.selectionAsync();
    setFlashMode((current) => (current === 'off' ? 'on' : 'off'));
  }, [cameraFacing, isCapturing]);

  const handleCycleExposure = useCallback(() => {
    if (isCapturing) return;
    Haptics.selectionAsync();
    setExposureCompensation((current) => {
      if (current < -0.1) return 0;
      if (current < 0.1) return 1;
      return -1;
    });
  }, [isCapturing]);

  const handleFocusPress = useCallback((event: GestureResponderEvent) => {
    if (isCapturing) return;

    const { locationX, locationY } = event.nativeEvent;
    setFocusPoint({ x: locationX, y: locationY });
    setFocusMode('on');
    Haptics.selectionAsync();

    setTimeout(() => {
      setFocusMode('off');
      setFocusPoint(null);
    }, 900);
  }, [isCapturing]);

  useEffect(() => {
    if (!permission?.granted || !isFocused) return;

    setIsCameraReady(false);
    setCameraMountError(null);

    const fallback = setTimeout(() => {
      setIsCameraReady(true);
    }, 1400);

    return () => clearTimeout(fallback);
  }, [permission?.granted, isFocused, cameraFacing]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(SNAP_TAB_PRESS_EVENT, handleCapture);
    return () => subscription.remove();
  }, [handleCapture]);

  const refreshAccountStatus = useCallback(async () => {
    const { status } = await getEffectiveAccountStatus(user?.id);
    setAccountStatus(status);
  }, [user?.id]);

  useEffect(() => {
    let isActive = true;
    getEffectiveAccountStatus(user?.id).then(({ status }) => {
      if (isActive) {
        setAccountStatus(status);
      }
    });

    return () => {
      isActive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;

      getPermission().then((nextPermission) => {
        if (nextPermission.granted) {
          setCameraMountError(null);
          setIsCameraReady(false);
        }
      });
      refreshAccountStatus();
    });

    return () => subscription.remove();
  }, [getPermission, refreshAccountStatus]);

  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionText}>
          Peelzy needs the camera to turn this moment into a sticker.
        </Text>
        {permission.canAskAgain ? (
          <TouchableOpacity style={styles.permissionButton} onPress={handleRequestCameraPermission}>
            <Text style={styles.permissionButtonText}>Allow camera</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={styles.permissionDeniedText}>
              Camera access is off. Open Settings, allow Peelzy to use the camera, then come back here.
            </Text>
            <TouchableOpacity style={styles.settingsButton} onPress={() => Linking.openSettings()}>
              <Text style={styles.settingsButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        key={`${cameraFacing}-${isFocused ? 'focused' : 'blurred'}`}
        ref={cameraRef}
        style={styles.camera}
        facing={cameraFacing}
        mirror={cameraFacing === 'front'}
        active={isFocused}
        animateShutter
        flash={flashMode}
        autofocus={focusMode}
        {...({ exposureCompensation } as any)}
        onCameraReady={() => {
          setCameraMountError(null);
          setIsCameraReady(true);
        }}
        onMountError={(event) => {
          setIsCameraReady(false);
          setCameraMountError(event.message);
        }}
      />

      <Pressable
        style={styles.focusLayer}
        onPress={handleFocusPress}
        disabled={isCapturing || !isCameraReady}
      />

      {exposureCompensation !== 0 && (
        <View
          pointerEvents="none"
          style={[
            styles.brightnessOverlay,
            exposureCompensation > 0 ? styles.brightnessOverlayLight : styles.brightnessOverlayDark,
            { opacity: Math.min(0.22, Math.abs(exposureCompensation) * 0.16) },
          ]}
        />
      )}

      <View pointerEvents="none" style={styles.viewfinderMask}>
        {isFramedMode ? (
          selectedFrameMode === 'rounded' ? (
            <View
              style={[
                styles.roundedFrameGuide,
                {
                  left: captureLeft,
                  top: captureTop,
                  width: captureWidth,
                  height: captureHeight,
                  borderColor: selectedFrameColor,
                  borderWidth: frameGuideStroke,
                  borderRadius: captureHeight * 0.24,
                },
              ]}
            />
          ) : (
            <Svg
              style={[
                styles.shapeFrameGuide,
                {
                  left: captureLeft,
                  top: captureTop,
                  width: captureWidth,
                  height: captureHeight,
                },
              ]}
              viewBox={`0 0 ${captureWidth} ${captureHeight}`}
            >
              <Path
                d={
                  selectedFrameMode === 'heart'
                    ? getStickerFrameHeartPath(captureWidth)
                    : getStickerFrameStarPath(captureWidth, captureWidth * 0.48, captureWidth * 0.24)
                }
                fill="rgba(255, 255, 255, 0.08)"
                stroke={selectedFrameColor}
                strokeWidth={frameGuideStroke}
                strokeLinejoin="round"
              />
            </Svg>
          )
        ) : (
          <View
            style={[
              styles.viewfinderFrame,
              {
                top: captureTop,
                width: captureWidth,
                height: captureHeight,
              },
            ]}
          >
            <View style={styles.cornerTopLeft} />
            <View style={styles.cornerTopRight} />
            <View style={styles.cornerBottomLeft} />
            <View style={styles.cornerBottomRight} />
          </View>
        )}
      </View>

      {focusPoint && (
        <View
          pointerEvents="none"
          style={[
            styles.focusReticle,
            {
              left: focusPoint.x - 32,
              top: focusPoint.y - 32,
            },
          ]}
        />
      )}

      <View style={styles.topOverlay}>
        <Text style={styles.title}>Snap</Text>
        <Text style={styles.subtitle}>peel this moment ✦</Text>
      </View>

      <View style={[styles.framePicker, { top: resolvedFramePickerTop }]}>
        <View style={styles.frameModeRow}>
          {(['cutout', 'rounded', 'heart', 'star'] as StickerFrameMode[]).map((mode) => {
            const locked = mode !== 'cutout' && !isPlus;
            const selected = selectedFrameMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.frameModeButton,
                  selected && styles.frameModeButtonSelected,
                ]}
                onPress={() => handleSelectFrameMode(mode)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={`${getStickerFrameLabel(mode)} sticker frame`}
              >
                <Text style={[styles.frameModeIcon, selected && styles.frameModeIconSelected]}>
                  {mode === 'cutout' ? '✂' : mode === 'rounded' ? '▭' : mode === 'heart' ? '♡' : '☆'}
                </Text>
                <Text style={[styles.frameModeText, selected && styles.frameModeTextSelected]}>
                  {getStickerFrameLabel(mode)}
                </Text>
                {locked && <Text style={styles.frameLockText}>Plus</Text>}
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedFrameMode !== 'cutout' && isPlus && (
          <View style={styles.frameColorRow}>
            {STICKER_FRAME_COLORS.map((color) => {
              const selected = selectedFrameColor === color.value;
              return (
                <TouchableOpacity
                  key={color.value}
                  style={[
                    styles.frameColorButton,
                    selected && styles.frameColorButtonSelected,
                  ]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedFrameColor(color.value);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${color.label} frame color`}
                >
                  <View style={[styles.frameColorSwatch, { backgroundColor: color.value }]} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.flipButton,
          {
            position: 'absolute',
            top: 58,
            right: 22,
          },
          isCapturing && styles.flipButtonDisabled,
        ]}
        onPress={handleFlipCamera}
        activeOpacity={0.82}
        disabled={isCapturing}
        accessibilityRole="button"
        accessibilityLabel="Switch camera"
      >
        <Text style={styles.flipButtonIcon}>⇄</Text>
      </TouchableOpacity>

      <View style={[styles.bottomControls, { top: lowerControlsTop }]}>
        <TouchableOpacity
          style={[styles.secondaryControl, isCapturing && styles.controlDisabled]}
          onPress={handleCycleExposure}
          disabled={isCapturing}
          accessibilityRole="button"
          accessibilityLabel="Adjust brightness"
        >
          <Text style={styles.secondaryControlIcon}>☼</Text>
          <Text style={styles.secondaryControlText}>
            {exposureCompensation < -0.1 ? 'Dark' : exposureCompensation > 0.1 ? 'Bright' : 'Auto'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.shutterButton, (!isCameraReady || isCapturing) && styles.controlDisabled]}
          onPress={handleCapture}
          disabled={!isCameraReady || isCapturing}
          activeOpacity={0.76}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
        >
          <View style={styles.shutterInner} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secondaryControl,
            (isCapturing || cameraFacing === 'front') && styles.controlDisabled,
            flashMode === 'on' && styles.secondaryControlActive,
          ]}
          onPress={handleToggleFlash}
          disabled={isCapturing || cameraFacing === 'front'}
          accessibilityRole="button"
          accessibilityLabel="Toggle flash"
        >
          <Text style={styles.secondaryControlIcon}>⚡</Text>
          <Text style={styles.secondaryControlText}>{flashMode === 'on' ? 'On' : 'Off'}</Text>
        </TouchableOpacity>
      </View>

      {isCapturing && (
        <View style={styles.capturingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <Modal
        visible={showPlusFrameSheet}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPlusFrameSheet(false)}
      >
        <TouchableOpacity
          style={styles.plusSheetOverlay}
          activeOpacity={1}
          onPress={() => setShowPlusFrameSheet(false)}
        >
          <View style={[styles.plusSheet, { paddingBottom: insets.bottom + 22 }]}>
            <Text style={styles.plusSheetTitle}>Unlock sticker frames</Text>
            <Text style={styles.plusSheetText}>
              Heart, star, and rounded photo frames are part of Peelzy Plus.
            </Text>
            <TouchableOpacity
              style={styles.plusSheetButton}
              onPress={() => setShowPlusFrameSheet(false)}
              activeOpacity={0.84}
            >
              <Text style={styles.plusSheetButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

type CapturedPhoto = {
  uri: string;
  width?: number;
  height?: number;
};

type ViewfinderRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

async function cropPhotoToViewfinder(
  photo: CapturedPhoto,
  viewfinder: ViewfinderRect
): Promise<{ uri: string }> {
  if (!photo.width || !photo.height) {
    return { uri: photo.uri };
  }

  const previewScale = Math.max(SCREEN_WIDTH / photo.width, SCREEN_HEIGHT / photo.height);
  const displayedWidth = photo.width * previewScale;
  const displayedHeight = photo.height * previewScale;
  const offsetX = (displayedWidth - SCREEN_WIDTH) / 2;
  const offsetY = (displayedHeight - SCREEN_HEIGHT) / 2;

  const originX = Math.max(0, Math.round((viewfinder.left + offsetX) / previewScale));
  const originY = Math.max(0, Math.round((viewfinder.top + offsetY) / previewScale));
  const cropWidth = Math.min(
    photo.width - originX,
    Math.round(viewfinder.width / previewScale)
  );
  const cropHeight = Math.min(
    photo.height - originY,
    Math.round(viewfinder.height / previewScale)
  );

  const result = await ImageManipulator.manipulateAsync(
    photo.uri,
    [
      {
        crop: {
          originX,
          originY,
          width: cropWidth,
          height: cropHeight,
        },
      },
    ],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return { uri: result.uri };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  focusLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  brightnessOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  brightnessOverlayLight: {
    backgroundColor: '#FFFFFF',
  },
  brightnessOverlayDark: {
    backgroundColor: '#000000',
  },
  viewfinderMask: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  viewfinderFrame: {
    position: 'absolute',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.68)',
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#fff',
    borderTopLeftRadius: 8,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#fff',
    borderTopRightRadius: 8,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#fff',
    borderBottomLeftRadius: 8,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#fff',
    borderBottomRightRadius: 8,
  },
  frameGuideLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  roundedFrameGuide: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  shapeFrameGuide: {
    position: 'absolute',
  },
  topOverlay: {
    position: 'absolute',
    top: 58,
    left: 24,
    right: 24,
    zIndex: 4,
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.78)',
    fontSize: 13,
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  flipButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  flipButtonDisabled: {
    opacity: 0.42,
  },
  flipButtonIcon: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  focusReticle: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    zIndex: 6,
  },
  framePicker: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 5,
  },
  frameModeRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  frameModeButton: {
    width: 76,
    height: 58,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 7,
  },
  frameModeButtonSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  frameModeIcon: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 20,
  },
  frameModeIconSelected: {
    color: '#111111',
  },
  frameModeText: {
    marginTop: 2,
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 9,
    fontWeight: '900',
  },
  frameModeTextSelected: {
    color: '#111111',
  },
  frameLockText: {
    marginTop: 1,
    color: '#CDBBFF',
    fontSize: 8,
    fontWeight: '900',
  },
  frameColorRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 9,
  },
  frameColorButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameColorButtonSelected: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  frameColorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  bottomControls: {
    position: 'absolute',
    left: 22,
    right: 22,
    height: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  shutterButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterInner: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
  },
  secondaryControl: {
    width: 70,
    height: 52,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryControlActive: {
    backgroundColor: 'rgba(167, 139, 250, 0.82)',
    borderColor: 'rgba(255, 255, 255, 0.62)',
  },
  secondaryControlIcon: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 21,
  },
  secondaryControlText: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
  },
  controlDisabled: {
    opacity: 0.42,
  },
  capturingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  plusSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    justifyContent: 'flex-end',
  },
  plusSheet: {
    backgroundColor: '#FDFBF7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
  },
  plusSheetTitle: {
    color: '#111111',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
  },
  plusSheetText: {
    marginTop: 10,
    color: '#7E756E',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  plusSheetButton: {
    marginTop: 22,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#8B6EF3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusSheetButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0b0b0b',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  permissionTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  permissionText: {
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
  },
  permissionButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  permissionDeniedText: {
    color: '#ff8a8a',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  settingsButton: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.34)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  settingsButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
