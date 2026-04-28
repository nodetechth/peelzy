import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Modal,
  Dimensions,
  ActivityIndicator,
  Alert,
  Share,
  Animated,
  PanResponder,
  ScrollView,
  SectionList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import {
  getAllStickers,
  getBooks,
  getStickersInBook,
  getUnplacedStickers,
  placeStickerInBook,
  removeStickerFromPage,
  deleteSticker,
  Book,
  Sticker,
} from '../../lib/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const GRID_GAP = 2;
const HORIZONTAL_PADDING = 16;
const CARD_SIZE = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const TAB_BAR_HEIGHT = 80;
const SMALL_STICKER_SIZE = 64;

type TabType = 'all' | 'byBook' | 'unplaced';

type BookSection = {
  book: Book;
  stickers: Sticker[];
};

export default function CollectionScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [allStickers, setAllStickers] = useState<Sticker[]>([]);
  const [unplacedStickers, setUnplacedStickers] = useState<Sticker[]>([]);
  const [bookSections, setBookSections] = useState<BookSection[]>([]);
  const [allBooks, setAllBooks] = useState<Book[]>([]);

  const [selectedSticker, setSelectedSticker] = useState<Sticker | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showPlacementSheet, setShowPlacementSheet] = useState(false);
  const [selectedBookForPlacement, setSelectedBookForPlacement] = useState<Book | null>(null);
  const [placing, setPlacing] = useState(false);

  const [showToast, setShowToast] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  const translateY = useRef(new Animated.Value(0)).current;
  const DISMISS_THRESHOLD = 150;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 10,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > DISMISS_THRESHOLD) {
          Animated.timing(translateY, {
            toValue: Dimensions.get('window').height,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            setSelectedSticker(null);
            translateY.setValue(0);
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (selectedSticker) {
      translateY.setValue(0);
    }
  }, [selectedSticker, translateY]);

  const fetchData = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const [allResult, unplacedResult, booksResult] = await Promise.all([
      getAllStickers(),
      getUnplacedStickers(),
      getBooks(),
    ]);

    setAllStickers(allResult.stickers);
    setUnplacedStickers(unplacedResult.stickers);
    setAllBooks(booksResult.books);

    const sections: BookSection[] = await Promise.all(
      booksResult.books.map(async (book) => {
        const { stickers } = await getStickersInBook(book.id);
        return { book, stickers };
      })
    );
    setBookSections(sections);

    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const showToastMessage = () => {
    setShowToast(true);
    Animated.sequence([
      Animated.timing(toastOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.delay(1300),
      Animated.timing(toastOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => setShowToast(false));
  };

  const handleShare = async () => {
    if (!selectedSticker) return;
    try {
      await Share.share({
        url: selectedSticker.image_url,
        message: 'Check out my sticker!',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handlePeelOff = async () => {
    if (!selectedSticker) return;

    const { error } = await removeStickerFromPage(selectedSticker.id);
    if (error) {
      Alert.alert('Error', 'Failed to peel off sticker.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedSticker(null);
    fetchData();
  };

  const handleDelete = () => {
    if (!selectedSticker) return;

    Alert.alert(
      'Delete Sticker',
      'Once deleted, this sticker is gone forever.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            const { error } = await deleteSticker(selectedSticker.id, selectedSticker.image_url);

            if (error) {
              Alert.alert('Error', 'Failed to delete sticker. Please try again.');
              setDeleting(false);
              return;
            }

            setSelectedSticker(null);
            setDeleting(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            fetchData();
          },
        },
      ]
    );
  };

  const handlePlaceInBook = () => {
    setShowPlacementSheet(true);
  };

  const handleSelectPage = async (bookId: string, pageIndex: number) => {
    if (!selectedSticker) return;

    setPlacing(true);
    const randomX = 0.2 + Math.random() * 0.6;
    const randomY = 0.2 + Math.random() * 0.6;
    const randomRotation = (Math.random() - 0.5) * 30;

    const { error } = await placeStickerInBook(
      selectedSticker.id,
      bookId,
      pageIndex,
      randomX,
      randomY,
      randomRotation
    );

    setPlacing(false);

    if (error) {
      Alert.alert('Error', 'Failed to place sticker.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowPlacementSheet(false);
    setSelectedBookForPlacement(null);
    setSelectedSticker(null);
    showToastMessage();
    fetchData();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getBookNameForSticker = (sticker: Sticker): string | null => {
    if (!sticker.book_id) return null;
    const book = allBooks.find((b) => b.id === sticker.book_id);
    return book?.name || null;
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(app)/home');
    }
  };

  const navigateToBookDetail = (bookId: string) => {
    router.push({ pathname: '/(app)/book-detail', params: { bookId } });
  };

  const renderStickerCell = (sticker: Sticker) => (
    <TouchableOpacity
      key={sticker.id}
      style={styles.stickerCell}
      onPress={() => setSelectedSticker(sticker)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: sticker.image_url }}
        style={styles.stickerImage}
        resizeMode="contain"
      />
    </TouchableOpacity>
  );

  const renderAllTab = () => (
    <FlatList
      data={allStickers}
      renderItem={({ item }) => renderStickerCell(item)}
      keyExtractor={(item) => item.id}
      numColumns={NUM_COLUMNS}
      columnWrapperStyle={styles.row}
      contentContainerStyle={[
        styles.gridContent,
        allStickers.length === 0 && styles.gridContentEmpty,
        { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16 },
      ]}
      showsVerticalScrollIndicator={false}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No stickers yet.</Text>
        </View>
      }
    />
  );

  const renderByBookTab = () => (
    <ScrollView
      style={styles.byBookContainer}
      contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16 }}
      showsVerticalScrollIndicator={false}
    >
      {bookSections.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No books yet.</Text>
        </View>
      ) : (
        bookSections.map((section) => (
          <View key={section.book.id} style={styles.bookSection}>
            <TouchableOpacity
              style={styles.bookSectionHeader}
              onPress={() => navigateToBookDetail(section.book.id)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.bookColorIndicator,
                  { backgroundColor: section.book.cover_color || '#A78BFA' },
                ]}
              />
              <Text style={styles.bookSectionTitle}>{section.book.name}</Text>
              <Text style={styles.bookSectionArrow}>→</Text>
            </TouchableOpacity>
            {section.stickers.length === 0 ? (
              <Text style={styles.bookEmptyText}>No stickers in this book</Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.bookStickerScroll}
              >
                {section.stickers.map((sticker) => (
                  <TouchableOpacity
                    key={sticker.id}
                    style={styles.smallStickerCell}
                    onPress={() => setSelectedSticker(sticker)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: sticker.image_url }}
                      style={styles.smallStickerImage}
                      resizeMode="contain"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderUnplacedTab = () => (
    <FlatList
      data={unplacedStickers}
      renderItem={({ item }) => renderStickerCell(item)}
      keyExtractor={(item) => item.id}
      numColumns={NUM_COLUMNS}
      columnWrapperStyle={unplacedStickers.length >= NUM_COLUMNS ? styles.row : undefined}
      contentContainerStyle={[
        styles.gridContent,
        unplacedStickers.length === 0 && styles.gridContentEmpty,
        { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16 },
      ]}
      showsVerticalScrollIndicator={false}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.allPlacedText}>All stickers are placed ✦</Text>
        </View>
      }
    />
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'all':
        return renderAllTab();
      case 'byBook':
        return renderByBookTab();
      case 'unplaced':
        return renderUnplacedTab();
    }
  };

  const isPlaced = selectedSticker?.page_index !== null && selectedSticker?.page_index !== undefined;
  const isUnplacedTab = activeTab === 'unplaced';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Collection</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'all' && styles.activeTab]}
          onPress={() => setActiveTab('all')}
        >
          <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'byBook' && styles.activeTab]}
          onPress={() => setActiveTab('byBook')}
        >
          <Text style={[styles.tabText, activeTab === 'byBook' && styles.activeTabText]}>
            By Book
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'unplaced' && styles.activeTab]}
          onPress={() => setActiveTab('unplaced')}
        >
          <Text style={[styles.tabText, activeTab === 'unplaced' && styles.activeTabText]}>
            Unplaced
          </Text>
        </TouchableOpacity>
      </View>

      {renderTabContent()}

      {/* Sticker Detail Modal */}
      <Modal
        visible={!!selectedSticker}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedSticker(null)}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[styles.modalSheet, { transform: [{ translateY }] }]}
            {...panResponder.panHandlers}
          >
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderSpacer} />
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setSelectedSticker(null)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              {selectedSticker && (
                <>
                  <View style={styles.modalImageContainer}>
                    <Image
                      source={{ uri: selectedSticker.image_url }}
                      style={styles.modalImage}
                      resizeMode="contain"
                    />
                  </View>

                  <View style={styles.metadataCard}>
                    <View style={styles.metadataRow}>
                      <Text style={styles.metadataLabel}>Created</Text>
                      <Text style={styles.metadataValue}>
                        {formatDate(selectedSticker.created_at)}
                      </Text>
                    </View>
                    {isPlaced && (
                      <>
                        <View style={styles.metadataRow}>
                          <Text style={styles.metadataLabel}>Book</Text>
                          <Text style={styles.metadataValue}>
                            {getBookNameForSticker(selectedSticker) || 'Unknown'}
                          </Text>
                        </View>
                        <View style={styles.metadataRow}>
                          <Text style={styles.metadataLabel}>Page</Text>
                          <Text style={styles.metadataValue}>
                            {(selectedSticker.page_index ?? 0) + 1}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={styles.shareButton}
                      onPress={handleShare}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.shareButtonText}>Share</Text>
                    </TouchableOpacity>

                    {isUnplacedTab ? (
                      <TouchableOpacity
                        style={styles.placeButton}
                        onPress={handlePlaceInBook}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.placeButtonText}>Place in a book ✦</Text>
                      </TouchableOpacity>
                    ) : isPlaced ? (
                      <TouchableOpacity
                        style={styles.peelOffButton}
                        onPress={handlePeelOff}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.peelOffButtonText}>Peel off</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={handleDelete}
                    activeOpacity={0.8}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <ActivityIndicator size="small" color="#ff4444" />
                    ) : (
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
            <SafeAreaView edges={['bottom']} style={styles.modalBottomSafe} />
          </Animated.View>
        </View>
      </Modal>

      {/* Book & Page Selection Sheet */}
      <Modal
        visible={showPlacementSheet}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowPlacementSheet(false);
          setSelectedBookForPlacement(null);
        }}
      >
        <View style={styles.placementOverlay}>
          <View style={styles.placementSheet}>
            <View style={styles.placementHeader}>
              <Text style={styles.placementTitle}>
                {selectedBookForPlacement ? 'Select Page' : 'Select Book'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (selectedBookForPlacement) {
                    setSelectedBookForPlacement(null);
                  } else {
                    setShowPlacementSheet(false);
                  }
                }}
              >
                <Text style={styles.placementClose}>
                  {selectedBookForPlacement ? '←' : '✕'}
                </Text>
              </TouchableOpacity>
            </View>

            {selectedBookForPlacement ? (
              <View style={styles.pageSelector}>
                <Text style={styles.pageSelectorLabel}>
                  Choose a page in "{selectedBookForPlacement.name}"
                </Text>
                <View style={styles.pageButtons}>
                  {[0, 1, 2, 3, 4].map((pageIndex) => (
                    <TouchableOpacity
                      key={pageIndex}
                      style={styles.pageButton}
                      onPress={() => handleSelectPage(selectedBookForPlacement.id, pageIndex)}
                      disabled={placing}
                    >
                      {placing ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.pageButtonText}>{pageIndex + 1}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <FlatList
                data={allBooks}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.bookList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.bookItem}
                    onPress={() => setSelectedBookForPlacement(item)}
                  >
                    <View
                      style={[
                        styles.bookColorDot,
                        { backgroundColor: item.cover_color || '#A78BFA' },
                      ]}
                    />
                    <Text style={styles.bookItemName}>{item.name}</Text>
                    <Text style={styles.bookItemCount}>
                      {item.sticker_count} sticker{item.sticker_count !== 1 ? 's' : ''}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.bookListEmpty}>No books available. Create one first!</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Toast */}
      {showToast && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>Placed ✦</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#fff',
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111',
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#A78BFA',
  },
  tabText: {
    fontSize: 13,
    color: '#555',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#A78BFA',
  },
  gridContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
  },
  gridContentEmpty: {
    flexGrow: 1,
  },
  row: {
    gap: GRID_GAP,
  },
  stickerCell: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  stickerImage: {
    width: '100%',
    height: '100%',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
  },
  allPlacedText: {
    fontSize: 18,
    color: '#A78BFA',
    fontWeight: '500',
  },
  byBookContainer: {
    flex: 1,
  },
  bookSection: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  bookSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bookColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  bookSectionTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  bookSectionArrow: {
    fontSize: 16,
    color: '#666',
  },
  bookEmptyText: {
    fontSize: 14,
    color: '#444',
    fontStyle: 'italic',
  },
  bookStickerScroll: {
    gap: 8,
  },
  smallStickerCell: {
    width: SMALL_STICKER_SIZE,
    height: SMALL_STICKER_SIZE,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  smallStickerImage: {
    width: '100%',
    height: '100%',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: '70%',
    maxHeight: '90%',
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
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  modalHeaderSpacer: {
    width: 40,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  modalBottomSafe: {
    backgroundColor: '#1a1a1a',
  },
  modalImageContainer: {
    width: 280,
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  metadataCard: {
    width: '100%',
    maxWidth: 280,
    backgroundColor: '#252525',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  metadataLabel: {
    fontSize: 14,
    color: '#666',
  },
  metadataValue: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  shareButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 24,
  },
  shareButtonText: {
    fontSize: 16,
    color: '#000',
    fontWeight: '600',
  },
  placeButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#A78BFA',
    borderRadius: 24,
  },
  placeButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  peelOffButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: '#333',
    borderRadius: 24,
  },
  peelOffButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  deleteButton: {
    marginTop: 16,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#ff4444',
    minWidth: 100,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    color: '#ff4444',
    fontWeight: '500',
  },
  placementOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  placementSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
  },
  placementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  placementTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  placementClose: {
    fontSize: 20,
    color: '#666',
  },
  pageSelector: {
    padding: 24,
  },
  pageSelectorLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
    textAlign: 'center',
  },
  pageButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  pageButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#A78BFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  bookList: {
    padding: 16,
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
  bookListEmpty: {
    textAlign: 'center',
    color: '#666',
    padding: 40,
  },
  toast: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT + 100,
    alignSelf: 'center',
    backgroundColor: '#A78BFA',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  toastText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
