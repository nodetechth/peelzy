import { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Dimensions,
  ActivityIndicator,
  Alert,
  Share,
  Animated,
  PanResponder,
  Platform,
  InteractionManager,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import CachedStickerImage from '../../components/CachedStickerImage';
import { theme } from '../../constants/theme';
import {
  acceptExchangeProposal,
  cancelExchangeOffer,
  createExchangeOffer,
  getAllStickers,
  getBooks,
  getMyExchangeOffers,
  getStickerOwnerHistory,
  getStickerChangesSince,
  getStickerDeletionsSince,
  getStickerDisplayScale,
  getStickerThumbnailUrl,
  deleteExchangeOffer,
  placeStickerInBook,
  rejectExchangeProposal,
  removeStickerFromPage,
  deleteSticker,
  Book,
  ExchangeOffer,
  ExchangeProposal,
  Sticker,
  StickerDeletion,
  StickerOwnerHistoryEntry,
} from '../../lib/storage';
import {
  getCachedCollectionSnapshot,
  setCachedCollectionSnapshot,
} from '../../lib/collectionCache';
import { warmStickerImageCache } from '../../lib/stickerImageCache';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const GRID_GAP = 16;
const HORIZONTAL_PADDING = 30;
const CARD_SIZE = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const TAB_BAR_HEIGHT = 80;
const GRID_ROW_HEIGHT = CARD_SIZE + GRID_GAP;

type TabType = 'all' | 'unplaced' | 'offers';

const SYNC_OVERLAP_MS = 5000;

const getGridItemLayout = (_: ArrayLike<Sticker> | null | undefined, index: number) => ({
  length: GRID_ROW_HEIGHT,
  offset: Math.floor(index / NUM_COLUMNS) * GRID_ROW_HEIGHT,
  index,
});

function sortStickersByCreatedAt(stickers: Sticker[]) {
  return [...stickers].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

function getDeltaSinceTimestamp(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return value;
  return new Date(Math.max(0, time - SYNC_OVERLAP_MS)).toISOString();
}

function mergeStickerDelta(
  current: Sticker[],
  changed: Sticker[],
  deletions: StickerDeletion[]
) {
  const deletedIds = new Set(deletions.map((deletion) => deletion.sticker_id));
  const byId = new Map<string, Sticker>();

  current.forEach((sticker) => {
    if (!deletedIds.has(sticker.id)) {
      byId.set(sticker.id, sticker);
    }
  });

  changed.forEach((sticker) => {
    if (!deletedIds.has(sticker.id)) {
      byId.set(sticker.id, sticker);
    }
  });

  return sortStickersByCreatedAt([...byId.values()]);
}

type StickerCellProps = {
  sticker: Sticker;
  onPress: (sticker: Sticker) => void;
  hasActiveOffer?: boolean;
};

const StickerCell = memo(function StickerCell({ sticker, onPress, hasActiveOffer = false }: StickerCellProps) {
  const handlePress = useCallback(() => {
    onPress(sticker);
  }, [onPress, sticker]);
  const displayScale = getStickerDisplayScale(sticker);
  const imageStyle = useMemo(
    () => [
      styles.stickerImage,
      { transform: [{ scale: displayScale }] },
    ],
    [displayScale]
  );

  return (
    <TouchableOpacity
      style={styles.stickerCell}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <CachedStickerImage
        uri={getStickerThumbnailUrl(sticker)}
        style={imageStyle}
        resizeMode="contain"
      />
      {hasActiveOffer && (
        <View style={styles.stickerOfferTag}>
          <Text style={styles.stickerOfferTagText}>Offered</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

export default function CollectionScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [allStickers, setAllStickers] = useState<Sticker[]>([]);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [exchangeOffers, setExchangeOffers] = useState<ExchangeOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersLoaded, setOffersLoaded] = useState(false);
  const [lastStickerSyncAt, setLastStickerSyncAt] = useState<string | null>(null);
  const [expandedOfferId, setExpandedOfferId] = useState<string | null>(null);

  const [selectedSticker, setSelectedSticker] = useState<Sticker | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creatingOffer, setCreatingOffer] = useState(false);
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null);
  const [handlingProposalId, setHandlingProposalId] = useState<string | null>(null);
  const [showPlacementSheet, setShowPlacementSheet] = useState(false);
  const [placementSticker, setPlacementSticker] = useState<Sticker | null>(null);
  const [selectedBookForPlacement, setSelectedBookForPlacement] = useState<Book | null>(null);
  const [placing, setPlacing] = useState(false);
  const [exchangeResult, setExchangeResult] = useState<{
    sent: Sticker | null;
    received: Sticker | null;
  } | null>(null);
  const [createdOfferLink, setCreatedOfferLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const [ownerHistory, setOwnerHistory] = useState<StickerOwnerHistoryEntry[]>([]);
  const [showOwnerHistory, setShowOwnerHistory] = useState(false);
  const [loadingOwnerHistory, setLoadingOwnerHistory] = useState(false);

  const [showToast, setShowToast] = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const fetchRequestRef = useRef(0);
  const offersRequestRef = useRef(0);
  const allStickersRef = useRef<Sticker[]>([]);
  const allBooksRef = useRef<Book[]>([]);
  const exchangeOffersRef = useRef<ExchangeOffer[]>([]);
  const offersLoadedRef = useRef(false);
  const lastStickerSyncAtRef = useRef<string | null>(null);

  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const unplacedStickers = useMemo(
    () => allStickers.filter((sticker) => sticker.page_index === null),
    [allStickers]
  );
  const selectedStickerList = useMemo(
    () => (activeTab === 'unplaced' ? unplacedStickers : allStickers),
    [activeTab, allStickers, unplacedStickers]
  );
  const activeOfferByStickerId = useMemo(() => {
    const map = new Map<string, ExchangeOffer>();
    exchangeOffers.forEach((offer) => {
      const isActive = offer.status === 'active' && new Date(offer.expires_at).getTime() > Date.now();
      if (isActive) {
        map.set(offer.sticker_id, offer);
      }
    });
    return map;
  }, [exchangeOffers]);

  useEffect(() => {
    if (selectedSticker) {
      translateY.setValue(0);
      translateX.setValue(0);
    }
  }, [selectedSticker, translateX, translateY]);

  useEffect(() => {
    allStickersRef.current = allStickers;
  }, [allStickers]);

  useEffect(() => {
    allBooksRef.current = allBooks;
  }, [allBooks]);

  useEffect(() => {
    exchangeOffersRef.current = exchangeOffers;
  }, [exchangeOffers]);

  useEffect(() => {
    offersLoadedRef.current = offersLoaded;
  }, [offersLoaded]);

  useEffect(() => {
    lastStickerSyncAtRef.current = lastStickerSyncAt;
  }, [lastStickerSyncAt]);

  const warmCollectionImages = useCallback((stickers: Sticker[], offers: ExchangeOffer[] = []) => {
    warmStickerImageCache([
      ...stickers.slice(0, 30).map(getStickerThumbnailUrl),
      ...offers.slice(0, 10).flatMap((offer) => [
        offer.sticker ? getStickerThumbnailUrl(offer.sticker) : null,
        ...(offer.proposals || []).slice(0, 4).map((proposal) =>
          proposal.offered_sticker ? getStickerThumbnailUrl(proposal.offered_sticker) : null
        ),
      ]),
    ]);
  }, []);

  const cacheCollectionSnapshot = useCallback((snapshot: {
    stickers?: Sticker[];
    books?: Book[];
    exchangeOffers?: ExchangeOffer[];
    exchangeOffersLoaded?: boolean;
    lastStickerSyncAt?: string | null;
  }) => {
    if (!user?.id) return;

    setCachedCollectionSnapshot(user.id, {
      stickers: snapshot.stickers ?? allStickersRef.current,
      books: snapshot.books ?? allBooksRef.current,
      exchangeOffers: snapshot.exchangeOffers ?? exchangeOffersRef.current,
      exchangeOffersLoaded: snapshot.exchangeOffersLoaded ?? offersLoadedRef.current,
      lastStickerSyncAt: snapshot.lastStickerSyncAt ?? lastStickerSyncAtRef.current,
    });
  }, [user?.id]);

  useEffect(() => {
    let isActive = true;

    const hydrate = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      const cached = await getCachedCollectionSnapshot(user.id);
      if (!isActive || !cached) return;

      setAllStickers(cached.stickers);
      setAllBooks(cached.books);
      setExchangeOffers(cached.exchangeOffers);
      setOffersLoaded(cached.exchangeOffersLoaded);
      setLastStickerSyncAt(cached.lastStickerSyncAt);
      setLoading(false);
      warmCollectionImages(cached.stickers, cached.exchangeOffers);
    };

    hydrate();

    return () => {
      isActive = false;
    };
  }, [user?.id, warmCollectionImages]);

  const fetchOffers = useCallback(async (): Promise<ExchangeOffer[]> => {
    if (!user) {
      return [];
    }

    const requestId = offersRequestRef.current + 1;
    offersRequestRef.current = requestId;
    setOffersLoading(true);

    try {
      const offersResult = await getMyExchangeOffers();
      if (offersRequestRef.current !== requestId) return offersResult.offers;

      setExchangeOffers(offersResult.offers);
      setOffersLoaded(true);
      warmCollectionImages(allStickersRef.current, offersResult.offers);
      cacheCollectionSnapshot({ exchangeOffers: offersResult.offers, exchangeOffersLoaded: true });
      return offersResult.offers;
    } catch (error) {
      console.error('Error fetching collection offers:', error);
      return [];
    } finally {
      if (offersRequestRef.current === requestId) {
        setOffersLoading(false);
      }
    }
  }, [cacheCollectionSnapshot, user, warmCollectionImages]);

  const fetchData = useCallback(async (options?: { includeOffers?: boolean }) => {
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const requestId = fetchRequestRef.current + 1;
    fetchRequestRef.current = requestId;

    try {
      const syncCompletedAt = new Date().toISOString();
      const lastSync = lastStickerSyncAtRef.current;
      let nextStickers: Sticker[] | null = null;
      let nextSyncAt = syncCompletedAt;
      const booksPromise = getBooks();

      if (lastSync) {
        const since = getDeltaSinceTimestamp(lastSync);
        const [changesResult, deletionsResult] = await Promise.all([
          getStickerChangesSince(since),
          getStickerDeletionsSince(since),
        ]);

        if (!changesResult.error && !deletionsResult.error) {
          nextStickers = mergeStickerDelta(
            allStickersRef.current,
            changesResult.stickers,
            deletionsResult.deletions
          );
        } else {
          console.warn('Collection delta sync failed, falling back to full fetch:', {
            changesError: changesResult.error,
            deletionsError: deletionsResult.error,
          });
        }
      }

      if (!nextStickers) {
        const allResult = await getAllStickers();
        if (allResult.error) {
          throw allResult.error;
        }
        nextStickers = sortStickersByCreatedAt(allResult.stickers);
      }

      const booksResult = await booksPromise;
      if (booksResult.error) {
        throw booksResult.error;
      }

      if (fetchRequestRef.current !== requestId) return;

      setAllStickers(nextStickers);
      setAllBooks(booksResult.books);
      setLastStickerSyncAt(nextSyncAt);
      warmCollectionImages(nextStickers, exchangeOffersRef.current);
      cacheCollectionSnapshot({
        stickers: nextStickers,
        books: booksResult.books,
        lastStickerSyncAt: nextSyncAt,
      });

      if (options?.includeOffers) {
        fetchOffers();
      }
    } catch (error) {
      console.error('Error fetching collection data:', error);
    } finally {
      if (fetchRequestRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [cacheCollectionSnapshot, fetchOffers, user, warmCollectionImages]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const task = InteractionManager.runAfterInteractions(() => {
        if (isActive) {
          fetchData();
        }
      });

      return () => {
        isActive = false;
        task.cancel?.();
      };
    }, [fetchData])
  );

  useEffect(() => {
    const shouldLoadOffers =
      activeTab === 'unplaced' ||
      activeTab === 'offers' ||
      (selectedSticker?.page_index === null && selectedSticker !== null);

    if (shouldLoadOffers && !offersLoaded && !offersLoading) {
      fetchOffers();
    }
  }, [activeTab, fetchOffers, offersLoaded, offersLoading, selectedSticker]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData({ includeOffers: activeTab !== 'all' || offersLoaded });
  }, [activeTab, fetchData, offersLoaded]);

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
    fetchData({ includeOffers: offersLoaded });
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
            fetchData({ includeOffers: offersLoaded });
          },
        },
      ]
    );
  };

  const handlePlaceInBook = () => {
    if (!selectedSticker) return;

    setPlacementSticker(selectedSticker);
    setSelectedSticker(null);
    setSelectedBookForPlacement(null);
    setTimeout(() => {
      setShowPlacementSheet(true);
    }, 260);
  };

  const showNotice = (title: string, message: string) => {
    setNotice({ title, message });
  };

  const buildOfferLink = (token: string) => Linking.createURL(`/exchange/${token}`);

  const shareOfferLink = async (offer: ExchangeOffer) => {
    const url = buildOfferLink(offer.token);
    const message = `このシールと交換したい人→ ${url}`;
    setCreatedOfferLink(url);

    if (Platform.OS === 'web') {
      const webNavigator = (globalThis as {
        navigator?: {
          share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
          clipboard?: { writeText?: (text: string) => Promise<void> };
        };
      }).navigator;
      const webWindow = (globalThis as {
        alert?: (message: string) => void;
      });

      try {
        if (webNavigator?.share) {
          await webNavigator.share({
            title: 'Peelzy exchange',
            text: 'このシールと交換したい人→',
            url,
          });
          return;
        }

        if (webNavigator?.clipboard?.writeText) {
          await webNavigator.clipboard.writeText(url);
          webWindow?.alert?.('Exchange link copied to clipboard.');
          return;
        }

      } catch (error) {
        console.error('Error sharing exchange link:', error);
      }
      return;
    }

    Share.share({ url, message }).catch((error) => {
      console.error('Error sharing exchange link:', error);
    });
  };

  const createAndShareOffer = async (autoAccept: boolean) => {
    if (!selectedSticker) return;
    if (activeOfferByStickerId.has(selectedSticker.id)) {
      showNotice('Already offered', 'This sticker already has an active exchange offer.');
      return;
    }

    setCreatingOffer(true);
    const { offer, error } = await createExchangeOffer(selectedSticker.id, autoAccept);
    setCreatingOffer(false);

    if (error || !offer) {
      showNotice('Offer failed', error?.message || 'Failed to create an exchange offer.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSelectedSticker(null);
    shareOfferLink(offer);
    fetchData({ includeOffers: true });
    setActiveTab('offers');
  };

  const handleCreateOffer = async () => {
    if (!selectedSticker) return;
    const currentOffers = offersLoaded ? exchangeOffers : await fetchOffers();
    const hasActiveOffer = currentOffers.some((offer) => {
      const isActive = offer.status === 'active' && new Date(offer.expires_at).getTime() > Date.now();
      return isActive && offer.sticker_id === selectedSticker.id;
    });

    if (hasActiveOffer) {
      showNotice('Already offered', 'This sticker already has an active exchange offer.');
      return;
    }

    if (Platform.OS === 'web') {
      createAndShareOffer(false);
      return;
    }

    Alert.alert(
      'Create exchange link',
      'Manual approval lets you choose. Auto accept completes the first valid offer immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Manual approval',
          onPress: () => createAndShareOffer(false),
        },
        {
          text: 'Auto accept',
          onPress: () => createAndShareOffer(true),
        },
      ]
    );
  };

  const handleAcceptProposal = async (offer: ExchangeOffer, proposal: ExchangeProposal) => {
    setHandlingProposalId(proposal.id);
    const { error } = await acceptExchangeProposal(proposal.id);
    setHandlingProposalId(null);

    if (error) {
      Alert.alert('Error', 'Failed to complete the exchange.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setExpandedOfferId(null);
    setExchangeResult({
      sent: offer.sticker || null,
      received: proposal.offered_sticker || null,
    });
    fetchData({ includeOffers: true });
  };

  const handleRejectProposal = async (proposal: ExchangeProposal) => {
    setHandlingProposalId(proposal.id);
    const { error } = await rejectExchangeProposal(proposal.id);
    setHandlingProposalId(null);

    if (error) {
      Alert.alert('Error', 'Failed to reject the offer.');
      return;
    }

    Haptics.selectionAsync();
    fetchData({ includeOffers: true });
  };

  const handleCancelOffer = async (offer: ExchangeOffer) => {
    const { error } = await cancelExchangeOffer(offer.id);
    if (error) {
      Alert.alert('Error', 'Failed to cancel this offer.');
      return;
    }

    Haptics.selectionAsync();
    fetchData({ includeOffers: true });
  };

  const deleteOffer = async (offer: ExchangeOffer) => {
    setDeletingOfferId(offer.id);
    const { error } = await deleteExchangeOffer(offer.id);
    setDeletingOfferId(null);

    if (error) {
      Alert.alert('Error', 'Failed to delete this offer.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (expandedOfferId === offer.id) {
      setExpandedOfferId(null);
    }
    fetchData({ includeOffers: true });
  };

  const handleDeleteOffer = (offer: ExchangeOffer) => {
    const status = renderOfferStatus(offer);

    if (status !== 'active') {
      deleteOffer(offer);
      return;
    }

    Alert.alert(
      'Delete active offer?',
      'This exchange link will stop working and pending offers will be removed.',
      [
        { text: 'Keep offer', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteOffer(offer),
        },
      ]
    );
  };

  const handleSelectPage = async (bookId: string, pageIndex: number) => {
    const targetSticker = placementSticker ?? selectedSticker;
    if (!targetSticker) return;

    setPlacing(true);
    const randomX = 0.2 + Math.random() * 0.6;
    const randomY = 0.2 + Math.random() * 0.6;
    const randomRotation = (Math.random() - 0.5) * 30;

    const { error } = await placeStickerInBook(
      targetSticker.id,
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
    setPlacementSticker(null);
    setSelectedBookForPlacement(null);
    setSelectedSticker(null);
    showToastMessage();
    fetchData({ includeOffers: offersLoaded });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
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

  const handleStickerPress = useCallback((sticker: Sticker) => {
    setSelectedSticker(sticker);
  }, []);

  const handleOpenOwnerHistory = useCallback(async () => {
    if (!selectedSticker) return;

    setLoadingOwnerHistory(true);
    setShowOwnerHistory(true);
    const { history, error } = await getStickerOwnerHistory(selectedSticker.id);
    setLoadingOwnerHistory(false);

    if (error) {
      setOwnerHistory([]);
      showNotice('History unavailable', 'Could not load this sticker ownership history.');
      return;
    }

    setOwnerHistory(history);
  }, [selectedSticker]);

  const showAdjacentSticker = useCallback((direction: 1 | -1) => {
    if (!selectedSticker || selectedStickerList.length < 2) return;

    const currentIndex = selectedStickerList.findIndex((sticker) => sticker.id === selectedSticker.id);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= selectedStickerList.length) {
      Animated.spring(translateX, {
        toValue: 0,
        stiffness: 180,
        damping: 18,
        useNativeDriver: true,
      }).start();
      return;
    }

    Haptics.selectionAsync();
    Animated.timing(translateX, {
      toValue: direction * -SCREEN_WIDTH,
      duration: 140,
      useNativeDriver: true,
    }).start(() => {
      setSelectedSticker(selectedStickerList[nextIndex]);
      translateX.setValue(direction * SCREEN_WIDTH);
      Animated.spring(translateX, {
        toValue: 0,
        stiffness: 220,
        damping: 22,
        useNativeDriver: true,
      }).start();
    });
  }, [selectedSticker, selectedStickerList, translateX]);

  const closeStickerModal = useCallback(() => {
    Animated.timing(translateY, {
      toValue: SCREEN_WIDTH,
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      setSelectedSticker(null);
      translateY.setValue(0);
    });
  }, [translateY]);

  const modalPanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8,
        onPanResponderMove: (_, gestureState) => {
          if (Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy > 0) {
            translateY.setValue(gestureState.dy);
            return;
          }

          if (Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
            translateX.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          const isDownFlick =
            gestureState.dy > 90 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
          const isHorizontalFlick =
            Math.abs(gestureState.dx) > 80 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);

          if (isDownFlick) {
            closeStickerModal();
            return;
          }

          if (isHorizontalFlick) {
            showAdjacentSticker(gestureState.dx < 0 ? 1 : -1);
            translateY.setValue(0);
            return;
          }

          Animated.parallel([
            Animated.spring(translateY, {
              toValue: 0,
              stiffness: 180,
              damping: 18,
              useNativeDriver: true,
            }),
            Animated.spring(translateX, {
              toValue: 0,
              stiffness: 180,
              damping: 18,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    [closeStickerModal, showAdjacentSticker, translateX, translateY]
  );

  const renderStickerItem = useCallback(
    ({ item }: { item: Sticker }) => (
      <StickerCell
        sticker={item}
        onPress={handleStickerPress}
        hasActiveOffer={activeTab === 'unplaced' && activeOfferByStickerId.has(item.id)}
      />
    ),
    [activeOfferByStickerId, activeTab, handleStickerPress]
  );

  const renderAllTab = () => (
    <FlatList
      key="collection-all-grid"
      data={allStickers}
      renderItem={renderStickerItem}
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
      removeClippedSubviews={Platform.OS !== 'web'}
      initialNumToRender={12}
      maxToRenderPerBatch={9}
      updateCellsBatchingPeriod={40}
      windowSize={5}
      getItemLayout={getGridItemLayout}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No stickers yet.</Text>
        </View>
      }
    />
  );

  const renderUnplacedTab = () => (
    <FlatList
      key="collection-unplaced-grid"
      data={unplacedStickers}
      renderItem={renderStickerItem}
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
      removeClippedSubviews={Platform.OS !== 'web'}
      initialNumToRender={12}
      maxToRenderPerBatch={9}
      updateCellsBatchingPeriod={40}
      windowSize={5}
      getItemLayout={getGridItemLayout}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.allPlacedText}>All stickers are placed ✦</Text>
        </View>
      }
    />
  );

  const renderOfferStatus = (offer: ExchangeOffer) => {
    if (offer.status === 'active') {
      return new Date(offer.expires_at).getTime() <= Date.now() ? 'expired' : 'active';
    }

    return offer.status;
  };

  const renderOfferItem = ({ item }: { item: ExchangeOffer }) => {
    const status = renderOfferStatus(item);
    const isActive = status === 'active';
    const pendingCount = item.proposals?.filter((proposal) => proposal.status === 'pending').length ?? 0;
    const isExpanded = expandedOfferId === item.id;

    return (
      <View style={styles.offerBlock}>
        <TouchableOpacity
          style={styles.offerRow}
          onPress={() => setExpandedOfferId(isExpanded ? null : item.id)}
          activeOpacity={0.78}
        >
          <View style={styles.offerStickerFrame}>
            {item.sticker ? (
              <CachedStickerImage uri={item.sticker.image_url} style={styles.offerStickerImage} />
            ) : (
              <View style={styles.thumbnailPlaceholder} />
            )}
          </View>
          <View style={styles.offerRowContent}>
            <View style={styles.offerTitleLine}>
              <Text style={[styles.offerTitle, !isActive && styles.offerTitleInactive]}>
                Exchange offer
              </Text>
              {pendingCount > 0 && <Text style={styles.offerBadge}>{pendingCount}</Text>}
            </View>
            <View style={[styles.statusPill, isActive ? styles.statusPillActive : styles.statusPillInactive]}>
              <Text style={[styles.statusPillText, isActive ? styles.statusPillTextActive : styles.statusPillTextInactive]}>
                {status}
              </Text>
            </View>
            <Text style={styles.offerSubtext}>
              {pendingCount} offer{pendingCount === 1 ? '' : 's'} received →
            </Text>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.offerDetail}>
            <View style={styles.offerDetailActions}>
              {isActive && (
                <>
                <TouchableOpacity style={styles.offerShareButton} onPress={() => shareOfferLink(item)}>
                  <Text style={styles.offerShareButtonText}>Share link</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.offerCancelButton} onPress={() => handleCancelOffer(item)}>
                  <Text style={styles.offerCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={[styles.offerDeleteButton, !isActive && styles.offerDeleteButtonWide]}
                onPress={() => handleDeleteOffer(item)}
                disabled={deletingOfferId === item.id}
              >
                {deletingOfferId === item.id ? (
                  <ActivityIndicator size="small" color="#D95959" />
                ) : (
                  <Text style={styles.offerDeleteButtonText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>

            {item.proposals?.length ? (
              item.proposals.map((proposal) => (
                <View key={proposal.id} style={styles.proposalCard}>
                  <View style={styles.proposalHeader}>
                    <View style={styles.proposalAvatar}>
                      <Text style={styles.proposalAvatarText}>P</Text>
                    </View>
                    <Text style={styles.proposalName}>Someone</Text>
                    <Text style={styles.proposalTime}>{proposal.status}</Text>
                  </View>

                  <View style={styles.exchangePreview}>
                    <View style={styles.exchangeStickerBox}>
                      {item.sticker && (
                        <CachedStickerImage uri={item.sticker.image_url} style={styles.exchangeStickerImage} />
                      )}
                      <Text style={styles.exchangeStickerLabel}>Your sticker</Text>
                    </View>
                    <Text style={styles.exchangeArrow}>⇄</Text>
                    <View style={styles.exchangeStickerBox}>
                      {proposal.offered_sticker && (
                        <CachedStickerImage uri={proposal.offered_sticker.image_url} style={styles.exchangeStickerImage} />
                      )}
                      <Text style={styles.exchangeStickerLabel}>Their sticker</Text>
                    </View>
                  </View>

                  {proposal.status === 'pending' && isActive && (
                    <View style={styles.proposalActions}>
                      <TouchableOpacity
                        style={styles.proposalRejectButton}
                        onPress={() => handleRejectProposal(proposal)}
                        disabled={handlingProposalId === proposal.id}
                      >
                        <Text style={styles.proposalRejectText}>Decline</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.proposalAcceptButton}
                        onPress={() => handleAcceptProposal(item, proposal)}
                        disabled={handlingProposalId === proposal.id}
                      >
                        {handlingProposalId === proposal.id ? (
                          <ActivityIndicator size="small" color="#252525" />
                        ) : (
                          <Text style={styles.proposalAcceptText}>Accept ✦</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.noProposalsText}>No offers yet. Share the link to invite one.</Text>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderOffersTab = () => (
    <FlatList
      key="collection-offers-list"
      data={exchangeOffers}
      renderItem={renderOfferItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={[
        styles.offersContent,
        exchangeOffers.length === 0 && styles.gridContentEmpty,
        { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 16 },
      ]}
      showsVerticalScrollIndicator={false}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      ListHeaderComponent={
        <Text style={styles.offerIntro}>自分のシール単位でまとめています</Text>
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          {offersLoading ? (
            <ActivityIndicator color={theme.colors.purple} />
          ) : (
            <Text style={styles.emptyText}>No exchange offers yet.</Text>
          )}
        </View>
      }
    />
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'all':
        return renderAllTab();
      case 'unplaced':
        return renderUnplacedTab();
      case 'offers':
        return renderOffersTab();
    }
  };

  const isPlaced = selectedSticker?.page_index !== null && selectedSticker?.page_index !== undefined;
  const canPlaceSelectedSticker = !!selectedSticker && !isPlaced;

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
          style={[styles.tab, activeTab === 'unplaced' && styles.activeTab]}
          onPress={() => setActiveTab('unplaced')}
        >
          <Text style={[styles.tabText, activeTab === 'unplaced' && styles.activeTabText]}>
            Unplaced
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'offers' && styles.activeTab]}
          onPress={() => setActiveTab('offers')}
        >
          <View style={styles.offerTabLabel}>
            <Text style={[styles.tabText, activeTab === 'offers' && styles.activeTabText]}>
              Offers
            </Text>
            {exchangeOffers.some((offer) => offer.proposals?.some((proposal) => proposal.status === 'pending')) && (
              <View style={styles.offerTabBadge}>
                <Text style={styles.offerTabBadgeText}>
                  {exchangeOffers.reduce(
                    (sum, offer) => sum + (offer.proposals?.filter((proposal) => proposal.status === 'pending').length ?? 0),
                    0
                  )}
                </Text>
              </View>
            )}
          </View>
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
            style={[styles.modalSheet, { transform: [{ translateY }, { translateX }] }]}
          >
            <View style={styles.dragHandleContainer} {...modalPanResponder.panHandlers}>
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

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalContent,
                { paddingBottom: insets.bottom + 22 },
              ]}
              showsVerticalScrollIndicator={false}
              bounces
            >
              {selectedSticker && (
                <>
                  <View style={styles.modalImageContainer}>
                    <CachedStickerImage
                      uri={selectedSticker.image_url}
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

                  <TouchableOpacity
                    style={styles.ownerHistoryButton}
                    onPress={handleOpenOwnerHistory}
                    activeOpacity={0.82}
                  >
                    <Text style={styles.ownerHistoryButtonText}>Owner history</Text>
                    <Text style={styles.ownerHistoryButtonIcon}>→</Text>
                  </TouchableOpacity>

                  <View style={styles.primaryActions}>
                    {canPlaceSelectedSticker ? (
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

                    {!isPlaced && (
                      <TouchableOpacity
                        style={[
                          styles.exchangeOfferButton,
                          activeOfferByStickerId.has(selectedSticker.id) && styles.exchangeOfferButtonDisabled,
                        ]}
                        onPress={handleCreateOffer}
                        activeOpacity={0.8}
                        disabled={creatingOffer}
                      >
                        {creatingOffer ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.exchangeOfferButtonText}>
                            {activeOfferByStickerId.has(selectedSticker.id) ? 'Already offered' : 'Create exchange link'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={styles.secondaryActions}>
                    <TouchableOpacity
                      style={styles.shareButton}
                      onPress={handleShare}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.shareButtonText}>Share</Text>
                    </TouchableOpacity>

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
                  </View>
                </>
              )}
            </ScrollView>
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
          setPlacementSticker(null);
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
                    setPlacementSticker(null);
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

      <Modal
        visible={!!exchangeResult}
        transparent
        animationType="fade"
        onRequestClose={() => setExchangeResult(null)}
      >
        <View style={styles.exchangeResultOverlay}>
          <View style={styles.exchangeResultCard}>
            <Text style={styles.exchangeResultTitle}>Your sticker left your hands.</Text>
            <Text style={styles.exchangeResultBody}>
              It found a new home. And something new found you.
            </Text>
            <View style={styles.exchangeResultImages}>
              <View style={styles.exchangeResultImageBox}>
                {exchangeResult?.sent && (
                  <CachedStickerImage uri={exchangeResult.sent.image_url} style={styles.exchangeResultImage} />
                )}
                <Text style={styles.exchangeResultLabel}>Sent away</Text>
              </View>
              <Text style={styles.exchangeResultSpark}>→</Text>
              <View style={styles.exchangeResultImageBox}>
                {exchangeResult?.received && (
                  <CachedStickerImage uri={exchangeResult.received.image_url} style={styles.exchangeResultImage} />
                )}
                <Text style={styles.exchangeResultLabel}>Newly yours</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.exchangeResultButton}
              onPress={() => setExchangeResult(null)}
            >
              <Text style={styles.exchangeResultButtonText}>Keep it ✦</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!createdOfferLink}
        transparent
        animationType="fade"
        onRequestClose={() => setCreatedOfferLink(null)}
      >
        <View style={styles.exchangeResultOverlay}>
          <View style={styles.linkResultCard}>
            <Text style={styles.exchangeResultTitle}>Exchange link created</Text>
            <Text style={styles.exchangeResultBody}>
              Share this link with someone who wants to trade.
            </Text>
            <Text selectable style={styles.createdLinkText}>
              {createdOfferLink}
            </Text>
            <TouchableOpacity
              style={styles.exchangeResultButton}
              onPress={() => setCreatedOfferLink(null)}
            >
              <Text style={styles.exchangeResultButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!notice}
        transparent
        animationType="fade"
        onRequestClose={() => setNotice(null)}
      >
        <View style={styles.exchangeResultOverlay}>
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>{notice?.title}</Text>
            <Text style={styles.noticeBody}>{notice?.message}</Text>
            <TouchableOpacity
              style={styles.exchangeResultButton}
              onPress={() => setNotice(null)}
            >
              <Text style={styles.exchangeResultButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showOwnerHistory}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOwnerHistory(false)}
      >
        <View style={styles.ownerHistoryOverlay}>
          <View style={styles.ownerHistorySheet}>
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>
            <View style={styles.ownerHistoryHeader}>
              <View>
                <Text style={styles.ownerHistoryTitle}>Owner history</Text>
                <Text style={styles.ownerHistorySubtitle}>The path this sticker has taken</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowOwnerHistory(false)}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingOwnerHistory ? (
              <View style={styles.ownerHistoryLoading}>
                <ActivityIndicator color={theme.colors.purple} />
              </View>
            ) : ownerHistory.length === 0 ? (
              <View style={styles.ownerHistoryLoading}>
                <Text style={styles.emptyText}>No owner history yet.</Text>
              </View>
            ) : (
              <FlatList
                data={ownerHistory}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.ownerHistoryList}
                renderItem={({ item, index }) => {
                  const isCurrent = !item.released_at;
                  return (
                    <View style={styles.ownerHistoryItem}>
                      <View style={styles.ownerTimeline}>
                        <View style={[
                          styles.ownerTimelineDot,
                          isCurrent && styles.ownerTimelineDotCurrent,
                        ]} />
                        {index < ownerHistory.length - 1 && <View style={styles.ownerTimelineLine} />}
                      </View>
                      <View style={styles.ownerHistoryCard}>
                        <View style={styles.ownerHistoryCardTop}>
                          <Text style={styles.ownerName}>{item.owner_display_name}</Text>
                          {isCurrent && (
                            <View style={styles.currentOwnerPill}>
                              <Text style={styles.currentOwnerPillText}>Current</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.ownerDateLabel}>Owned from</Text>
                        <Text style={styles.ownerDateValue}>{formatDateTime(item.acquired_at)}</Text>
                        {item.released_at && (
                          <>
                            <Text style={styles.ownerDateLabel}>Passed on</Text>
                            <Text style={styles.ownerDateValue}>{formatDateTime(item.released_at)}</Text>
                          </>
                        )}
                        <Text style={styles.ownerSourceText}>
                          {item.source === 'created' ? 'Original owner' : 'Received through exchange'}
                        </Text>
                      </View>
                    </View>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 22,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 32,
    color: theme.colors.text,
  },
  headerCenter: {
    flex: 1,
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: theme.colors.text,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
    marginBottom: 28,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 4,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: theme.colors.purple,
  },
  tabText: {
    fontSize: 18,
    color: theme.colors.textMuted,
    fontWeight: '700',
  },
  activeTabText: {
    color: theme.colors.purple,
  },
  offerTabLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offerTabBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  offerTabBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  gridContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    rowGap: GRID_GAP,
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
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: '#EFE5D9',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? {} : theme.shadow.sticker),
  },
  stickerImage: {
    width: '88%',
    height: '88%',
  },
  stickerOfferTag: {
    position: 'absolute',
    right: -7,
    top: -7,
    backgroundColor: '#FFB45D',
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 3,
    borderColor: theme.colors.background,
  },
  stickerOfferTagText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 18,
    color: theme.colors.textMuted,
  },
  allPlacedText: {
    fontSize: 18,
    color: theme.colors.purple,
    fontWeight: '800',
  },
  offersContent: {
    paddingHorizontal: 18,
  },
  offerIntro: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontWeight: '800',
    paddingTop: 14,
    paddingBottom: 18,
  },
  offerBlock: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#E8DED2',
    borderRadius: 22,
    paddingHorizontal: 14,
    marginBottom: 14,
    ...theme.shadow.sticker,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
  },
  offerStickerFrame: {
    width: 72,
    height: 72,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EFE5D9',
    backgroundColor: theme.colors.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    marginRight: 18,
  },
  offerStickerImage: {
    width: '78%',
    height: '78%',
    resizeMode: 'contain',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.surfaceSoft,
  },
  offerRowContent: {
    flex: 1,
  },
  offerTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  offerTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  offerTitleInactive: {
    color: theme.colors.textMuted,
  },
  offerBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.danger,
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 24,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
    marginTop: 6,
  },
  statusPillActive: {
    backgroundColor: '#E4F8D9',
  },
  statusPillInactive: {
    backgroundColor: '#E4DED8',
  },
  statusPillText: {
    fontSize: 14,
    fontWeight: '800',
  },
  statusPillTextActive: {
    color: '#1F4D12',
  },
  statusPillTextInactive: {
    color: theme.colors.textMuted,
  },
  offerSubtext: {
    color: theme.colors.purple,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 6,
  },
  offerDetail: {
    paddingBottom: 24,
  },
  offerDetailActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  offerShareButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerShareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  offerCancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerCancelButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  offerDeleteButton: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F1C7C7',
    backgroundColor: '#FFF6F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerDeleteButtonWide: {
    maxWidth: 180,
  },
  offerDeleteButtonText: {
    color: '#D95959',
    fontSize: 15,
    fontWeight: '800',
  },
  proposalCard: {
    backgroundColor: '#FFFDF8',
    borderWidth: 1,
    borderColor: '#E8DED2',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  proposalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  proposalAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EAF8DD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  proposalAvatarText: {
    color: '#204A16',
    fontSize: 18,
    fontWeight: '800',
  },
  proposalName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  proposalTime: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  exchangePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  exchangeStickerBox: {
    flex: 1,
    minHeight: 136,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8DED2',
    backgroundColor: theme.colors.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  exchangeStickerImage: {
    width: 64,
    height: 64,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  exchangeStickerLabel: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  exchangeArrow: {
    color: theme.colors.textMuted,
    fontSize: 26,
  },
  proposalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  proposalRejectButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.line,
    justifyContent: 'center',
    alignItems: 'center',
  },
  proposalRejectText: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  proposalAcceptButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: theme.colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  proposalAcceptText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  noProposalsText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(48, 37, 31, 0.28)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    minHeight: '58%',
    maxHeight: '86%',
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: '#D9CEC2',
    borderRadius: 2,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  modalHeaderSpacer: {
    width: 40,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 2,
  },
  modalImageContainer: {
    width: Math.min(SCREEN_WIDTH * 0.54, 226),
    height: Math.min(SCREEN_WIDTH * 0.54, 226),
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#EFE5D9',
    ...theme.shadow.sticker,
  },
  modalImage: {
    width: '86%',
    height: '86%',
  },
  metadataCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metadataLabel: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  metadataValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '700',
  },
  ownerHistoryButton: {
    width: '100%',
    maxWidth: 340,
    minHeight: 44,
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: '#F1E8FF',
    borderWidth: 1,
    borderColor: '#D9C6FF',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ownerHistoryButtonText: {
    color: theme.colors.purple,
    fontSize: 15,
    fontWeight: '900',
  },
  ownerHistoryButtonIcon: {
    color: theme.colors.purple,
    fontSize: 18,
    fontWeight: '900',
  },
  primaryActions: {
    width: '100%',
    maxWidth: 340,
    gap: 10,
    marginTop: 12,
  },
  secondaryActions: {
    width: '100%',
    maxWidth: 340,
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  shareButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: '800',
  },
  placeButton: {
    width: '100%',
    minHeight: 50,
    backgroundColor: theme.colors.purple,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  peelOffButton: {
    width: '100%',
    minHeight: 50,
    backgroundColor: theme.colors.black,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  peelOffButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  exchangeOfferButton: {
    minHeight: 50,
    borderRadius: 24,
    backgroundColor: theme.colors.purple,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exchangeOfferButtonDisabled: {
    backgroundColor: '#D8D2CC',
  },
  exchangeOfferButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '800',
  },
  deleteButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: '#FFF7F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    color: theme.colors.danger,
    fontWeight: '800',
  },
  placementOverlay: {
    flex: 1,
    backgroundColor: 'rgba(48, 37, 31, 0.28)',
    justifyContent: 'flex-end',
  },
  placementSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '60%',
  },
  placementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  placementTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  placementClose: {
    fontSize: 20,
    color: theme.colors.textMuted,
  },
  pageSelector: {
    padding: 24,
  },
  pageSelectorLabel: {
    fontSize: 14,
    color: theme.colors.textMuted,
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
    backgroundColor: theme.colors.purple,
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
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.line,
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
    color: theme.colors.text,
    fontWeight: '700',
  },
  bookItemCount: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  bookListEmpty: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    padding: 40,
  },
  toast: {
    position: 'absolute',
    bottom: TAB_BAR_HEIGHT + 100,
    alignSelf: 'center',
    backgroundColor: theme.colors.purple,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  toastText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  exchangeResultOverlay: {
    flex: 1,
    backgroundColor: 'rgba(48, 37, 31, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  exchangeResultCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 28,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 22,
    alignItems: 'center',
  },
  linkResultCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 22,
    alignItems: 'center',
  },
  noticeCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 26,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 22,
    alignItems: 'center',
  },
  noticeTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  noticeBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 22,
  },
  exchangeResultTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  exchangeResultBody: {
    color: theme.colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 22,
  },
  exchangeResultImages: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  exchangeResultImageBox: {
    width: 122,
    minHeight: 134,
    borderRadius: 16,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.line,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
  exchangeResultImage: {
    width: 72,
    height: 72,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  exchangeResultLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  exchangeResultSpark: {
    color: theme.colors.purple,
    fontSize: 24,
    fontWeight: '800',
  },
  exchangeResultButton: {
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.black,
    paddingHorizontal: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exchangeResultButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  createdLinkText: {
    width: '100%',
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 14,
    marginBottom: 22,
  },
  ownerHistoryOverlay: {
    flex: 1,
    backgroundColor: 'rgba(48, 37, 31, 0.28)',
    justifyContent: 'flex-end',
  },
  ownerHistorySheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: '82%',
    minHeight: '56%',
  },
  ownerHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  ownerHistoryTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  ownerHistorySubtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  ownerHistoryLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  ownerHistoryList: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  ownerHistoryItem: {
    flexDirection: 'row',
    minHeight: 124,
  },
  ownerTimeline: {
    width: 28,
    alignItems: 'center',
  },
  ownerTimelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#D8D2CC',
    marginTop: 18,
  },
  ownerTimelineDotCurrent: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.purple,
  },
  ownerTimelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: theme.colors.line,
    marginTop: 4,
  },
  ownerHistoryCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  ownerHistoryCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  ownerName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  currentOwnerPill: {
    borderRadius: 999,
    backgroundColor: '#E4F8D9',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currentOwnerPillText: {
    color: '#1F4D12',
    fontSize: 11,
    fontWeight: '900',
  },
  ownerDateLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5,
  },
  ownerDateValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
  },
  ownerSourceText: {
    color: theme.colors.purple,
    fontSize: 13,
    fontWeight: '900',
    marginTop: 10,
  },
});
