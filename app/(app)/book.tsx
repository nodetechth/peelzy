import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Platform,
  PanResponder,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { updateStickerPosition } from '../../lib/storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const HEADER_HEIGHT = 100;
const CANVAS_HEIGHT = SCREEN_HEIGHT - HEADER_HEIGHT - 150;
const NUM_COLUMNS = 3;
const GRID_GAP = 8;
const CARD_SIZE = (SCREEN_WIDTH - 32 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const STICKER_SIZE = 80;

type Position = {
  x: number;
  y: number;
};

type Sticker = {
  id: string;
  image_url: string;
  created_at: string;
  metadata: {
    position?: Position;
    [key: string]: unknown;
  };
};

type RippleEffectProps = {
  x: number;
  y: number;
  onComplete: () => void;
};

function RippleEffect({ x, y, onComplete }: RippleEffectProps) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onComplete();
    });
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x - 60,
        top: y - 60,
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#FFFFFF',
        transform: [{ scale }],
        opacity,
      }}
      pointerEvents="none"
    />
  );
}

type DraggableStickerProps = {
  sticker: Sticker;
  initialX: number;
  initialY: number;
  onDragEnd: (id: string, x: number, y: number) => void;
};

function DraggableSticker({
  sticker,
  initialX,
  initialY,
  onDragEnd,
}: DraggableStickerProps) {
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  const [currentPos, setCurrentPos] = useState({ x: initialX, y: initialY });
  const [currentZIndex, setCurrentZIndex] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const positionRef = useRef({ x: initialX, y: initialY });

  useEffect(() => {
    positionRef.current = { x: initialX, y: initialY };
    setCurrentPos({ x: initialX, y: initialY });
    pan.setOffset({ x: 0, y: 0 });
    pan.setValue({ x: 0, y: 0 });
  }, [initialX, initialY]);

  const animateDropSequence = (finalX: number, finalY: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Phase 1: Quick expand (0ms)
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1.25,
        damping: 20,
        stiffness: 400,
        useNativeDriver: true,
      }),
      Animated.spring(rotate, {
        toValue: 2,
        damping: 20,
        stiffness: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Phase 2: Bounce back (80ms)
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 0.95,
          damping: 20,
          stiffness: 300,
          useNativeDriver: true,
        }),
        Animated.spring(rotate, {
          toValue: 0,
          damping: 20,
          stiffness: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Phase 3: Settle (160ms)
        Animated.spring(scale, {
          toValue: 1,
          damping: 15,
          stiffness: 200,
          useNativeDriver: true,
        }).start(() => {
          setCurrentZIndex(1);
          setIsDragging(false);
        });
      });
    });

    positionRef.current = { x: finalX, y: finalY };

    const normalizedX = Math.max(0, Math.min(1, finalX / (SCREEN_WIDTH - STICKER_SIZE)));
    const normalizedY = Math.max(0, Math.min(1, finalY / (CANVAS_HEIGHT - STICKER_SIZE)));
    onDragEnd(sticker.id, normalizedX, normalizedY);

    setRipple({ x: finalX + STICKER_SIZE / 2, y: finalY + STICKER_SIZE / 2 });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          setCurrentZIndex(999);
          setIsDragging(true);
          pan.setOffset({ x: 0, y: 0 });
          Animated.parallel([
            Animated.spring(scale, {
              toValue: 1.15,
              damping: 10,
              stiffness: 150,
              useNativeDriver: true,
            }),
            Animated.spring(rotate, {
              toValue: -6,
              damping: 10,
              stiffness: 150,
              useNativeDriver: true,
            }),
          ]).start();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        },
        onPanResponderMove: Animated.event(
          [null, { dx: pan.x, dy: pan.y }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: (_, gestureState) => {
          const finalX = Math.max(
            0,
            Math.min(SCREEN_WIDTH - STICKER_SIZE, positionRef.current.x + gestureState.dx)
          );
          const finalY = Math.max(
            0,
            Math.min(CANVAS_HEIGHT - STICKER_SIZE, positionRef.current.y + gestureState.dy)
          );

          // Calculate clamped offset
          const clampedDx = finalX - positionRef.current.x;
          const clampedDy = finalY - positionRef.current.y;

          // Snap to clamped position if needed
          if (clampedDx !== gestureState.dx || clampedDy !== gestureState.dy) {
            pan.setValue({ x: clampedDx, y: clampedDy });
          }

          // Extract offset before updating position
          pan.extractOffset();

          // Update position state to match
          setCurrentPos({ x: finalX, y: finalY });

          animateDropSequence(finalX, finalY);
        },
      }),
    []
  );

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-6, 0, 2],
    outputRange: ['-6deg', '0deg', '2deg'],
  });

  const handleRippleComplete = useCallback(() => {
    setRipple(null);
  }, []);

  const shadowStyle = Platform.OS === 'ios' && isDragging ? styles.shadow : {};

  return (
    <>
      {ripple && (
        <RippleEffect x={ripple.x} y={ripple.y} onComplete={handleRippleComplete} />
      )}
      <Animated.View
        style={[
          styles.stickerWrapper,
          {
            left: currentPos.x,
            top: currentPos.y,
            zIndex: currentZIndex,
            transform: [
              { translateX: pan.x },
              { translateY: pan.y },
              { scale },
              { rotate: rotateInterpolate },
            ],
          },
          shadowStyle,
        ]}
        {...panResponder.panHandlers}
      >
        <Image
          source={{ uri: sticker.image_url }}
          style={styles.stickerImage}
          resizeMode="cover"
        />
      </Animated.View>
    </>
  );
}

export default function BookScreen() {
  const { user } = useAuth();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);

  const fetchStickers = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('stickers')
      .select('id, image_url, created_at, metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching stickers:', error);
    } else {
      setStickers(data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchStickers();
  }, [fetchStickers]);

  const handleDragEnd = async (id: string, normalizedX: number, normalizedY: number) => {
    setStickers((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, metadata: { ...s.metadata, position: { x: normalizedX, y: normalizedY } } }
          : s
      )
    );

    const { error } = await updateStickerPosition(id, normalizedX, normalizedY);
    if (error) {
      console.error('Failed to save position:', error);
    }
  };

  const getInitialPosition = (sticker: Sticker, index: number): Position => {
    if (sticker.metadata?.position) {
      return {
        x: sticker.metadata.position.x * (SCREEN_WIDTH - STICKER_SIZE),
        y: sticker.metadata.position.y * (CANVAS_HEIGHT - STICKER_SIZE),
      };
    }
    const seededRandom = (seed: number) => {
      const x = Math.sin(seed) * 10000;
      return x - Math.floor(x);
    };
    const seed = sticker.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return {
      x: seededRandom(seed) * (SCREEN_WIDTH - STICKER_SIZE - 32) + 16,
      y: seededRandom(seed + 1) * (CANVAS_HEIGHT - STICKER_SIZE - 32) + 16,
    };
  };

  const renderGridView = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.gridContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.gridContainer}>
        {stickers.map((sticker) => (
          <TouchableOpacity
            key={sticker.id}
            style={[styles.gridItem, { width: CARD_SIZE, height: CARD_SIZE }]}
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: sticker.image_url }}
              style={styles.gridImage}
              resizeMode="cover"
            />
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  const renderCanvasView = () => (
    <View style={styles.canvas}>
      {stickers.map((sticker, index) => {
        const pos = getInitialPosition(sticker, index);
        return (
          <DraggableSticker
            key={sticker.id}
            sticker={sticker}
            initialX={pos.x}
            initialY={pos.y}
            onDragEnd={handleDragEnd}
          />
        );
      })}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📖</Text>
      <Text style={styles.emptyText}>まだシールがありません</Text>
      <Text style={styles.emptySubtext}>写真を撮ってシールを作ろう！</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>シール帳</Text>
          <Text style={styles.stickerCount}>{stickers.length}枚</Text>
        </View>
        <TouchableOpacity
          style={[styles.editButton, isEditMode && styles.editButtonActive]}
          onPress={() => setIsEditMode(!isEditMode)}
        >
          <Text style={[styles.editButtonText, isEditMode && styles.editButtonTextActive]}>
            {isEditMode ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      </View>

      {stickers.length === 0 ? (
        renderEmptyState()
      ) : isEditMode ? (
        renderCanvasView()
      ) : (
        renderGridView()
      )}

      {isEditMode && stickers.length > 0 && (
        <View style={styles.editHint}>
          <Text style={styles.editHintText}>
            ドラッグで自由に配置できます
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  stickerCount: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  editButtonActive: {
    backgroundColor: '#000',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  editButtonTextActive: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  gridContent: {
    padding: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridItem: {
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  canvas: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#fafafa',
  },
  stickerWrapper: {
    position: 'absolute',
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  stickerImage: {
    width: '100%',
    height: '100%',
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  editHint: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  editHintText: {
    fontSize: 14,
    color: '#666',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
});
