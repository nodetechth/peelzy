import { View, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';

function HomeIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V9.5Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CollectionIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 6H20M4 6V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V6M4 6L6 4H18L20 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx="9" cy="12" r="2" stroke={color} strokeWidth={2} />
      <Circle cx="15" cy="12" r="2" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

function SnapButton({ focused }: { focused: boolean }) {
  return (
    <View style={styles.snapButtonContainer}>
      <View style={[styles.snapButtonOuter, focused && styles.snapButtonOuterActive]}>
        <View style={styles.snapButtonInner} />
      </View>
    </View>
  );
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 80 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: '#111111',
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(255,255,255,0.08)',
          height: tabBarHeight,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: '#A78BFA',
        tabBarInactiveTintColor: '#555555',
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ color }) => <HomeIcon color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="snap"
        options={{
          tabBarIcon: ({ focused }) => <SnapButton focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          tabBarIcon: ({ color }) => <CollectionIcon color={color} size={24} />,
          href: '/collection',
        }}
      />
      <Tabs.Screen
        name="camera"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="crop"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="book-detail"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  snapButtonContainer: {
    position: 'relative',
    top: -8,
  },
  snapButtonOuter: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  snapButtonOuterActive: {
    backgroundColor: '#A78BFA',
  },
  snapButtonInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000000',
  },
});
