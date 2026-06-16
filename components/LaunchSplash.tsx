import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { theme } from '../constants/theme';

export default function LaunchSplash() {
  const logoScale = useRef(new Animated.Value(0.98)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const sparkleOne = useRef(new Animated.Value(0)).current;
  const sparkleTwo = useRef(new Animated.Value(0)).current;
  const sparkleThree = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoScale, {
            toValue: 1.025,
            duration: 760,
            useNativeDriver: true,
          }),
          Animated.timing(logoScale, {
            toValue: 0.985,
            duration: 760,
            useNativeDriver: true,
          }),
        ])
      ),
      Animated.loop(
        Animated.stagger(210, [
          Animated.sequence([
            Animated.timing(sparkleOne, {
              toValue: 1,
              duration: 420,
              useNativeDriver: true,
            }),
            Animated.timing(sparkleOne, {
              toValue: 0,
              duration: 360,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(sparkleTwo, {
              toValue: 1,
              duration: 380,
              useNativeDriver: true,
            }),
            Animated.timing(sparkleTwo, {
              toValue: 0,
              duration: 420,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(sparkleThree, {
              toValue: 1,
              duration: 460,
              useNativeDriver: true,
            }),
            Animated.timing(sparkleThree, {
              toValue: 0,
              duration: 340,
              useNativeDriver: true,
            }),
          ]),
        ])
      ),
    ]).start();
  }, [logoOpacity, logoScale, sparkleOne, sparkleThree, sparkleTwo]);

  const sparkleStyle = (value: Animated.Value) => ({
    opacity: value,
    transform: [
      {
        scale: value.interpolate({
          inputRange: [0, 1],
          outputRange: [0.55, 1.18],
        }),
      },
      {
        rotate: value.interpolate({
          inputRange: [0, 1],
          outputRange: ['-10deg', '10deg'],
        }),
      },
    ],
  });

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.logoStage}>
        <Animated.Text style={[styles.sparkle, styles.sparkleTopRight, sparkleStyle(sparkleOne)]}>
          ✦
        </Animated.Text>
        <Animated.Text style={[styles.sparkle, styles.sparkleLeft, sparkleStyle(sparkleTwo)]}>
          ✧
        </Animated.Text>
        <Animated.Text style={[styles.sparkle, styles.sparkleBottomRight, sparkleStyle(sparkleThree)]}>
          ✦
        </Animated.Text>
        <Animated.Image
          source={require('../assets/icon.png')}
          style={[
            styles.logo,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
          resizeMode="contain"
        />
      </View>
      <Text style={styles.wordmark}>Peelzy</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  logoStage: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 148,
    height: 148,
    borderRadius: 34,
  },
  sparkle: {
    position: 'absolute',
    zIndex: 2,
    color: theme.colors.purple,
    fontSize: 30,
    fontWeight: '900',
    textShadowColor: 'rgba(139, 110, 243, 0.22)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  sparkleTopRight: {
    right: 18,
    top: 28,
  },
  sparkleLeft: {
    left: 16,
    top: 96,
    color: '#BDAEFF',
    fontSize: 26,
  },
  sparkleBottomRight: {
    right: 48,
    bottom: 34,
    color: '#FF66B3',
    fontSize: 24,
  },
  wordmark: {
    marginTop: 2,
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
