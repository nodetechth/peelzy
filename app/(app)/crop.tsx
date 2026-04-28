import { useState, useEffect, useRef } from 'react';
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
import { getPhotoUrl, uploadSticker, Sticker, getBooks, Book, createBook } from '../../lib/storage';
import { removeBackground } from '../../lib/clipdrop';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import * as Haptics from 'expo-haptics';

const TAB_BAR_HEIGHT = 80;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const STICKER_MAX_WIDTH = 280;

type ProcessingState = 'idle' | 'removing-bg' | 'uploading' | 'done' | 'error';

function PeelingAnimation({ imageUrl }: { imageUrl: string }) {
  const animValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(animValue, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(animValue, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
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

  const scaleY = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.95],
  });

  const shadowOpacity = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0.2, 0.5],
  });

  const shadowRadius = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [8, 20],
  });

  return (
    <View style={styles.peelingContainer}>
      <Animated.View
        style={[
          styles.peelingImageWrapper,
          {
            transform: [
              { translateY },
              { scaleY },
            ],
            shadowOpacity,
            shadowRadius,
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
};

function DropAnimation({ stickerUrl, onLanded }: DropAnimationProps) {
  const translateY = useRef(new Animated.Value(-300)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const [imageLoaded, setImageLoaded] = useState(false);
  const animationStarted = useRef(false);

  const startAnimation = () => {
    if (animationStarted.current) return;
    animationStarted.current = true;

    Animated.spring(translateY, {
      toValue: 0,
      damping: 8,
      stiffness: 80,
      useNativeDriver: true,
    }).start(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

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
          Animated.spring(scale, {
            toValue: 1,
            damping: 15,
            stiffness: 200,
            useNativeDriver: true,
          }).start(() => {
            onLanded();
          });
        });
      });

      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    });
  };

  useEffect(() => {
    if (imageLoaded) {
      startAnimation();
    }
  }, [imageLoaded]);

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-6, 0, 2],
    outputRange: ['-6deg', '0deg', '2deg'],
  });

  return (
    <View style={styles.dropContainer}>
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
      <Animated.Text style={[styles.dropText, { opacity: textOpacity }]}>
        This one satisfies you.
      </Animated.Text>
    </View>
  );
}

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

export default function CropScreen() {
  const { photoPath, bookId, pageIndex } = useLocalSearchParams<{
    photoPath: string;
    bookId?: string;
    pageIndex?: string;
  }>();
  const router = useRouter();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [stickerUrl, setStickerUrl] = useState<string | null>(null);
  const [sticker, setSticker] = useState<Sticker | null>(null);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showBookSelector, setShowBookSelector] = useState(false);
  const [books, setBooks] = useState<Book[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [showNewBookInput, setShowNewBookInput] = useState(false);
  const [newBookName, setNewBookName] = useState('');
  const [savingToBook, setSavingToBook] = useState(false);

  const imageUrl = photoPath ? getPhotoUrl(photoPath) : null;

  const fetchBooks = async () => {
    setLoadingBooks(true);
    const { books: fetchedBooks } = await getBooks();
    setBooks(fetchedBooks);
    setLoadingBooks(false);
  };

  const processImage = async () => {
    if (!imageUrl || !user || !photoPath) {
      setErrorMessage('Image information is missing.');
      setProcessingState('error');
      return;
    }

    setProcessingState('removing-bg');
    setErrorMessage(null);

    try {
      const { base64, error: bgError } = await removeBackground(imageUrl);

      if (bgError || !base64) {
        throw new Error(bgError?.message || 'Failed to remove background');
      }

      setProcessingState('uploading');

      const metadata = {
        capturedAt: new Date().toISOString(),
        originalPhotoPath: photoPath,
      };

      const { sticker: newSticker, error: uploadError } = await uploadSticker(
        base64,
        user.id,
        metadata
      );

      if (uploadError || !newSticker) {
        throw new Error(uploadError?.message || 'Failed to save sticker');
      }

      // If bookId and pageIndex were passed, place sticker directly on the page
      if (bookId && pageIndex !== undefined) {
        const pos_x = randomBetween(0.2, 0.8);
        const pos_y = randomBetween(0.2, 0.8);
        const rotation = randomBetween(-15, 15);

        await supabase
          .from('stickers')
          .update({
            book_id: bookId,
            page_index: parseInt(pageIndex, 10),
            pos_x,
            pos_y,
            rotation,
          })
          .eq('id', newSticker.id);
      } else if (bookId) {
        // If only bookId was passed (legacy flow), assign to book without page
        await supabase
          .from('stickers')
          .update({ book_id: bookId })
          .eq('id', newSticker.id);
      }

      setSticker(newSticker);
      setStickerUrl(newSticker.image_url);
      setProcessingState('done');
    } catch (error) {
      setProcessingState('error');
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong peeling this one.'
      );
    }
  };

  const handleAnimationLanded = () => {
    setAnimationComplete(true);
    fetchBooks();
  };

  const handleSelectBook = async (selectedBookId: string) => {
    if (!sticker) return;

    setSavingToBook(true);
    const { error } = await supabase
      .from('stickers')
      .update({ book_id: selectedBookId })
      .eq('id', sticker.id);

    setSavingToBook(false);

    if (error) {
      console.error('Error updating sticker book:', error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowBookSelector(false);
    router.replace('/(app)/home');
  };

  const handleCreateNewBook = async () => {
    if (!newBookName.trim() || !sticker) return;

    setSavingToBook(true);
    const { book: newBook, error: createError } = await createBook(newBookName.trim());

    if (createError || !newBook) {
      console.error('Error creating book:', createError);
      setSavingToBook(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('stickers')
      .update({ book_id: newBook.id })
      .eq('id', sticker.id);

    setSavingToBook(false);

    if (updateError) {
      console.error('Error updating sticker book:', updateError);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowBookSelector(false);
    setShowNewBookInput(false);
    setNewBookName('');
    router.replace('/(app)/home');
  };

  const handleSkipBookSelection = () => {
    setShowBookSelector(false);
    router.replace('/(app)/home');
  };

  const handleComplete = () => {
    // If bookId and pageIndex were passed, go to book-detail
    if (bookId && pageIndex !== undefined) {
      router.replace(`/(app)/book-detail?bookId=${bookId}`);
      return;
    }
    // If only bookId was passed, go to collection
    if (bookId) {
      router.replace({ pathname: '/(app)/collection', params: { bookId } });
      return;
    }
    // Otherwise, show book selector if books exist
    if (sticker && books.length > 0) {
      setShowBookSelector(true);
    } else {
      router.replace('/(app)/home');
    }
  };

  const getStatusText = () => {
    switch (processingState) {
      case 'removing-bg':
        return 'detecting edges...';
      case 'uploading':
        return 'saving sticker...';
      case 'done':
        return '';
      case 'error':
        return '';
      default:
        return 'Tap "Peel" to remove the background';
    }
  };

  const isProcessing = processingState === 'removing-bg' || processingState === 'uploading';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} disabled={isProcessing}>
          <Text style={[styles.headerButton, isProcessing && styles.headerButtonDisabled]}>
            ←
          </Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Peel</Text>
        <TouchableOpacity
          onPress={handleComplete}
          disabled={isProcessing || processingState !== 'done'}
        >
          <Text style={[
            styles.headerButton,
            (isProcessing || processingState !== 'done') && styles.headerButtonDisabled
          ]}>
            Done
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.contentContainer}>
        {processingState === 'idle' && imageUrl && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              resizeMode="contain"
            />
          </View>
        )}

        {(processingState === 'removing-bg' || processingState === 'uploading') && imageUrl && (
          <View style={styles.processingContainer}>
            <PeelingAnimation imageUrl={imageUrl} />
            <Text style={styles.processingText}>{getStatusText()}</Text>
          </View>
        )}

        {processingState === 'done' && stickerUrl && (
          <DropAnimation
            stickerUrl={stickerUrl}
            onLanded={handleAnimationLanded}
          />
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
        {processingState !== 'done' && processingState !== 'removing-bg' && processingState !== 'uploading' && processingState !== 'error' && (
          <Text style={styles.statusText}>{getStatusText()}</Text>
        )}

        {processingState === 'idle' && (
          <TouchableOpacity style={styles.processButton} onPress={processImage}>
            <Text style={styles.processButtonText}>✂️ Peel</Text>
          </TouchableOpacity>
        )}

        {processingState === 'error' && (
          <TouchableOpacity style={styles.retryButton} onPress={processImage}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        )}

        {processingState === 'done' && animationComplete && (
          <TouchableOpacity style={styles.doneButton} onPress={handleComplete}>
            <Text style={styles.doneButtonText}>
              {books.length > 0 ? 'Add to Book' : 'Done'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={showBookSelector}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBookSelector(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.bookSelectorSheet}>
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>

            <Text style={styles.bookSelectorTitle}>Add to Book</Text>
            <Text style={styles.bookSelectorSubtitle}>
              Choose a book for this sticker
            </Text>

            {loadingBooks ? (
              <ActivityIndicator color="#fff" style={{ marginTop: 24 }} />
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
                      onPress={() => handleSelectBook(item.id)}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  headerButton: {
    fontSize: 16,
    color: '#A78BFA',
    fontWeight: '600',
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
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    overflow: 'visible',
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
    marginTop: 24,
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  dropContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 32,
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
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 28,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    marginTop: 8,
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
