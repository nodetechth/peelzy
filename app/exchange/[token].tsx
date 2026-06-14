import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import {
  createExchangeProposal,
  ExchangeOffer,
  getExchangeOfferByToken,
  getUnplacedStickers,
  Sticker,
} from '../../lib/storage';

const NUM_COLUMNS = 3;
const GRID_GAP = 8;

export default function ExchangeLinkScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { token } = useLocalSearchParams<{ token: string }>();

  const [offer, setOffer] = useState<ExchangeOffer | null>(null);
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const fetchExchange = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    const [offerResult, stickersResult] = await Promise.all([
      getExchangeOfferByToken(token),
      getUnplacedStickers(),
    ]);

    if (offerResult.error) {
      console.error('Error fetching exchange offer:', offerResult.error);
    }

    setOffer(offerResult.offer);
    setStickers(stickersResult.stickers);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    fetchExchange();
  }, [fetchExchange]);

  const handleSubmit = async () => {
    if (!token || !selectedStickerId) return;

    setSubmitting(true);
    const { error } = await createExchangeProposal(token, selectedStickerId);
    setSubmitting(false);

    if (error) {
      Alert.alert('Error', 'Could not send this exchange offer.');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSent(true);
  };

  const isExpired = offer ? new Date(offer.expires_at).getTime() <= Date.now() : false;
  const isOwnOffer = !!offer && offer.owner_id === user?.id;
  const isUnavailable = !offer || offer.status !== 'active' || isExpired || isOwnOffer;

  const renderSticker = ({ item }: { item: Sticker }) => {
    const selected = item.id === selectedStickerId;

    return (
      <TouchableOpacity
        style={[styles.choiceCell, selected && styles.choiceCellSelected]}
        onPress={() => setSelectedStickerId(item.id)}
        activeOpacity={0.78}
      >
        <Image source={{ uri: item.image_url }} style={styles.choiceImage} resizeMode="contain" />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#A78BFA" />
        </View>
      </SafeAreaView>
    );
  }

  if (sent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <Text style={styles.successTitle}>Offer sent ✦</Text>
          <Text style={styles.successText}>
            If they accept, the exchange will complete automatically.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(app)/collection')}>
            <Text style={styles.primaryButtonText}>Back to collection</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/(app)/collection')} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exchange Offer</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.offerPanel}>
        <Text style={styles.eyebrow}>Someone wants to trade this sticker</Text>
        <View style={styles.offeredStickerBox}>
          {offer?.sticker && (
            <Image source={{ uri: offer.sticker.image_url }} style={styles.offeredStickerImage} resizeMode="contain" />
          )}
        </View>
        {isUnavailable ? (
          <Text style={styles.unavailableText}>
            {isOwnOffer ? 'This is your own offer.' : 'This offer is no longer available.'}
          </Text>
        ) : (
          <Text style={styles.expiryText}>Open for 24 hours. First accepted trade wins.</Text>
        )}
      </View>

      {!isUnavailable && (
        <>
          <Text style={styles.sectionTitle}>Choose one of your unplaced stickers</Text>
          <FlatList
            data={stickers}
            renderItem={renderSticker}
            keyExtractor={(item) => item.id}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={styles.choiceRow}
            contentContainerStyle={styles.choiceGrid}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>You need an unplaced sticker to make an offer.</Text>
              </View>
            }
          />
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!selectedStickerId || submitting) && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!selectedStickerId || submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Send exchange offer</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F1F1F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#fff',
    fontSize: 20,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  offerPanel: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  eyebrow: {
    color: '#D8D8D8',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  offeredStickerBox: {
    width: 220,
    height: 220,
    borderRadius: 22,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  offeredStickerImage: {
    width: '82%',
    height: '82%',
  },
  expiryText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  unavailableText: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
  },
  choiceGrid: {
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  choiceRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  choiceCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#292929',
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceCellSelected: {
    borderColor: '#A78BFA',
    borderWidth: 2,
  },
  choiceImage: {
    width: '86%',
    height: '86%',
  },
  emptyState: {
    paddingVertical: 70,
    alignItems: 'center',
  },
  emptyText: {
    color: '#777',
    fontSize: 15,
    textAlign: 'center',
  },
  submitButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#A78BFA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.45,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successTitle: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    marginBottom: 12,
  },
  successText: {
    color: '#BDBDBD',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  primaryButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    paddingHorizontal: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#252525',
    fontSize: 16,
    fontWeight: '900',
  },
});
