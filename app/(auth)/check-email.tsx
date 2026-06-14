import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';

export default function CheckEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✉</Text>
        </View>
        <Text style={styles.logo}>peelzy</Text>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.description}>
          We sent a confirmation link{email ? ` to ${email}` : ''}. Open it to activate your account and start using Peelzy.
        </Text>
        <Text style={styles.hint}>
          If you do not see it, check your spam folder or try creating your account again.
        </Text>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.82}>
            <Text style={styles.primaryButtonText}>Back to log in</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 30,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    padding: 24,
    alignItems: 'center',
  },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#EFE7FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  badgeText: {
    fontSize: 34,
  },
  logo: {
    fontFamily: theme.fonts.black,
    fontSize: 24,
    color: theme.colors.text,
    marginBottom: 20,
  },
  title: {
    fontFamily: theme.fonts.black,
    fontSize: 32,
    color: theme.colors.text,
    textAlign: 'center',
  },
  description: {
    marginTop: 12,
    fontFamily: theme.fonts.semibold,
    fontSize: 16,
    lineHeight: 24,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  hint: {
    marginTop: 16,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 20,
    color: '#9A8F86',
    textAlign: 'center',
  },
  primaryButton: {
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 28,
    marginTop: 26,
    backgroundColor: theme.colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: theme.fonts.black,
    color: '#FFFFFF',
    fontSize: 17,
  },
});
