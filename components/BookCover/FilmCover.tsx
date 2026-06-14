import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BookCoverProps } from './types';
import { truncateTitle } from './utils';

export default function FilmCover({
  bookName,
  stickerCount,
  stickers,
  width = 300,
  height = 380,
  onPress,
  preview = false,
}: BookCoverProps) {
  const perforationCount = Math.floor((height - 40) / 18);
  const stickerSize = width * 0.34;
  const code = truncateTitle(bookName, 5).toUpperCase();
  const sideInset = Math.max(14, width * 0.14);
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
      style={[styles.cover, { width, height }]}
    >
      {Array.from({ length: perforationCount }, (_, index) => (
        <View key={`left-${index}`} style={[styles.perforation, { top: 16 + index * 18, left: 6 }]} />
      ))}
      {Array.from({ length: perforationCount }, (_, index) => (
        <View key={`right-${index}`} style={[styles.perforation, { top: 16 + index * 18, right: 6 }]} />
      ))}

      <View style={[styles.frame, { left: sideInset, right: sideInset }]} />
      <View style={[styles.outerBorder, { left: sideInset, right: sideInset }]} />
      <View style={[styles.innerBorder, { left: sideInset + 3, right: sideInset + 3 }]} />

      <View style={styles.stickerLayer}>
        {!preview && stickers.slice(0, 4).map((sticker, index) => (
            <View
              key={sticker.id}
              style={[
                styles.slot,
                { width: stickerSize, height: stickerSize },
                { borderColor: index % 2 === 0 ? '#7B61FF' : '#FF6B9D' },
                stickerPositions[index],
              ]}
            >
              <Image source={{ uri: sticker.image_url }} style={styles.stickerImage} resizeMode="contain" />
            </View>
          ))}
      </View>

      {!preview && <Text style={styles.bookName} numberOfLines={1}>{truncateTitle(bookName, 18).toUpperCase()}</Text>}
      <View style={[styles.metadataStrip, { left: sideInset, right: sideInset }]}>
        {!preview && (
          <>
            <Text style={styles.metaText}>PEELZY 400TX   EI 400</Text>
            <Text style={styles.metaCode}>{code} {String(stickerCount).padStart(2, '0')}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cover: {
    position: 'relative',
    backgroundColor: '#111111',
    borderRadius: 4,
    overflow: 'hidden',
  },
  perforation: {
    position: 'absolute',
    width: 14,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#2A2A2A',
  },
  frame: {
    position: 'absolute',
    top: 10,
    left: 26,
    right: 26,
    bottom: 30,
    backgroundColor: '#1E1E1E',
    borderRadius: 2,
  },
  outerBorder: {
    position: 'absolute',
    top: 10,
    left: 26,
    right: 26,
    bottom: 30,
    borderWidth: 1.5,
    borderColor: '#7B61FF',
    borderRadius: 2,
  },
  innerBorder: {
    position: 'absolute',
    top: 13,
    left: 29,
    right: 29,
    bottom: 33,
    borderWidth: 0.5,
    borderColor: '#FF6B9D',
    borderRadius: 1,
  },
  stickerLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 30,
  },
  slot: {
    position: 'absolute',
    backgroundColor: '#1A1A2E',
    borderWidth: 1.5,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerImage: {
    width: '84%',
    height: '84%',
  },
  bookName: {
    position: 'absolute',
    bottom: 38,
    left: 36,
    right: 36,
    color: '#888888',
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  metadataStrip: {
    position: 'absolute',
    bottom: 0,
    left: 26,
    right: 26,
    height: 22,
    backgroundColor: '#0A0A0A',
    paddingHorizontal: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    color: '#555555',
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '700',
  },
  metaCode: {
    color: '#7B61FF',
    fontFamily: 'Courier',
    fontSize: 8,
    fontWeight: '700',
  },
});
