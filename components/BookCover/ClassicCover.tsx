import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import CachedStickerImage from '../CachedStickerImage';
import { BookCoverProps } from './types';
import { darkenColor, truncateTitle } from './utils';
import { theme as appTheme } from '../../constants/theme';

export default function ClassicCover({
  bookName,
  stickerCount,
  stickers,
  accentColor,
  width = 300,
  height = 380,
  onPress,
  preview = false,
}: BookCoverProps) {
  const coverColor = accentColor || '#E4C0FF';
  const stickerSize = width * 0.3;
  const stickerPositions = [
    { top: height * 0.1, left: width * 0.14, transform: [{ rotate: '-10deg' }] },
    { top: height * 0.27, right: width * 0.09, transform: [{ rotate: '9deg' }] },
    { top: height * 0.48, left: width * 0.19, transform: [{ rotate: '-4deg' }] },
    { top: height * 0.17, right: width * 0.25, transform: [{ rotate: '13deg' }] },
    { top: height * 0.6, right: width * 0.16, transform: [{ rotate: '7deg' }] },
  ];

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.9 : 1}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.root, { width, height }]}
    >
      <View style={[styles.backSheet, styles.backSheetTwo]} />
      <View style={[styles.backSheet, styles.backSheetOne]} />
      <View style={[styles.cover, { backgroundColor: coverColor }]}>
        {!preview && <View style={[styles.spine, { backgroundColor: darkenColor(coverColor) }]} />}
        {!preview && <View style={styles.highlight} />}
        <View style={styles.stickerLayer}>
          {!preview && stickers.slice(0, 5).map((sticker, index) => (
              <View
                key={sticker.id}
                style={[
                  styles.stickerCard,
                  { width: stickerSize, height: stickerSize },
                  stickerPositions[index],
                ]}
              >
                <CachedStickerImage uri={sticker.image_url} style={styles.stickerImage} resizeMode="contain" />
              </View>
            ))}
        </View>
        {!preview && (
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{bookName}</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{stickerCount}</Text>
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
  },
  backSheet: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 24,
    backgroundColor: '#E9D6FF',
  },
  backSheetOne: {
    transform: [{ rotate: '-2deg' }, { translateX: -4 }],
    opacity: 0.62,
  },
  backSheetTwo: {
    transform: [{ rotate: '-4deg' }, { translateX: -8 }],
    opacity: 0.34,
  },
  cover: {
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    flexDirection: 'row',
    ...appTheme.shadow.soft,
  },
  spine: {
    width: 18,
    height: '100%',
    opacity: 0.62,
  },
  highlight: {
    position: 'absolute',
    left: 28,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  stickerLayer: {
    flex: 1,
    position: 'relative',
  },
  stickerCard: {
    position: 'absolute',
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 6,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    ...appTheme.shadow.sticker,
  },
  stickerImage: {
    width: '100%',
    height: '100%',
  },
  titleRow: {
    position: 'absolute',
    left: 36,
    right: 18,
    bottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 30,
    fontWeight: '900',
    color: appTheme.colors.text,
  },
  countBadge: {
    minWidth: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: appTheme.colors.purple,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 9,
  },
  countText: {
    fontSize: 17,
    color: '#fff',
    fontWeight: '900',
  },
});
