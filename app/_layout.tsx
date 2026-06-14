import { useEffect, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, Text, TextInput, View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Nunito_400Regular,
  Nunito_500Medium,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';
import {
  Caveat_600SemiBold,
  Caveat_700Bold,
} from '@expo-google-fonts/caveat';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { theme } from '../constants/theme';
import { ONBOARDING_COMPLETED_EVENT, ONBOARDING_STORAGE_KEY } from '../constants/onboarding';

let didApplyDefaultFonts = false;

function RootLayoutNav() {
  const { session, loading, passwordRecoveryMode } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_STORAGE_KEY)
      .then((value) => setOnboardingComplete(value === 'complete'))
      .catch(() => setOnboardingComplete(false));
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(ONBOARDING_COMPLETED_EVENT, () => {
      setOnboardingComplete(true);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (loading || onboardingComplete === null) return;

    const currentSegments = segments as string[];
    const inAuthGroup = currentSegments[0] === '(auth)';
    const inOnboarding = currentSegments[0] === 'onboarding';
    const inPasswordUpdate = inAuthGroup && currentSegments[1] === 'update-password';

    if (passwordRecoveryMode && !inPasswordUpdate) {
      router.replace('/(auth)/update-password');
    } else if (!session && !onboardingComplete && !inOnboarding) {
      router.replace('/onboarding');
    } else if (!session && onboardingComplete && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (session && (inAuthGroup || inOnboarding) && !inPasswordUpdate && !passwordRecoveryMode) {
      router.replace('/(app)/home');
    }
  }, [session, loading, onboardingComplete, passwordRecoveryMode, segments]);

  if (loading || onboardingComplete === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <StatusBar style="auto" />
        <ActivityIndicator color={theme.colors.purple} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="auto" />
      <Slot />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    Caveat_600SemiBold,
    Caveat_700Bold,
  });

  if (fontsLoaded && !didApplyDefaultFonts) {
    const textDefaults = Text as unknown as { defaultProps?: { style?: unknown } };
    const textInputDefaults = TextInput as unknown as { defaultProps?: { style?: unknown } };

    textDefaults.defaultProps = textDefaults.defaultProps || {};
    textInputDefaults.defaultProps = textInputDefaults.defaultProps || {};
    textDefaults.defaultProps.style = [
      { fontFamily: theme.fonts.regular },
      textDefaults.defaultProps.style,
    ];
    textInputDefaults.defaultProps.style = [
      { fontFamily: theme.fonts.regular },
      textInputDefaults.defaultProps.style,
    ];
    didApplyDefaultFonts = true;
  }

  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
          <StatusBar style="auto" />
          <ActivityIndicator color={theme.colors.purple} />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
