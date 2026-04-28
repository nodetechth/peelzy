import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Modal,
  Image,
  Alert,
  Platform,
  FlatList,
  PanResponder,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  getStickersInBookByPage,
  getUnplacedStickers,
  updateStickerLayout,
  removeStickerFromPage,
  placeStickerInBook,
  Sticker,
} from '../../lib/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STICKER_SIZE = 80;
const CANVAS_MARGIN = 16;
const NUM_COLUMNS = 3;
const GRID_GAP = 8;
const PICKER_CARD_SIZE = (SCREEN_WIDTH - 32 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

const SWIPE_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 200;

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

type Pages = Record<number, Sticker[]>;

type PageCanvasProps = {
  stickers: Sticker[];
  isArranging: boolean;
  onStickerMove: (id: string, pos_x: number, pos_y: number, rotation: number) => void;
  onStickerDelete: (id: string) => void;
  onStickerPeelOff: (id: string) => void;
  canvasWidth: number;
  canvasHeight: number;
  newlyPlacedId: string | null;
};

function PageCanvas({
  stickers,
  isArranging,
  onStickerMove,
  onStickerDelete,
  onStickerPeelOff,
  canvasWidth,
  canvasHeight,
  newlyPlacedId,
}: PageCanvasProps) {
  const [selectedSticker, setSelectedSticker] = useState<Sticker | null>(null);

  const handleStickerTap = useCallback((sticker: Sticker) => {
    if (!isArranging) {
      setSelectedSticker(sticker);
    }
  }, [isArranging]);

  const handlePeelOff = useCallback(async () => {
    if (!selectedSticker) return;

    const stickerId = selectedSticker.id;
    setSelectedSticker(null);
    onStickerPeelOff(stickerId);
  }, [selectedSticker, onStickerPeelOff]);

  const handleDelete = useCallback((sticker: Sticker) => {
    Alert.alert(
      'Delete Sticker',
      'Are you sure you want to delete this sticker?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onStickerDelete(sticker.id),
        },
      ]
    );
  }, [onStickerDelete]);

  if (stickers.length === 0) {
    return (
      <View style={styles.emptyPage}>
        <View style={styles.emptyIcon}>
          <Text style={styles.emptyIconText}>+</Text>
        </View>
        <Text style={styles.emptyText}>
          This page is empty.{'\n'}Snap something to fill it up ✦
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.pageCanvasContainer}>
      {stickers.map((sticker) => (
        <DraggableSticker
          key={sticker.id}
          sticker={sticker}
          isArranging={isArranging}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          onTap={() => handleStickerTap(sticker)}
          onMove={onStickerMove}
          onDelete={() => handleDelete(sticker)}
          isNewlyPlaced={sticker.id === newlyPlacedId}
        />
      ))}

      <Modal
        visible={selectedSticker !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedSticker(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedSticker(null)}
        >
          <View style={styles.modalContent}>
            {selectedSticker && (
              <>
                <Image
                  source={{ uri: selectedSticker.image_url }}
                  style={styles.modalImage}
                  resizeMode="contain"
                />
                <TouchableOpacity
                  style={styles.peelOffButton}
                  onPress={handlePeelOff}
                >
                  <Text style={styles.peelOffButtonText}>Peel off</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setSelectedSticker(null)}
                >
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

type DraggableStickerProps = {
  sticker: Sticker;
  isArranging: boolean;
  canvasWidth: number;
  canvasHeight: number;
  onTap: () => void;
  onMove: (id: string, pos_x: number, pos_y: number, rotation: number) => void;
  onDelete: () => void;
  isNewlyPlaced: boolean;
};

function DraggableSticker({
  sticker,
  isArranging,
  canvasWidth,
  canvasHeight,
  onTap,
  onMove,
  onDelete,
  isNewlyPlaced,
}: DraggableStickerProps) {
  const posX = sticker.pos_x ?? 0.5;
  const posY = sticker.pos_y ?? 0.5;
  const stickerRotation = sticker.rotation ?? 0;

  const initialX = (posX * canvasWidth) - STICKER_SIZE / 2;
  const initialY = (posY * canvasHeight) - STICKER_SIZE / 2;

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  const [currentPos, setCurrentPos] = useState({ x: initialX, y: initialY });
  const [currentZIndex, setCurrentZIndex] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const positionRef = useRef({ x: initialX, y: initialY });

  useEffect(() => {
    const newX = (posX * canvasWidth) - STICKER_SIZE / 2;
    const newY = (posY * canvasHeight) - STICKER_SIZE / 2;
    positionRef.current = { x: newX, y: newY };
    setCurrentPos({ x: newX, y: newY });
    pan.setOffset({ x: 0, y: 0 });
    pan.setValue({ x: 0, y: 0 });

    if (isNewlyPlaced) {
      Animated.sequence([
        Animated.spring(scale, {
          toValue: 1.25,
          damping: 20,
          stiffness: 400,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 0.95,
          damping: 20,
          stiffness: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          damping: 15,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [posX, posY, canvasWidth, canvasHeight, isNewlyPlaced]);

  const savePosition = useCallback((finalX: number, finalY: number) => {
    const normalizedX = Math.max(0, Math.min(1, (finalX + STICKER_SIZE / 2) / canvasWidth));
    const normalizedY = Math.max(0, Math.min(1, (finalY + STICKER_SIZE / 2) / canvasHeight));
    onMove(sticker.id, normalizedX, normalizedY, stickerRotation);
    updateStickerLayout(sticker.id, {
      pos_x: normalizedX,
      pos_y: normalizedY,
      rotation: stickerRotation,
    });
  }, [sticker.id, canvasWidth, canvasHeight, stickerRotation, onMove]);

  const animateDropSequence = useCallback((finalX: number, finalY: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
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
      ]),
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
      ]),
      Animated.spring(scale, {
        toValue: 1,
        damping: 15,
        stiffness: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentZIndex(1);
      setIsDragging(false);
    });

    positionRef.current = { x: finalX, y: finalY };
    savePosition(finalX, finalY);
  }, [savePosition]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => isArranging,
        onMoveShouldSetPanResponder: () => isArranging,
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
            Math.min(canvasWidth - STICKER_SIZE, positionRef.current.x + gestureState.dx)
          );
          const finalY = Math.max(
            0,
            Math.min(canvasHeight - STICKER_SIZE, positionRef.current.y + gestureState.dy)
          );

          const clampedDx = finalX - positionRef.current.x;
          const clampedDy = finalY - positionRef.current.y;

          if (clampedDx !== gestureState.dx || clampedDy !== gestureState.dy) {
            pan.setValue({ x: clampedDx, y: clampedDy });
          }

          pan.extractOffset();
          setCurrentPos({ x: finalX, y: finalY });
          animateDropSequence(finalX, finalY);
        },
      }),
    [isArranging, canvasWidth, canvasHeight, animateDropSequence]
  );

  const handlePress = useCallback(() => {
    if (!isArranging) {
      onTap();
    }
  }, [isArranging, onTap]);

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-6, 0, 2],
    outputRange: ['-6deg', '0deg', '2deg'],
  });

  const shadowStyle = Platform.OS === 'ios' && isDragging ? styles.shadow : {};

  return (
    <Animated.View
      style={[
        styles.draggableSticker,
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
      <TouchableOpacity
        activeOpacity={isArranging ? 1 : 0.8}
        onPress={handlePress}
        disabled={isArranging}
      >
        <Image
          source={{ uri: sticker.image_url }}
          style={[
            styles.stickerImage,
            { transform: [{ rotate: `${stickerRotation}deg` }] },
          ]}
          resizeMode="contain"
        />
      </TouchableOpacity>
      {isArranging && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={onDelete}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.deleteButtonText}>×</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

export default function BookDetailScreen() {
  const router = useRouter();
  const { bookId, bookName } = useLocalSearchParams<{ bookId: string; bookName?: string }>();

  const [currentPage, setCurrentPage] = useState(0);
  const [pages, setPages] = useState<Pages>({});
  const [loading, setLoading] = useState(true);
  const [isArrangeMode, setIsArrangeMode] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showUnplacedPicker, setShowUnplacedPicker] = useState(false);
  const [unplacedStickers, setUnplacedStickers] = useState<Sticker[]>([]);
  const [loadingUnplaced, setLoadingUnplaced] = useState(false);
  const [newlyPlacedId, setNewlyPlacedId] = useState<string | null>(null);

  const swipeAnim = useRef(new Animated.Value(0)).current;

  const fetchAllPages = useCallback(async () => {
    if (!bookId) return;

    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) => getStickersInBookByPage(bookId, i))
      );

      const pagesData: Pages = {};
      results.forEach((result, index) => {
        pagesData[index] = result.stickers;
      });

      setPages(pagesData);
    } catch (error) {
      console.error('Error fetching pages:', error);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    fetchAllPages();
  }, [fetchAllPages]);

  const goToPage = useCallback((page: number) => {
    if (page < 0 || page > 4) return;
    Haptics.selectionAsync();
    setCurrentPage(page);
    setIsArrangeMode(false);
    Animated.spring(swipeAnim, {
      toValue: 0,
      stiffness: 180,
      damping: 20,
      useNativeDriver: true,
    }).start();
  }, [swipeAnim]);

  const pagePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (isArrangeMode) return false;
          const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5;
          return isHorizontal && Math.abs(gestureState.dx) > 10;
        },
        onPanResponderMove: (_, gestureState) => {
          swipeAnim.setValue(gestureState.dx);
        },
        onPanResponderRelease: (_, gestureState) => {
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
    [isArrangeMode, currentPage, goToPage, swipeAnim]
  );

  const handleStickerMove = useCallback((id: string, pos_x: number, pos_y: number, rotation: number) => {
    setPages((prev) => {
      const newPages = { ...prev };
      const pageStickers = newPages[currentPage] || [];
      newPages[currentPage] = pageStickers.map((s) =>
        s.id === id ? { ...s, pos_x, pos_y, rotation } : s
      );
      return newPages;
    });
  }, [currentPage]);

  const handleStickerDelete = useCallback((id: string) => {
    setPages((prev) => {
      const newPages = { ...prev };
      const pageStickers = newPages[currentPage] || [];
      newPages[currentPage] = pageStickers.filter((s) => s.id !== id);
      return newPages;
    });
  }, [currentPage]);

  const handleStickerPeelOff = useCallback(async (id: string) => {
    await removeStickerFromPage(id);
    setPages((prev) => {
      const newPages = { ...prev };
      const pageStickers = newPages[currentPage] || [];
      newPages[currentPage] = pageStickers.filter((s) => s.id !== id);
      return newPages;
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [currentPage]);

  const handleCanvasLayout = useCallback((event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    setCanvasSize({
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
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
      return newPages;
    });

    setNewlyPlacedId(sticker.id);
    setTimeout(() => setNewlyPlacedId(null), 500);

    setShowUnplacedPicker(false);
    setUnplacedStickers([]);
  }, [bookId, currentPage]);

  const handleSnapNowFromPicker = useCallback(() => {
    setShowUnplacedPicker(false);
    router.push(`/snap?bookId=${bookId}&pageIndex=${currentPage}`);
  }, [router, bookId, currentPage]);

  const renderPageIndicator = () => {
    return (
      <View style={styles.indicatorContainer}>
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
        <Text style={[styles.pageText, isArrangeMode && styles.pageTextArranging]}>
          {isArrangeMode ? 'arranging — drag to move' : `Page ${currentPage + 1} of 5`}
        </Text>
      </View>
    );
  };

  const renderCanvas = () => {
    const stickers = pages[currentPage] || [];

    return (
      <View style={styles.canvasContainer}>
        {currentPage > 0 && !isArrangeMode && (
          <TouchableOpacity
            style={[styles.arrowButton, styles.arrowLeft]}
            onPress={() => goToPage(currentPage - 1)}
          >
            <Text style={styles.arrowText}>{'<'}</Text>
          </TouchableOpacity>
        )}

        <Animated.View
          style={[
            styles.canvas,
            { transform: [{ translateX: swipeAnim }] },
          ]}
          onLayout={handleCanvasLayout}
          {...pagePanResponder.panHandlers}
        >
          {canvasSize.width > 0 && (
            <PageCanvas
              stickers={stickers}
              isArranging={isArrangeMode}
              onStickerMove={handleStickerMove}
              onStickerDelete={handleStickerDelete}
              onStickerPeelOff={handleStickerPeelOff}
              canvasWidth={canvasSize.width}
              canvasHeight={canvasSize.height}
              newlyPlacedId={newlyPlacedId}
            />
          )}
        </Animated.View>

        {currentPage < 4 && !isArrangeMode && (
          <TouchableOpacity
            style={[styles.arrowButton, styles.arrowRight]}
            onPress={() => goToPage(currentPage + 1)}
          >
            <Text style={styles.arrowText}>{'>'}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddButtonPress}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderUnplacedItem = ({ item }: { item: Sticker }) => (
    <TouchableOpacity
      style={styles.pickerItem}
      onPress={() => handleSelectUnplacedSticker(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.image_url }}
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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>{'<'} Books</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {bookName || 'Book'}
        </Text>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => setIsArrangeMode(!isArrangeMode)}
        >
          <Text style={[styles.editButtonText, isArrangeMode && styles.editButtonTextActive]}>
            {isArrangeMode ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      </View>

      {renderPageIndicator()}
      {renderCanvas()}

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
    backgroundColor: '#111111',
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 70,
  },
  backText: {
    fontSize: 16,
    color: '#A78BFA',
    fontWeight: '500',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  editButton: {
    minWidth: 70,
    alignItems: 'flex-end',
  },
  editButtonText: {
    fontSize: 16,
    color: '#A78BFA',
    fontWeight: '500',
  },
  editButtonTextActive: {
    color: '#A78BFA',
  },
  indicatorContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 14,
    backgroundColor: '#A78BFA',
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#333',
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
  },
  canvas: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    marginHorizontal: CANVAS_MARGIN,
    marginBottom: 16,
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  pageCanvasContainer: {
    flex: 1,
    position: 'relative',
  },
  emptyPage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyIconText: {
    fontSize: 24,
    color: '#333',
  },
  emptyText: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    lineHeight: 22,
  },
  draggableSticker: {
    position: 'absolute',
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    borderRadius: 8,
    overflow: 'visible',
  },
  stickerImage: {
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    borderRadius: 8,
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
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  addButton: {
    position: 'absolute',
    right: 32,
    bottom: 32,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#A78BFA',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  addButtonText: {
    fontSize: 32,
    color: '#FFFFFF',
    fontWeight: '300',
    marginTop: -2,
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
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  sheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1e1e',
    borderWidth: 0.5,
    borderColor: '#2a2a2a',
    borderRadius: 12,
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
    color: '#FFFFFF',
    fontWeight: '500',
  },
  sheetButtonTextPurple: {
    fontSize: 16,
    color: '#A78BFA',
    fontWeight: '500',
  },
  sheetCancelButton: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  sheetCancelText: {
    fontSize: 16,
    color: '#666',
  },
  pickerContainer: {
    flex: 1,
    backgroundColor: '#111111',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  pickerBackText: {
    fontSize: 24,
    color: '#A78BFA',
  },
  pickerTitle: {
    fontSize: 16,
    color: '#FFFFFF',
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
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  pickerSnapButton: {
    backgroundColor: '#A78BFA',
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
    backgroundColor: '#1e1e1e',
  },
  pickerItemImage: {
    width: '100%',
    height: '100%',
  },
});
