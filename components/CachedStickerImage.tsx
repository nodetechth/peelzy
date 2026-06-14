import { memo, useEffect, useState } from 'react';
import { Image, ImageProps } from 'react-native';
import { getCachedStickerImageUri } from '../lib/stickerImageCache';

type CachedStickerImageProps = Omit<ImageProps, 'source'> & {
  uri: string;
};

const CachedStickerImage = memo(function CachedStickerImage({ uri, ...props }: CachedStickerImageProps) {
  const [sourceUri, setSourceUri] = useState(uri);

  useEffect(() => {
    let isMounted = true;
    setSourceUri(uri);

    getCachedStickerImageUri(uri).then((cachedUri) => {
      if (isMounted) {
        setSourceUri(cachedUri || uri);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [uri]);

  return <Image {...props} source={{ uri: sourceUri }} />;
});

export default CachedStickerImage;
