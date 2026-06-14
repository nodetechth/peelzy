import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BookCoverProps } from './types';
import { truncateTitle } from './utils';

export default function BrutalistCover({
  bookName,
  stickerCount,
  stickers,
  accentColor,
  width = 300,
  height = 380,
  onPress,
  preview = false,
}: BookCoverProps) {
  const stickerSize = width * 0.34;
  const stickerPositions = [
    { top: height * 0.12, left: width * 0.15, transform: [{ rotate: '-10deg' }] },
    { top: height * 0.36, right: width * 0.11, transform: [{ rotate: '9deg' }] },
    { top: height * 0.54, left: width * 0.2, transform: [{ rotate: '-4deg' }] },
    { top: height * 0.22, right: width * 0.22, transform: [{ rotate: '13deg' }] },
  ];

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.88 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.root, { width, height }]}
    >
      <View style={styles.shadowLayer} />
      <View style={[styles.cover, { backgroundColor: accentColor }]}>
        <View style={styles.stickerLayer}>
          {!preview && stickers.slice(0, 4).map((sticker, index) => (
              <View
                key={sticker.id}
                style={[
                  styles.slot,
                  { width: stickerSize, height: stickerSize },
                  stickerPositions[index],
                ]}
              >
                <Image source={{ uri: sticker.image_url }} style={styles.stickerImage} resizeMode="contain" />
              </View>
            ))}
        </View>
        {!preview && (
          <View style={styles.titleBar}>
            <Text style={styles.title} numberOfLines={1}>
              {truncateTitle(bookName).toUpperCase()}
            </Text>
            <View style={styles.countBadge}>
              <Text style={[styles.countText, { color: accentColor }]}>x{stickerCount}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
    paddingRight: 8,
    paddingBottom: 8,
  },
  shadowLayer: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 0,
    bottom: 0,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
  },
  cover: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: '#1A1A1A',
    overflow: 'hidden',
  },
  stickerLayer: {
    flex: 1,
    position: 'relative',
  },
  slot: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#1A1A1A',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerImage: {
    width: '86%',
    height: '86%',
  },
  titleBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 2.5,
    borderTopColor: '#1A1A1A',
  },
  title: {
    flex: 1,
    color: '#1A1A1A',
    fontFamily: 'Courier',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 1,
  },
  countBadge: {
    minWidth: 38,
    height: 26,
    borderRadius: 4,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 7,
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
});
