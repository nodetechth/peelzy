import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { theme } from '../../constants/theme';
import AppleSignInButton from '../../components/auth/AppleSignInButton';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();

  const handleSignup = async () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      Alert.alert('Missing details', 'Enter your email and password to create an account.');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please enter the same password twice.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Password is too short', 'Use at least 6 characters.');
      return;
    }

    setLoading(true);
    const { error } = await signUp(normalizedEmail, password);
    setLoading(false);

    if (error) {
      Alert.alert('Could not create account', error.message);
    } else {
      router.replace({
        pathname: '/(auth)/check-email',
        params: { email: normalizedEmail },
      });
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>peelzy</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.description}>Save your stickers, decorate books, and trade favorites.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <TextInput
          style={styles.input}
          placeholder="Password (6+ characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
        />

        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoComplete="new-password"
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Creating...' : 'Create account'}
          </Text>
        </TouchableOpacity>

        <View style={styles.appleButtonWrap}>
          <AppleSignInButton mode="signUp" />
        </View>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>
              Already have an account? Log in
            </Text>
          </TouchableOpacity>
        </Link>

        <Text style={styles.legalText}>
          By creating an account, you agree to Peelzy's{' '}
          <Link href="/(auth)/terms" asChild>
            <Text style={styles.legalLink}>Terms</Text>
          </Link>
          {' '}and{' '}
          <Link href="/(auth)/privacy" asChild>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Link>
          .
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logo: {
    fontFamily: theme.fonts.black,
    fontSize: 26,
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 24,
  },
  title: {
    fontFamily: theme.fonts.black,
    color: theme.colors.text,
    fontSize: 34,
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.textMuted,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    height: 54,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: theme.colors.purple,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#fff',
    fontFamily: theme.fonts.black,
    fontSize: 17,
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  appleButtonWrap: {
    marginTop: 12,
  },
  linkText: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.semibold,
    fontSize: 14,
  },
  legalText: {
    marginTop: 22,
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
  legalLink: {
    color: theme.colors.purple,
    fontFamily: theme.fonts.bold,
    fontSize: 12,
  },
});
