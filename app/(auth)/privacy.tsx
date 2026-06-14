import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../../constants/theme';

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Link href="/(auth)/welcome" asChild>
          <TouchableOpacity hitSlop={12}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
        </Link>
        <Text style={styles.headerTitle}>Privacy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Peelzy Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: May 26, 2026</Text>

        <Section title="1. Information we collect">
          We collect account information such as your email address, authentication identifiers, subscription status, and app usage needed to operate Peelzy.
        </Section>
        <Section title="2. Photos and stickers">
          When you choose to create a sticker, Peelzy processes the selected photo or camera image and stores the generated sticker, thumbnail, books, notes, and page layouts for your account.
        </Section>
        <Section title="3. Camera and photo access">
          Peelzy only accesses your camera or photo library after you grant permission and use those features. You can change permissions in your device settings.
        </Section>
        <Section title="4. Service providers">
          We use trusted services such as Supabase for authentication, database, and storage, Apple and RevenueCat for purchases, and platform image processing features to provide the app.
        </Section>
        <Section title="5. Sharing and exchanges">
          If you create exchange links or trade stickers, the related sticker and offer information may be visible to the people who open or respond to those links.
        </Section>
        <Section title="6. Your choices">
          You can log out at any time. To request account or data deletion, contact the Peelzy team through the support channel provided in the app or store listing.
        </Section>
        <Section title="7. Data sale">
          We do not sell your personal information.
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
