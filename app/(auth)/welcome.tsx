import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { theme } from '../../constants/theme';
import AppleSignInButton from '../../components/auth/AppleSignInButton';

export default function AuthWelcomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>peelzy</Text>
        </View>

        <View style={styles.hero}>
          <Svg width="100%" height="100%" viewBox="0 0 320 320">
            <Defs>
              <LinearGradient id="heroBg" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#FFF8EF" />
                <Stop offset="1" stopColor="#E9DDFF" />
              </LinearGradient>
            </Defs>
            <Rect x="20" y="30" width="280" height="250" rx="34" fill="url(#heroBg)" />
            <Path
              d="M84 206 C60 163 78 103 132 86 C193 66 250 101 258 161 C266 218 218 261 159 254 C125 250 101 236 84 206 Z"
              fill="#FFFFFF"
              stroke="#FFFFFF"
              strokeWidth="22"
              strokeLinejoin="round"
            />
            <Path
              d="M84 206 C60 163 78 103 132 86 C193 66 250 101 258 161 C266 218 218 261 159 254 C125 250 101 236 84 206 Z"
              fill="#8EC9DF"
              stroke="#111111"
              strokeWidth="5"
              strokeDasharray="13 11"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Circle cx="137" cy="155" r="9" fill="#111111" />
            <Circle cx="184" cy="155" r="9" fill="#111111" />
            <Path d="M145 185 C158 196 176 195 190 182" stroke="#111111" strokeWidth="6" strokeLinecap="round" fill="none" />
            <Circle cx="222" cy="190" r="27" fill="#FFB8C8" />
            <Path d="M68 232 C125 211 199 235 277 205 L277 266 C198 262 126 262 68 275 Z" fill="#111111" />
            <Path d="M130 270 C171 233 218 209 278 205 L278 260 C221 249 171 254 130 270 Z" fill="#FFFFFF" />
          </Svg>
        </View>

        <View style={styles.copy}>
          <Text style={styles.title}>Start your sticker book</Text>
          <Text style={styles.body}>
            Create an account to save your stickers, decorate books, and trade favorites with friends.
          </Text>
        </View>

        <View style={styles.actions}>
          <AppleSignInButton mode="continue" />

          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.82}>
              <Text style={styles.primaryButtonText}>Create account</Text>
            </TouchableOpacity>
          </Link>

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.72}>
              <Text style={styles.secondaryButtonText}>Log in</Text>
            </TouchableOpacity>
          </Link>

          <Text style={styles.legalText}>
            By continuing, you agree to Peelzy's{' '}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 18,
  },
  header: {
    height: 48,
    justifyContent: 'center',
  },
  logo: {
    fontFamily: theme.fonts.black,
    fontSize: 25,
    color: theme.colors.text,
  },
  hero: {
    height: 270,
    marginTop: 6,
  },
  copy: {
    paddingTop: 16,
  },
  title: {
    fontFamily: theme.fonts.black,
    fontSize: 36,
    lineHeight: 40,
    color: theme.colors.text,
  },
  body: {
    marginTop: 12,
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    lineHeight: 25,
    color: theme.colors.textMuted,
  },
  actions: {
    paddingTop: 22,
    gap: 12,
  },
  primaryButton: {
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: theme.fonts.black,
    color: '#FFFFFF',
    fontSize: 18,
  },
  secondaryButton: {
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.black,
    color: theme.colors.text,
    fontSize: 17,
  },
  legalText: {
    marginTop: 4,
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
