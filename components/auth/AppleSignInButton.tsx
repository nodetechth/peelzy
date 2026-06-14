import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../constants/theme';

type AppleSignInButtonProps = {
  mode?: 'signIn' | 'signUp' | 'continue';
};

export default function AppleSignInButton({ mode = 'continue' }: AppleSignInButtonProps) {
  const [isAvailable, setIsAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signInWithApple } = useAuth();

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    AppleAuthentication.isAvailableAsync()
      .then(setIsAvailable)
      .catch(() => setIsAvailable(false));
  }, []);

  const handlePress = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        Alert.alert('Could not continue', 'Apple did not return a sign-in token.');
        return;
      }

      const fullName = formatAppleFullName(credential.fullName);
      const { error } = await signInWithApple(credential.identityToken, rawNonce, fullName);

      if (error) {
        Alert.alert('Could not continue with Apple', error.message);
      }
    } catch (error) {
      const code = getErrorCode(error);
      if (code !== 'ERR_REQUEST_CANCELED') {
        const message = error instanceof Error ? error.message : 'Please try again.';
        Alert.alert('Could not continue with Apple', message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (Platform.OS !== 'ios' || !isAvailable) {
    return null;
  }

  return (
    <View style={styles.container}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={getAppleButtonType(mode)}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={28}
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handlePress}
      />
      {loading && (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
    </View>
  );
}

function getAppleButtonType(mode: AppleSignInButtonProps['mode']) {
  if (mode === 'signIn') {
    return AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN;
  }
  if (mode === 'signUp') {
    return AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP;
  }
  return AppleAuthentication.AppleAuthenticationButtonType.CONTINUE;
}

function formatAppleFullName(fullName: AppleAuthentication.AppleAuthenticationFullName | null) {
  if (!fullName) return null;

  const name = [fullName.givenName, fullName.familyName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return name || null;
}

function getErrorCode(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error) {
    return String((error as { code?: unknown }).code);
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#000000',
    shadowColor: theme.colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 3,
  },
  button: {
    width: '100%',
    height: 56,
  },
  buttonDisabled: {
    opacity: 0.76,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
