import { Image, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function LaunchSplash() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Image
        source={require('../assets/splash-icon.png')}
        style={styles.image}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111111',
  },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});
