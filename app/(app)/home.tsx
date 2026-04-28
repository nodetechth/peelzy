import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  TextInput,
  Alert,
  Platform,
  Keyboard,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { getBooks, getStickersInBook, createBook, updateBookName, Book, Sticker } from '../../lib/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = 220;
const CARD_HEIGHT = 280;
const TAB_BAR_HEIGHT = 80;

type BookWithStickers = Book & {
  thumbnails: string[];
};

type NewBookCard = {
  id: 'new';
  isNewCard: true;
};

type CardItem = BookWithStickers | NewBookCard;

function isNewBookCard(item: CardItem): item is NewBookCard {
  return 'isNewCard' in item && item.isNewCard;
}

function darkenColor(hex: string): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - 20);
  const g = Math.max(0, ((num >> 8) & 0xff) - 20);
  const b = Math.max(0, (num & 0xff) - 20);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [books, setBooks] = useState<BookWithStickers[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const textInputRef = useRef<TextInput>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  const cards: CardItem[] = [...books, { id: 'new', isNewCard: true }];
  const totalStickers = books.reduce((sum, book) => sum + book.sticker_count, 0);

  const fetchBooks = useCallback(async () => {
    const { books: fetchedBooks, error } = await getBooks();
    if (error) {
      console.error('Error fetching books:', error);
      setLoading(false);
      return;
    }

    const booksWithThumbnails = await Promise.all(
      fetchedBooks.map(async (book) => {
        const { stickers } = await getStickersInBook(book.id);
        const thumbnails = stickers.slice(0, 4).map((s: Sticker) => s.image_url);
        return { ...book, thumbnails };
      })
    );

    setBooks(booksWithThumbnails);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBooks();
  }, [fetchBooks]);

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

  const handleCreateBook = useCallback(async () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        '新しいシール帳',
        'シール帳の名前を入力してください',
        async (name) => {
          if (name && name.trim()) {
            const { book, error } = await createBook(name.trim());
            if (error) {
              Alert.alert('エラー', 'シール帳の作成に失敗しました');
              return;
            }
            if (book) {
              setBooks((prev) => [...prev, { ...book, thumbnails: [] }]);
              setTimeout(() => {
                scrollViewRef.current?.scrollTo({ x: books.length * CARD_WIDTH, animated: true });
              }, 100);
            }
          }
        },
        'plain-text',
        '',
        'default'
      );
    } else {
      Alert.alert(
        '新しいシール帳',
        'シール帳の名前を入力してください',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '作成',
            onPress: async () => {
              const defaultName = `シール帳 ${books.length + 1}`;
              const { book, error } = await createBook(defaultName);
              if (error) {
                Alert.alert('エラー', 'シール帳の作成に失敗しました');
                return;
              }
              if (book) {
                setBooks((prev) => [...prev, { ...book, thumbnails: [] }]);
                setTimeout(() => {
                  scrollViewRef.current?.scrollTo({ x: books.length * CARD_WIDTH, animated: true });
                }, 100);
              }
            },
          },
        ]
      );
    }
  }, [books.length]);

  const handleBookPress = useCallback((book: BookWithStickers) => {
    router.push(`/book-detail?bookId=${book.id}&bookName=${encodeURIComponent(book.name)}`);
  }, [router]);

  const handleStartEditing = useCallback((book: BookWithStickers) => {
    setEditingBookId(book.id);
    setEditingName(book.name);
    setTimeout(() => textInputRef.current?.focus(), 100);
  }, []);

  const handleFinishEditing = useCallback(async () => {
    if (!editingBookId || !editingName.trim()) {
      setEditingBookId(null);
      setEditingName('');
      return;
    }

    const { error } = await updateBookName(editingBookId, editingName.trim());
    if (error) {
      Alert.alert('エラー', '名前の更新に失敗しました');
    } else {
      setBooks((prev) =>
        prev.map((b) =>
          b.id === editingBookId ? { ...b, name: editingName.trim() } : b
        )
      );
    }
    setEditingBookId(null);
    setEditingName('');
    Keyboard.dismiss();
  }, [editingBookId, editingName]);

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

  const renderBookCard = (book: BookWithStickers) => {
    const isEditing = editingBookId === book.id;

    return (
      <TouchableOpacity
        key={book.id}
        activeOpacity={0.9}
        onPress={() => handleBookPress(book)}
        style={styles.cardTouchable}
      >
        <View style={styles.cardStack}>
          <View style={[styles.stackedCard, styles.stackedCard2]} />
          <View style={[styles.stackedCard, styles.stackedCard1]} />

          <View style={[styles.bookCard, { backgroundColor: book.cover_color || '#1e1e1e' }]}>
            <View style={[styles.spine, { backgroundColor: darkenColor(book.cover_color || '#1e1e1e') }]} />

            <View style={styles.cardContent}>
              <View style={styles.thumbnailGrid}>
                {[0, 1, 2, 3].map((i) => (
                  <View key={i} style={styles.thumbnailCell}>
                    {book.thumbnails[i] ? (
                      <Image
                        source={{ uri: book.thumbnails[i] }}
                        style={styles.thumbnailImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.thumbnailPlaceholder} />
                    )}
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={styles.nameContainer}
                onPress={() => handleStartEditing(book)}
                activeOpacity={0.7}
              >
                {isEditing ? (
                  <View style={styles.editContainer}>
                    <TextInput
                      ref={textInputRef}
                      style={styles.nameInput}
                      value={editingName}
                      onChangeText={setEditingName}
                      onBlur={handleFinishEditing}
                      onSubmitEditing={handleFinishEditing}
                      returnKeyType="done"
                      autoFocus
                      selectTextOnFocus
                    />
                    <TouchableOpacity onPress={handleFinishEditing}>
                      <Text style={styles.editIcon}>✓</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.editContainer}>
                    <Text style={styles.bookName} numberOfLines={1}>
                      {book.name}
                    </Text>
                    <Text style={styles.editIcon}>✎</Text>
                  </View>
                )}
              </TouchableOpacity>

              <Text style={styles.stickerCount}>
                {book.sticker_count} stickers
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderNewBookCard = () => (
    <TouchableOpacity
      key="new"
      activeOpacity={0.8}
      onPress={handleCreateBook}
      style={styles.cardTouchable}
    >
      <View style={styles.newBookCard}>
        <Text style={styles.newBookIcon}>+</Text>
        <Text style={styles.newBookText}>New Book</Text>
      </View>
    </TouchableOpacity>
  );

  const renderSkeletonCard = () => (
    <View style={styles.cardTouchable}>
      <View style={[styles.bookCard, styles.skeletonCard]} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>My Books</Text>
            <Text style={styles.subtitle}>- books · - stickers</Text>
          </View>
          <View style={styles.avatar} />
        </View>
        <View style={styles.swipeArea}>
          {renderSkeletonCard()}
        </View>
      </SafeAreaView>
    );
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
        <TouchableOpacity style={styles.avatar} onPress={handleLogout}>
          <Text style={styles.avatarText}>
            {user?.email?.charAt(0).toUpperCase() || '?'}
          </Text>
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
          {cards.map((card) =>
            isNewBookCard(card) ? renderNewBookCard() : renderBookCard(card)
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#888888',
    marginTop: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#A78BFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  swipeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: (SCREEN_WIDTH - CARD_WIDTH) / 2,
  },
  cardTouchable: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardStack: {
    position: 'relative',
    width: CARD_WIDTH - 40,
    height: CARD_HEIGHT - 20,
  },
  stackedCard: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
  stackedCard1: {
    transform: [{ rotate: '-2deg' }, { translateX: -4 }],
    opacity: 0.6,
  },
  stackedCard2: {
    transform: [{ rotate: '-4deg' }, { translateX: -8 }],
    opacity: 0.3,
  },
  bookCard: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  spine: {
    width: 14,
    height: '100%',
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
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
    justifyContent: 'center',
    gap: 8,
  },
  bookName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  nameInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#A78BFA',
    paddingVertical: 4,
    minWidth: 100,
  },
  editIcon: {
    fontSize: 14,
    color: '#888888',
  },
  stickerCount: {
    fontSize: 12,
    color: '#888888',
    textAlign: 'center',
  },
  newBookCard: {
    width: CARD_WIDTH - 40,
    height: CARD_HEIGHT - 20,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    borderWidth: 2,
    borderColor: '#333333',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newBookIcon: {
    fontSize: 48,
    color: '#555555',
    marginBottom: 8,
  },
  newBookText: {
    fontSize: 16,
    color: '#555555',
    fontWeight: '600',
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
    backgroundColor: '#333333',
  },
  indicatorActive: {
    width: 16,
    borderRadius: 4,
    backgroundColor: '#A78BFA',
  },
  swipeHint: {
    fontSize: 12,
    color: '#555555',
    marginTop: 12,
  },
  skeletonCard: {
    width: CARD_WIDTH - 40,
    height: CARD_HEIGHT - 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
});
