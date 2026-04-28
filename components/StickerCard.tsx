import { useRef, useState } from 'react';
import {
  StyleSheet,
  Image,
  Pressable,
  Animated,
  Platform,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

type StickerCardProps = {
  imageUrl: string;
  size: number;
  onLongPressStart?: () => void;
  onLongPressEnd?: () => void;
  onTap?: () => void;
};

export default function StickerCard({
  imageUrl,
  size,
  onLongPressStart,
  onLongPressEnd,
  onTap,
}: StickerCardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const isLongPressing = useRef(false);
  const [isLifted, setIsLifted] = useState(false);

  const animateIn = () => {
    setIsLifted(true);
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1.15,
        damping: 10,
        stiffness: 150,
        useNativeDriver: true,
      }),
      Animated.spring(rotate, {
        toValue: -6,
        damping: 10,
        stiffness: 150,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: -8,
        damping: 10,
        stiffness: 150,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateOut = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        damping: 10,
        stiffness: 150,
        useNativeDriver: true,
      }),
      Animated.spring(rotate, {
        toValue: 0,
        damping: 10,
        stiffness: 150,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        damping: 10,
        stiffness: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setIsLifted(false);
    });
  };

  const handleLongPress = () => {
    isLongPressing.current = true;
    animateIn();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPressStart?.();
  };

  const handlePressOut = () => {
    if (isLongPressing.current) {
      animateOut();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onLongPressEnd?.();
      isLongPressing.current = false;
    }
  };

  const handlePress = () => {
    if (!isLongPressing.current) {
      onTap?.();
    }
  };

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-6, 0],
    outputRange: ['-6deg', '0deg'],
  });

  const animatedStyle = {
    transform: [
      { scale },
      { rotate: rotateInterpolate },
      { translateY },
    ],
  };

  const shadowStyle = isLifted && Platform.OS === 'ios' ? styles.shadow : {};

  return (
    <View style={[styles.wrapper, { width: size, height: size }]}>
      <Animated.View style={[styles.card, animatedStyle, shadowStyle]}>
        <Pressable
          onLongPress={handleLongPress}
          onPressOut={handlePressOut}
          onPress={handlePress}
          delayLongPress={500}
          style={styles.pressable}
        >
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: 'visible',
  },
  card: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    overflow: 'hidden',
  },
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  pressable: {
    flex: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
