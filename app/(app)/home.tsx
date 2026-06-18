import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  TextInput,
  Alert,
  Platform,
  Keyboard,
  ScrollView,
  Modal,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { useAuth } from '../../contexts/AuthContext';
import {
  getBooksForHome,
  getStickerImageUrlsInBookPage,
  createBook,
  updateBookSettings,
  BookHomeSummary,
  AccountStatus,
  createBillingCheckoutSession,
  createBillingPortalSession,
  syncBillingStatus,
} from '../../lib/storage';
import { getEffectiveAccountStatus } from '../../lib/accountStatus';
import { theme } from '../../constants/theme';
import BookCover, {
  COVER_ACCENT_COLORS,
  CoverTheme,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_COVER_THEME,
  AccentColor,
} from '../../components/BookCover';
import { normalizeAccentColor } from '../../components/BookCover/utils';
import {
  configureRevenueCat,
  isRevenueCatConfigured,
  purchasePeelzyPlus,
  restorePeelzyPlus,
  syncRevenueCatStatus,
} from '../../lib/revenuecat';
import { warmStickerImageCache } from '../../lib/stickerImageCache';
import LaunchSplash from '../../components/LaunchSplash';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(340, SCREEN_WIDTH * 0.82);
const CARD_HEIGHT = 430;
const TAB_BAR_HEIGHT = 80;
const COVER_THEMES: Array<{ id: CoverTheme; label: string }> = [
  { id: 'classic', label: 'Classic' },
  { id: 'brutalist', label: 'Brutalist' },
  { id: 'film', label: 'Film' },
];

type BookWithStickers = BookHomeSummary;

type NewBookCard = {
  id: 'new';
  isNewCard: true;
};

type CardItem = BookWithStickers | NewBookCard;

function isNewBookCard(item: CardItem): item is NewBookCard {
  return 'isNewCard' in item && item.isNewCard;
}

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<BookWithStickers[]>([]);
  const [loading, setLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [bookSettingsMode, setBookSettingsMode] = useState<'create' | 'edit' | null>(null);
  const [bookSettingsTarget, setBookSettingsTarget] = useState<BookWithStickers | null>(null);
  const [bookFormName, setBookFormName] = useState('');
  const [bookFormTheme, setBookFormTheme] = useState<CoverTheme>(DEFAULT_COVER_THEME);
  const [bookFormAccent, setBookFormAccent] = useState<AccentColor>(DEFAULT_ACCENT_COLOR);
  const [bookFormPageColor, setBookFormPageColor] = useState<AccentColor>(DEFAULT_ACCENT_COLOR);
  const [savingBookSettings, setSavingBookSettings] = useState(false);
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const prefetchedBookIdsRef = useRef(new Set<string>());

  const cards: CardItem[] = [...books, { id: 'new', isNewCard: true }];
  const totalStickers = books.reduce((sum, book) => sum + book.sticker_count, 0);

  const fetchBooks = useCallback(async () => {
    const [booksResult, accountResult] = await Promise.all([
      getBooksForHome(),
      getEffectiveAccountStatus(user?.id),
    ]);
    const { books: fetchedBooks, error } = booksResult;

    if (!accountResult.error) {
      setAccountStatus(accountResult.status);
    }

    if (error) {
      console.error('Error fetching books:', error);
      setLoading(false);
      return;
    }

    setBooks(fetchedBooks);
    warmStickerImageCache(fetchedBooks.flatMap((book) => book.thumbnails.map((sticker) => sticker.image_url)));
    setLoading(false);
  }, [user?.id]);

  const prefetchFirstPage = useCallback(async (bookId: string) => {
    if (prefetchedBookIdsRef.current.has(bookId)) return;
    prefetchedBookIdsRef.current.add(bookId);

    const { urls, error } = await getStickerImageUrlsInBookPage(bookId, 0);
    if (error) {
      prefetchedBookIdsRef.current.delete(bookId);
      console.warn('Error prefetching first book page:', error);
      return;
    }

    warmStickerImageCache(urls);
  }, []);

  useEffect(() => {
    const currentBook = books[currentIndex];
    if (!currentBook) return;
    prefetchFirstPage(currentBook.id);
  }, [books, currentIndex, prefetchFirstPage]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const refresh = async () => {
        if (isRevenueCatConfigured()) {
          await syncRevenueCatStatus();
        } else {
          await syncBillingStatus();
        }
        if (isActive) {
          fetchBooks();
        }
      };

      refresh();

      return () => {
        isActive = false;
      };
    }, [fetchBooks])
  );

  useFocusEffect(
    useCallback(() => {
      if (user?.id && isRevenueCatConfigured()) {
        configureRevenueCat(user.id).catch((error) => {
          console.warn('RevenueCat configure failed:', error);
        });
      }
    }, [user?.id])
  );

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / CARD_WIDTH);
    if (index !== currentIndex && index >= 0 && index < cards.length) {
      setCurrentIndex(index);
    }
  }, [currentIndex, cards.length]);

  const handleMomentumScrollEnd = useCallback((event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / CARD_WIDTH);
    setCurrentIndex(Math.max(0, Math.min(index, cards.length - 1)));
  }, [cards.length]);

  const openCreateBookSettings = useCallback(() => {
    setBookSettingsMode('create');
    setBookSettingsTarget(null);
    setBookFormName(`New Book ${books.length + 1}`);
    setBookFormTheme(DEFAULT_COVER_THEME);
    setBookFormAccent(DEFAULT_ACCENT_COLOR);
    setBookFormPageColor(DEFAULT_ACCENT_COLOR);
  }, [books.length]);

  const handleBookPress = useCallback((book: BookWithStickers) => {
    prefetchFirstPage(book.id);
    router.push(`/book-detail?bookId=${book.id}&bookName=${encodeURIComponent(book.name)}`);
  }, [prefetchFirstPage, router]);

  const openEditBookSettings = useCallback((book: BookWithStickers) => {
    setBookSettingsMode('edit');
    setBookSettingsTarget(book);
    setBookFormName(book.name);
    setBookFormTheme(book.theme || DEFAULT_COVER_THEME);
    setBookFormAccent(normalizeAccentColor(book.accent_color || book.cover_color));
    setBookFormPageColor(normalizeAccentColor(book.page_color || book.accent_color || book.cover_color));
  }, []);

  const closeBookSettings = useCallback(() => {
    setBookSettingsMode(null);
    setBookSettingsTarget(null);
    setBookFormName('');
    Keyboard.dismiss();
  }, []);

  const handleSaveBookSettings = useCallback(async () => {
    const name = bookFormName.trim();
    if (!name) {
      Alert.alert('エラー', 'Book名を入力してください');
      return;
    }

    setSavingBookSettings(true);
    if (bookSettingsMode === 'create') {
      const { book, error } = await createBook(name, {
        theme: bookFormTheme,
        accentColor: bookFormAccent,
        pageColor: bookFormPageColor,
      });
      setSavingBookSettings(false);

      if (error || !book) {
        Alert.alert('エラー', 'シール帳の作成に失敗しました');
        return;
      }

      setBooks((prev) => [...prev, { ...book, thumbnails: [] }]);
      closeBookSettings();
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: books.length * CARD_WIDTH, animated: true });
      }, 100);
      return;
    }

    if (!bookSettingsTarget) {
      setSavingBookSettings(false);
      closeBookSettings();
      return;
    }

    const { error } = await updateBookSettings(bookSettingsTarget.id, {
      name,
      theme: bookFormTheme,
      accentColor: bookFormAccent,
      pageColor: bookFormPageColor,
    });
    setSavingBookSettings(false);

    if (error) {
      console.error('Error updating book settings:', error);
      Alert.alert('エラー', 'Book設定の更新に失敗しました');
      return;
    }

      setBooks((prev) =>
        prev.map((b) =>
          b.id === bookSettingsTarget.id
            ? { ...b, name, theme: bookFormTheme, accent_color: bookFormAccent, page_color: bookFormPageColor }
            : b
        )
      );
    closeBookSettings();
  }, [
    bookFormAccent,
    bookFormName,
    bookFormPageColor,
    bookFormTheme,
    bookSettingsMode,
    bookSettingsTarget,
    books.length,
    closeBookSettings,
  ]);

  const handleLogout = () => {
    Alert.alert(
      'ログアウト',
      'ログアウトしますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'ログアウト', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const formatPeriodEnd = (value?: string) => {
    if (!value) return '';
    return new Date(value).toLocaleDateString('ja-JP', {
      month: 'long',
      day: 'numeric',
    });
  };

  const openBillingUrl = async (url: string | null) => {
    if (!url) {
      Alert.alert('エラー', 'Stripeのリンクを作成できませんでした');
      return;
    }

    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('エラー', 'Stripeのリンクを開けませんでした');
      return;
    }

    await Linking.openURL(url);
  };

  const handleBillingPress = async () => {
    if (Platform.OS !== 'web' && isRevenueCatConfigured()) {
      if (!user?.id) return;

      setBillingLoading(true);
      const result = await purchasePeelzyPlus(user.id);
      await fetchBooks();
      setBillingLoading(false);

      if (result.error) {
        Alert.alert('購入に失敗しました', result.error.message);
        return;
      }

      if (result.isPlus) {
        Alert.alert('Peelzy Plus', 'Plusプランが有効になりました。');
      }
      return;
    }

    setBillingLoading(true);
    const returnUrl = Platform.OS === 'web' ? ExpoLinking.createURL('/home') : 'peelzy://home';
    const result = accountStatus?.plan === 'paid'
      ? await createBillingPortalSession(returnUrl)
      : await createBillingCheckoutSession(returnUrl);
    setBillingLoading(false);

    if (result.error) {
      Alert.alert('エラー', 'Stripeへの接続に失敗しました');
      return;
    }

    await openBillingUrl(result.url);
  };

  const handleRestorePurchases = async () => {
    if (!user?.id) return;
    if (!isRevenueCatConfigured()) {
      Alert.alert('設定が必要です', 'RevenueCatのAPIキーが設定されていません。');
      return;
    }

    setBillingLoading(true);
    const result = await restorePeelzyPlus(user.id);
    await fetchBooks();
    setBillingLoading(false);

    if (result.error) {
      Alert.alert('復元に失敗しました', result.error.message);
      return;
    }

    Alert.alert(
      '購入を復元',
      result.isPlus ? 'Plusプランを復元しました。' : '有効なPlusプランは見つかりませんでした。'
    );
  };

  const renderBookCard = (book: BookWithStickers, index: number) => {
    const coverTheme = book.theme || DEFAULT_COVER_THEME;
    const accentColor = normalizeAccentColor(book.accent_color || book.cover_color);

    return (
      <View key={book.id} style={styles.cardTouchable}>
        <BookCover
          bookName={book.name}
          stickerCount={book.sticker_count}
          stickers={book.thumbnails}
          theme={coverTheme}
          accentColor={accentColor}
          width={CARD_WIDTH - 34}
          height={CARD_HEIGHT - 36}
          onPress={() => handleBookPress(book)}
        />
        <TouchableOpacity
          style={styles.bookMenuButton}
          onPress={() => openEditBookSettings(book)}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel="Edit book cover"
        >
          <Text style={styles.bookMenuText}>•••</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderNewBookCard = () => (
    <TouchableOpacity
      key="new"
      activeOpacity={0.8}
      onPress={openCreateBookSettings}
      style={styles.cardTouchable}
    >
      <View style={styles.newBookCard}>
        <Text style={styles.newBookIcon}>+</Text>
        <Text style={styles.newBookText}>New Book</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return <LaunchSplash />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>My Books</Text>
          <Text style={styles.subtitle}>
            {books.length} books · {totalStickers} stickers
          </Text>
        </View>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => setShowSettings(true)}
          activeOpacity={0.82}
        >
          <Text style={styles.settingsButtonText}>•••</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.swipeArea, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom }]}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={CARD_WIDTH}
          decelerationRate="fast"
          contentContainerStyle={styles.scrollContent}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
        >
          {cards.map((card, index) =>
            isNewBookCard(card) ? renderNewBookCard() : renderBookCard(card, index)
          )}
        </ScrollView>

        <View style={styles.indicatorContainer}>
          {cards.map((_, index) => (
            <View
              key={index}
              style={[
                styles.indicator,
                index === currentIndex && styles.indicatorActive,
              ]}
            />
          ))}
        </View>
        <Text style={styles.swipeHint}>swipe to switch</Text>
      </View>

      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.settingsSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.settingsHeader}>
              <View>
                <Text style={styles.settingsTitle}>Account</Text>
                <Text style={styles.settingsSubtitle}>Plan and login settings</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowSettings(false)}
                activeOpacity={0.75}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.planCard}>
              <View style={styles.planCardTop}>
                <View>
                  <Text style={styles.planLabel}>プラン</Text>
                  <Text style={styles.planName}>
                    {accountStatus?.plan === 'paid' ? '有料' : '無料'}
                  </Text>
                </View>
                <View style={[
                  styles.planBadge,
                  accountStatus?.plan === 'paid' && styles.planBadgePaid,
                ]}>
                  <Text style={[
                    styles.planBadgeText,
                    accountStatus?.plan === 'paid' && styles.planBadgeTextPaid,
                  ]}>
                    {accountStatus?.plan === 'paid' ? 'PLUS' : 'FREE'}
                  </Text>
                </View>
              </View>

              <View style={styles.usageBarTrack}>
                <View
                  style={[
                    styles.usageBarFill,
                    {
                      width: `${Math.min(
                        100,
                        ((accountStatus?.stickers_used ?? 0) / (accountStatus?.sticker_limit || 5)) * 100
                      )}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.usageText}>
                今月 {accountStatus?.stickers_used ?? 0} / {accountStatus?.sticker_limit ?? 5} 枚
                {accountStatus?.period_end ? ` · ${formatPeriodEnd(accountStatus.period_end)}にリセット` : ''}
              </Text>
            </View>

            <View style={styles.settingsRow}>
              <Text style={styles.settingsRowLabel}>ログイン情報</Text>
              <Text style={styles.settingsRowValue} numberOfLines={1}>
                {user?.email ?? 'Unknown'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.billingButton}
              onPress={handleBillingPress}
              disabled={billingLoading}
              activeOpacity={0.84}
            >
              {billingLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.billingButtonText}>
                  {accountStatus?.plan === 'paid'
                    ? isRevenueCatConfigured() ? 'Plusは有効です' : '請求を管理'
                    : 'Plusにアップグレード · $2.99/月'}
                </Text>
              )}
            </TouchableOpacity>

            {Platform.OS !== 'web' && isRevenueCatConfigured() && (
              <TouchableOpacity
                style={styles.restoreButton}
                onPress={handleRestorePurchases}
                disabled={billingLoading}
                activeOpacity={0.78}
              >
                <Text style={styles.restoreButtonText}>購入を復元</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.78}
            >
              <Text style={styles.logoutButtonText}>ログアウト</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!bookSettingsMode}
        transparent
        animationType="slide"
        onRequestClose={closeBookSettings}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.bookSettingsSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.settingsHeader}>
              <View>
                <Text style={styles.settingsTitle}>
                  {bookSettingsMode === 'create' ? 'New Book' : 'Book Settings'}
                </Text>
                <Text style={styles.settingsSubtitle}>Name, cover style, and color</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeBookSettings}
                activeOpacity={0.75}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.formLabel}>Book name</Text>
              <TextInput
                ref={textInputRef}
                style={styles.bookNameField}
                value={bookFormName}
                onChangeText={setBookFormName}
                placeholder="Book name"
                placeholderTextColor={theme.colors.textMuted}
                returnKeyType="done"
              />

              <Text style={styles.formLabel}>Cover style</Text>
              <View style={styles.coverThemeGrid}>
                {COVER_THEMES.map((coverTheme) => (
                  <TouchableOpacity
                    key={coverTheme.id}
                    style={[
                      styles.coverThemeOption,
                      bookFormTheme === coverTheme.id && styles.coverThemeOptionActive,
                    ]}
                    onPress={() => setBookFormTheme(coverTheme.id)}
                    activeOpacity={0.84}
                  >
                    <BookCover
                      bookName={bookFormName || 'Book'}
                      stickerCount={bookSettingsTarget?.sticker_count ?? 0}
                      stickers={bookSettingsTarget?.thumbnails ?? []}
                      theme={coverTheme.id}
                      accentColor={bookFormAccent}
                      width={86}
                      height={108}
                      preview
                    />
                    <Text style={[
                      styles.coverThemeLabel,
                      bookFormTheme === coverTheme.id && styles.coverThemeLabelActive,
                    ]}>
                      {coverTheme.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.formLabel}>Cover color</Text>
              <View style={styles.colorPickerRow}>
                {COVER_ACCENT_COLORS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      bookFormAccent === color && styles.colorSwatchActive,
                      bookFormTheme === 'film' && styles.colorSwatchMuted,
                    ]}
                    onPress={() => setBookFormAccent(color)}
                    activeOpacity={0.84}
                  />
                ))}
              </View>
              {bookFormTheme === 'film' && (
                <Text style={styles.colorHelp}>Film keeps its black frame, but this color is saved for later style changes.</Text>
              )}

              <Text style={styles.formLabel}>Page color</Text>
              <View style={styles.colorPickerRow}>
                {COVER_ACCENT_COLORS.map((color) => (
                  <TouchableOpacity
                    key={`page-${color}`}
                    style={[
                      styles.colorSwatch,
                      { backgroundColor: color },
                      bookFormPageColor === color && styles.colorSwatchActive,
                    ]}
                    onPress={() => setBookFormPageColor(color)}
                    activeOpacity={0.84}
                  />
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.saveBookButton,
                  (!bookFormName.trim() || savingBookSettings) && styles.saveBookButtonDisabled,
                ]}
                onPress={handleSaveBookSettings}
                disabled={!bookFormName.trim() || savingBookSettings}
                activeOpacity={0.86}
              >
                {savingBookSettings ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBookButtonText}>
                    {bookSettingsMode === 'create' ? 'Create Book' : 'Save Changes'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 42,
    paddingBottom: 18,
  },
  title: {
    fontFamily: theme.fonts.black,
    fontSize: 38,
    fontWeight: '900',
    color: theme.colors.text,
    letterSpacing: 0,
  },
  subtitle: {
    fontSize: 18,
    color: theme.colors.textMuted,
    marginTop: 8,
    fontWeight: '600',
  },
  settingsButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow.soft,
  },
  settingsButtonText: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '900',
    color: theme.colors.purple,
  },
  swipeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Math.max(24, (SCREEN_WIDTH - CARD_WIDTH) / 2),
  },
  cardTouchable: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookMenuButton: {
    position: 'absolute',
    top: 28,
    right: 18,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(232, 222, 210, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow.soft,
  },
  bookMenuText: {
    color: theme.colors.purple,
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '900',
  },
  cardStack: {
    position: 'relative',
    width: CARD_WIDTH - 34,
    height: CARD_HEIGHT - 36,
  },
  stackedCard: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.surfaceSoft,
    borderRadius: 24,
  },
  stackedCard1: {
    transform: [{ rotate: '-2deg' }, { translateX: -4 }],
    opacity: 0.6,
    backgroundColor: '#E9D6FF',
  },
  stackedCard2: {
    transform: [{ rotate: '-4deg' }, { translateX: -8 }],
    opacity: 0.3,
    backgroundColor: '#D8BBFF',
  },
  bookCard: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    flexDirection: 'row',
    ...theme.shadow.soft,
  },
  spine: {
    width: 18,
    height: '100%',
    opacity: 0.62,
  },
  coverHighlight: {
    position: 'absolute',
    left: 28,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  cardContent: {
    flex: 1,
    padding: 18,
    justifyContent: 'space-between',
  },
  coverStickerLayer: {
    flex: 1,
    position: 'relative',
  },
  coverSticker: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 6,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow.sticker,
  },
  coverStickerImage: {
    width: '100%',
    height: '100%',
  },
  coverStickerOne: {
    top: 28,
    left: 16,
    transform: [{ rotate: '-10deg' }],
  },
  coverStickerTwo: {
    top: 120,
    right: 16,
    transform: [{ rotate: '9deg' }],
  },
  coverStickerThree: {
    top: 178,
    left: 28,
    transform: [{ rotate: '-4deg' }],
  },
  coverStickerFour: {
    top: 60,
    right: 36,
    transform: [{ rotate: '13deg' }],
  },
  thumbnailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  thumbnailCell: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
  },
  nameContainer: {
    marginTop: 12,
  },
  editContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  bookName: {
    fontSize: 30,
    fontWeight: '900',
    color: theme.colors.text,
    textAlign: 'left',
    flexShrink: 1,
  },
  nameInput: {
    fontSize: 24,
    fontWeight: '900',
    color: theme.colors.text,
    textAlign: 'left',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.purple,
    paddingVertical: 4,
    minWidth: 140,
  },
  editIcon: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  stickerCountPill: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: theme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 9,
  },
  stickerCount: {
    fontSize: 17,
    color: '#fff',
    fontWeight: '900',
    textAlign: 'center',
  },
  newBookCard: {
    width: CARD_WIDTH - 34,
    height: CARD_HEIGHT - 36,
    borderRadius: 24,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: '#D9C6F8',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newBookIcon: {
    fontSize: 48,
    color: theme.colors.purple,
    marginBottom: 8,
  },
  newBookText: {
    fontSize: 16,
    color: theme.colors.textMuted,
    fontWeight: '800',
  },
  indicatorContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D8D2CC',
  },
  indicatorActive: {
    width: 16,
    borderRadius: 4,
    backgroundColor: theme.colors.purple,
  },
  swipeHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(48, 37, 31, 0.28)',
    justifyContent: 'flex-end',
  },
  settingsSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  bookSettingsSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 8,
    maxHeight: '88%',
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D7D0C8',
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  settingsTitle: {
    color: theme.colors.text,
    fontSize: 30,
    fontWeight: '900',
  },
  settingsSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.surfaceSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
  },
  planCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 18,
    marginBottom: 12,
    ...theme.shadow.soft,
  },
  planCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  planLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  planName: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '900',
    marginTop: 2,
  },
  planBadge: {
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceSoft,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  planBadgePaid: {
    backgroundColor: '#EFE4FF',
    borderColor: '#D6B7FF',
  },
  planBadgeText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  planBadgeTextPaid: {
    color: theme.colors.purple,
  },
  usageBarTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E6DED6',
    overflow: 'hidden',
  },
  usageBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.purple,
  },
  usageText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 10,
  },
  settingsRow: {
    minHeight: 62,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  settingsRowLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4,
  },
  settingsRowValue: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  billingButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  billingButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  restoreButton: {
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  restoreButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  logoutButton: {
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: theme.colors.surfaceSoft,
  },
  logoutButtonText: {
    color: '#C54D4D',
    fontSize: 16,
    fontWeight: '900',
  },
  formLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 18,
    marginBottom: 8,
  },
  bookNameField: {
    height: 54,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: 16,
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  coverThemeGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  coverThemeOption: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: theme.colors.surface,
    padding: 8,
    alignItems: 'center',
  },
  coverThemeOptionActive: {
    borderColor: theme.colors.black,
    backgroundColor: '#FFFDF8',
  },
  coverThemeLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
  coverThemeLabelActive: {
    color: theme.colors.text,
  },
  colorPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: 'rgba(26, 26, 26, 0.08)',
  },
  colorSwatchActive: {
    borderColor: theme.colors.black,
    borderWidth: 3,
  },
  colorSwatchMuted: {
    opacity: 0.52,
  },
  colorHelp: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
    fontWeight: '700',
  },
  saveBookButton: {
    height: 54,
    borderRadius: 27,
    backgroundColor: theme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 10,
  },
  saveBookButtonDisabled: {
    opacity: 0.48,
  },
  saveBookButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
  },
});
