import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Link href="/(auth)/welcome" asChild>
          <TouchableOpacity hitSlop={12}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
        </Link>
        <Text style={styles.headerTitle}>Terms</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Peelzy Terms of Use</Text>
        <Text style={styles.updated}>Last updated: May 26, 2026</Text>

        <Section title="1. Your account">
          You are responsible for keeping your account credentials secure. You must use Peelzy in a lawful and respectful way.
        </Section>
        <Section title="2. Your content">
          You keep ownership of photos, stickers, books, notes, and other content you create. You grant Peelzy permission to store, process, display, and sync that content so the app can work.
        </Section>
        <Section title="3. Sticker creation and sharing">
          Do not upload or share content that infringes rights, contains illegal material, or harms others. Exchange links may be opened by other users, so only share stickers you are comfortable trading.
        </Section>
        <Section title="4. Paid features">
          Peelzy may offer paid plans or in-app purchases. Paid features, limits, and prices may change with notice where required.
        </Section>
        <Section title="5. Availability">
          Peelzy is provided as-is. We work to keep it reliable, but we do not guarantee uninterrupted access or that every generated sticker will be perfect.
        </Section>
        <Section title="6. Contact">
          For questions about these terms, contact the Peelzy team through the support channel provided in the app or store listing.
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    height: 56,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backText: {
    fontFamily: theme.fonts.black,
    fontSize: 36,
    color: theme.colors.purple,
    lineHeight: 38,
  },
  headerTitle: {
    fontFamily: theme.fonts.black,
    fontSize: 18,
    color: theme.colors.text,
  },
  headerSpacer: {
    width: 28,
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontFamily: theme.fonts.black,
    fontSize: 34,
    lineHeight: 38,
    color: theme.colors.text,
  },
  updated: {
    marginTop: 8,
    fontFamily: theme.fonts.semibold,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontFamily: theme.fonts.black,
    fontSize: 18,
    color: theme.colors.text,
  },
  sectionBody: {
    marginTop: 8,
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 23,
    color: theme.colors.textMuted,
  },
});
