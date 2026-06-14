import { ReactElement, useCallback, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  DeviceEventEmitter,
  FlatList,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
} from 'react-native-svg';
import { theme } from '../constants/theme';
import { ONBOARDING_COMPLETED_EVENT, ONBOARDING_STORAGE_KEY } from '../constants/onboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type OnboardingSlide = {
  key: string;
  title: string;
  body: string;
  accent: string;
  background: string[];
  Art: () => ReactElement;
};

const slides: OnboardingSlide[] = [
  {
    key: 'snap',
    title: 'Snap moments into stickers',
    body: 'Take a photo and Peelzy turns the subject into a clean, playful sticker.',
    accent: '#9B7BFF',
    background: ['#101010', '#1A1426'],
    Art: SnapStickerArt,
  },
  {
    key: 'books',
    title: 'Fill your sticker books',
    body: 'Place stickers on pages, move them around, resize, rotate, and decorate with notes.',
    accent: '#7EE3A1',
    background: ['#FFF8EF', '#EEE5FF'],
    Art: StickerBookArt,
  },
  {
    key: 'trade',
    title: 'Keep and trade your favorites',
    body: 'Save every sticker, trade with friends, and unlock more monthly peels with Plus.',
    accent: '#FF8BB7',
    background: ['#161616', '#221A2F'],
    Art: CollectionTradeArt,
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<OnboardingSlide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [pageIndex, setPageIndex] = useState(0);

  const finishOnboarding = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'complete');
    DeviceEventEmitter.emit(ONBOARDING_COMPLETED_EVENT);
    router.replace('/(auth)/welcome');
  }, [router]);

  const goNext = useCallback(() => {
    if (pageIndex >= slides.length - 1) {
      finishOnboarding();
      return;
    }
    listRef.current?.scrollToIndex({ index: pageIndex + 1, animated: true });
  }, [finishOnboarding, pageIndex]);

  const handleMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setPageIndex(nextIndex);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.logo}>peelzy</Text>
        <TouchableOpacity onPress={finishOnboarding} activeOpacity={0.72} hitSlop={12}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      <Animated.FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        renderItem={({ item }) => <OnboardingPage slide={item} />}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <View style={styles.dots}>
          {slides.map((slide, index) => {
            const inputRange = [
              (index - 1) * SCREEN_WIDTH,
              index * SCREEN_WIDTH,
              (index + 1) * SCREEN_WIDTH,
            ];
            const width = scrollX.interpolate({
              inputRange,
              outputRange: [8, 26, 8],
              extrapolate: 'clamp',
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.28, 1, 0.28],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={slide.key}
                style={[
                  styles.dot,
                  {
                    width,
                    opacity,
                    backgroundColor: slides[pageIndex]?.accent || theme.colors.purple,
                  },
                ]}
              />
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: slides[pageIndex]?.accent || theme.colors.purple }]}
          onPress={goNext}
          activeOpacity={0.82}
        >
          <Text style={styles.primaryButtonText}>
            {pageIndex === slides.length - 1 ? 'Get started' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function OnboardingPage({ slide }: { slide: OnboardingSlide }) {
  return (
    <View style={styles.page}>
      <ImageBackground
        source={{ uri: gradientDataUri(slide.background[0], slide.background[1]) }}
        style={styles.heroShell}
        imageStyle={styles.heroBackground}
      >
        <View style={styles.heroGlow} />
        <slide.Art />
      </ImageBackground>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>
    </View>
  );
}

function SnapStickerArt() {
  return (
    <View style={styles.artFrame}>
      <Svg width="100%" height="100%" viewBox="0 0 330 420">
        <Defs>
          <LinearGradient id="snapBg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#272727" />
            <Stop offset="1" stopColor="#080808" />
          </LinearGradient>
          <LinearGradient id="peel" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="0.58" stopColor="#F2F2F2" />
            <Stop offset="1" stopColor="#CFCFCF" />
          </LinearGradient>
        </Defs>
        <Rect x="16" y="18" width="298" height="366" rx="34" fill="url(#snapBg)" />
        <Rect x="36" y="54" width="258" height="258" rx="28" fill="#161616" />
        <Path
          d="M75 222 C58 170 76 113 132 92 C188 70 246 96 263 151 C281 208 249 270 190 286 C137 300 92 273 75 222 Z"
          fill="#FFFFFF"
          stroke="#FFFFFF"
          strokeWidth="22"
          strokeLinejoin="round"
        />
        <Path
          d="M75 222 C58 170 76 113 132 92 C188 70 246 96 263 151 C281 208 249 270 190 286 C137 300 92 273 75 222 Z"
          fill="#F6C4D2"
          stroke="#111111"
          strokeWidth="5"
          strokeDasharray="14 12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx="154" cy="160" r="64" fill="#FFD9A8" />
        <Circle cx="130" cy="151" r="9" fill="#111111" />
        <Circle cx="178" cy="151" r="9" fill="#111111" />
        <Path d="M139 184 C150 194 166 194 178 184" stroke="#111111" strokeWidth="6" strokeLinecap="round" fill="none" />
        <Path d="M102 93 C84 72 105 48 132 62 C151 42 184 52 184 84" fill="#2C1C18" />
        <Circle cx="222" cy="180" r="28" fill="#FFC8B1" opacity="0.96" />
        <Path d="M36 288 C104 263 187 291 296 258 L296 348 C186 349 105 343 36 358 Z" fill="#060606" />
        <Path d="M114 333 C162 289 222 258 297 257 L297 330 C228 319 166 324 114 333 Z" fill="url(#peel)" />
        <Path d="M114 333 C162 289 222 258 297 257" stroke="#FFFFFF" strokeWidth="3" fill="none" />
        <Circle cx="165" cy="351" r="31" fill="#FFFFFF" stroke="#111111" strokeWidth="6" />
        <Path d="M72 344 L60 370 L82 356 L70 386" stroke="#FFFFFF" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function StickerBookArt() {
  return (
    <View style={styles.artFrame}>
      <Svg width="100%" height="100%" viewBox="0 0 330 420">
        <Defs>
          <LinearGradient id="bookPaper" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF8EA" />
            <Stop offset="1" stopColor="#F5E6FF" />
          </LinearGradient>
        </Defs>
        <Rect x="18" y="34" width="294" height="330" rx="24" fill="#D7BCFF" />
        <Rect x="31" y="46" width="268" height="306" rx="20" fill="url(#bookPaper)" stroke="#E7D8C9" strokeWidth="2" />
        {Array.from({ length: 8 }).map((_, index) => (
          <Path key={`v-${index}`} d={`M${60 + index * 28} 52 L${60 + index * 28} 348`} stroke="#EBDCCA" strokeWidth="1" opacity="0.55" />
        ))}
        {Array.from({ length: 9 }).map((_, index) => (
          <Path key={`h-${index}`} d={`M34 ${76 + index * 28} L296 ${76 + index * 28}`} stroke="#EBDCCA" strokeWidth="1" opacity="0.55" />
        ))}
        <Path d="M53 86 L144 76 L154 148 L61 158 Z" fill="#F7D3E1" />
        <Rect x="84" y="70" width="54" height="18" rx="4" fill="#BCA1F6" opacity="0.5" transform="rotate(-6 111 79)" />
        <Path d="M78 108 L129 103" stroke="#2F2A29" strokeWidth="5" strokeLinecap="round" />
        <Path d="M78 131 L121 127" stroke="#2F2A29" strokeWidth="5" strokeLinecap="round" />
        <G transform="translate(174 65) rotate(10)">
          <Path d="M22 8 C41 0 63 14 66 37 C70 66 46 86 20 77 C-4 68 -6 28 22 8 Z" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="14" />
          <Path d="M22 8 C41 0 63 14 66 37 C70 66 46 86 20 77 C-4 68 -6 28 22 8 Z" fill="#8EC9DF" />
          <Circle cx="24" cy="36" r="5" fill="#111" />
          <Circle cx="48" cy="36" r="5" fill="#111" />
          <Path d="M29 54 C37 60 45 57 51 51" stroke="#111" strokeWidth="4" fill="none" strokeLinecap="round" />
        </G>
        <G transform="translate(72 190) rotate(-12)">
          <Path d="M8 28 C20 3 55 -2 73 21 C92 47 73 80 43 80 C13 80 -6 56 8 28 Z" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="12" />
          <Path d="M8 28 C20 3 55 -2 73 21 C92 47 73 80 43 80 C13 80 -6 56 8 28 Z" fill="#FFE566" />
          <Path d="M34 23 L45 45 L68 47 L50 60 L56 82 L37 68 L18 80 L25 58 L7 44 L30 43 Z" fill="#FF8BB7" />
        </G>
        <G transform="translate(172 214) rotate(8)">
          <Rect x="0" y="0" width="96" height="64" rx="10" fill="none" stroke="#9B7BFF" strokeWidth="3" strokeDasharray="8 7" />
          <Path d="M17 48 L78 13" stroke="#9B7BFF" strokeWidth="4" strokeLinecap="round" />
          <Circle cx="18" cy="48" r="7" fill="#9B7BFF" />
          <Circle cx="78" cy="13" r="7" fill="#9B7BFF" />
        </G>
        <Path d="M204 158 C226 139 250 145 260 164 C270 184 254 208 230 204 C204 199 188 177 204 158 Z" fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="12" />
        <Path d="M204 158 C226 139 250 145 260 164 C270 184 254 208 230 204 C204 199 188 177 204 158 Z" fill="#7EE3A1" />
      </Svg>
    </View>
  );
}

function CollectionTradeArt() {
  return (
    <View style={styles.artFrame}>
      <Svg width="100%" height="100%" viewBox="0 0 330 420">
        <Defs>
          <LinearGradient id="tradeCard" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2B2538" />
            <Stop offset="1" stopColor="#111111" />
          </LinearGradient>
        </Defs>
        <Rect x="20" y="32" width="290" height="330" rx="34" fill="#0F0F0F" />
        <Rect x="42" y="58" width="74" height="74" rx="20" fill="#FFF8EF" />
        <Rect x="128" y="58" width="74" height="74" rx="20" fill="#FFF8EF" />
        <Rect x="214" y="58" width="74" height="74" rx="20" fill="#FFF8EF" />
        <Rect x="42" y="144" width="74" height="74" rx="20" fill="#FFF8EF" />
        <Rect x="128" y="144" width="74" height="74" rx="20" fill="#FFF8EF" />
        <Rect x="214" y="144" width="74" height="74" rx="20" fill="#FFF8EF" />
        <Circle cx="79" cy="95" r="22" fill="#FF8BB7" stroke="#FFFFFF" strokeWidth="7" />
        <Path d="M153 104 L177 78 L183 116 Z" fill="#8EC9DF" stroke="#FFFFFF" strokeWidth="7" strokeLinejoin="round" />
        <Path d="M230 108 C242 82 272 84 276 111 C260 104 247 114 230 108 Z" fill="#FFE566" stroke="#FFFFFF" strokeWidth="7" />
        <Path d="M65 175 L91 166 L101 190 L72 199 Z" fill="#7EE3A1" stroke="#FFFFFF" strokeWidth="7" />
        <Path d="M154 174 C170 154 194 174 184 197 C169 210 144 199 154 174 Z" fill="#BCA1F6" stroke="#FFFFFF" strokeWidth="7" />
        <Path d="M232 181 L253 160 L274 181 L253 202 Z" fill="#F7D3E1" stroke="#FFFFFF" strokeWidth="7" />
        <Rect x="48" y="250" width="234" height="82" rx="22" fill="url(#tradeCard)" stroke="#3A3447" strokeWidth="2" />
        <Circle cx="82" cy="291" r="22" fill="#9B7BFF" />
        <Path d="M113 292 L146 292" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <Path d="M136 280 L148 292 L136 304" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M187 292 L220 292" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
        <Path d="M197 280 L185 292 L197 304" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx="249" cy="291" r="22" fill="#FF8BB7" />
        <Path d="M245 275 L251 286 L264 288 L254 297 L257 310 L245 303 L233 310 L236 297 L226 288 L239 286 Z" fill="#FFFFFF" />
        <Rect x="213" y="32" width="78" height="32" rx="16" fill="#FFFFFF" />
        <Path d="M234 40 L240 51 L253 53 L244 62 L246 75 L234 68 L222 75 L224 62 L215 53 L228 51 Z" fill="#9B7BFF" transform="scale(.72) translate(96 22)" />
        <Path d="M260 43 L272 43" stroke="#111111" strokeWidth="5" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function gradientDataUri(first: string, second: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${first}" offset="0"/><stop stop-color="${second}" offset="1"/></linearGradient></defs><rect width="16" height="16" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFDF8',
  },
  header: {
    height: 58,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    fontFamily: theme.fonts.black,
    fontSize: 25,
    color: '#111111',
    letterSpacing: 0,
  },
  skipText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: '#8A827B',
  },
  page: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 2,
  },
  heroShell: {
    flex: 1,
    minHeight: 410,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E7DDD0',
    shadowColor: '#7D695C',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 6,
  },
  heroBackground: {
    borderRadius: 34,
  },
  heroGlow: {
    position: 'absolute',
    top: -70,
    right: -48,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  artFrame: {
    flex: 1,
    padding: 8,
  },
  copyBlock: {
    paddingTop: 26,
    paddingHorizontal: 2,
    minHeight: 168,
  },
  title: {
    fontFamily: theme.fonts.black,
    fontSize: 34,
    lineHeight: 38,
    color: '#111111',
    letterSpacing: 0,
  },
  body: {
    marginTop: 12,
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    lineHeight: 25,
    color: '#706861',
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 6,
    backgroundColor: '#FFFDF8',
  },
  dots: {
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 15,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  primaryButton: {
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5D45B8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 5,
  },
  primaryButtonText: {
    fontFamily: theme.fonts.black,
    color: '#FFFFFF',
    fontSize: 19,
  },
});
