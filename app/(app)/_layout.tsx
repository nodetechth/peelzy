import { DeviceEventEmitter, View, StyleSheet, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { SNAP_TAB_PRESS_EVENT } from '../../lib/snapEvents';
import { theme } from '../../constants/theme';

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
        <View style={styles.snapButtonInner}>
          <Text style={styles.snapButtonStar}>✿</Text>
        </View>
      </View>
    </View>
  );
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = 52 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: theme.colors.background,
          borderTopWidth: 1,
          borderTopColor: theme.colors.line,
          height: tabBarHeight,
          paddingBottom: Math.max(insets.bottom - 6, 4),
          shadowColor: '#7D695C',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          elevation: 12,
        },
        tabBarActiveTintColor: theme.colors.purple,
        tabBarInactiveTintColor: '#87827C',
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
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(SNAP_TAB_PRESS_EVENT);
            }
          },
        })}
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
    top: -4,
  },
  snapButtonOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6B5A51',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  snapButtonOuterActive: {
    backgroundColor: '#F7F0FF',
  },
  snapButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.black,
    justifyContent: 'center',
    alignItems: 'center',
  },
  snapButtonStar: {
    color: theme.colors.purpleSoft,
    fontSize: 23,
    fontWeight: '900',
  },
});
