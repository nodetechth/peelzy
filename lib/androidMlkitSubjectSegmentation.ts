import { Platform } from 'react-native';
import {
  isMlkitSubjectSegmentationAvailable,
  segmentSubjectAsync,
  type SegmentSubjectResult,
} from 'peelzy-mlkit-subject-segmentation';

export function isAndroidMlkitSubjectSegmentationAvailable(): boolean {
  return Platform.OS === 'android' && isMlkitSubjectSegmentationAvailable();
}

export async function removeBackgroundWithAndroidMlkit(
  imageUri: string
): Promise<{
  error: Error | null;
  nativeResult?: SegmentSubjectResult;
}> {
  if (!isAndroidMlkitSubjectSegmentationAvailable()) {
    return {
      error: new Error(
        'Android ML Kit Subject Segmentation is not available.'
      ),
    };
  }

  try {
    const result = await segmentSubjectAsync(imageUri);
    return { error: null, nativeResult: result };
  } catch (error) {
    return { error: error as Error };
  }
}
