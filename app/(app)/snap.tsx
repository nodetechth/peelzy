import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { uploadPhoto } from '../../lib/storage';
import { useAuth } from '../../contexts/AuthContext';
import * as Haptics from 'expo-haptics';

const TAB_BAR_HEIGHT = 80;

export default function SnapScreen() {
  const [isCapturing, setIsCapturing] = useState(false);
  const router = useRouter();
  const { bookId, pageIndex } = useLocalSearchParams<{ bookId?: string; pageIndex?: string }>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const handleCapture = useCallback(async () => {
    if (isCapturing || !user) return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'カメラへのアクセスが必要です',
        '設定アプリからカメラへのアクセスを許可してください。'
      );
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsCapturing(true);

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        setIsCapturing(false);
        return;
      }

      const photoUri = result.assets[0].uri;
      const { path, error } = await uploadPhoto(photoUri, user.id);

      if (error) {
        Alert.alert('アップロードエラー', error.message);
        setIsCapturing(false);
        return;
      }

      router.push({
        pathname: '/(app)/crop',
        params: {
          photoPath: path,
          ...(bookId && { bookId }),
          ...(pageIndex && { pageIndex }),
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '不明なエラー';
      Alert.alert('エラー', `予期しないエラーが発生しました: ${errorMessage}`);
      console.error('Capture error:', error);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, user, bookId, pageIndex, router]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>シールを撮影</Text>
        <Text style={styles.subtitle}>ボタンを押してカメラを起動</Text>
      </View>

      {isCapturing && (
        <View style={styles.capturingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      <View style={[styles.bottomControls, { bottom: TAB_BAR_HEIGHT + insets.bottom + 20 }]}>
        <TouchableOpacity
          style={[styles.snapButton, isCapturing && styles.snapButtonDisabled]}
          onPress={handleCapture}
          disabled={isCapturing}
          activeOpacity={0.7}
        >
          <View style={styles.snapButtonInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
  },
  capturingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  snapButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'transparent',
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  snapButtonDisabled: {
    opacity: 0.5,
  },
  snapButtonInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
});
