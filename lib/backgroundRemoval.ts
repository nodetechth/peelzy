import { Platform } from 'react-native';
import {
  isAppleSubjectLiftAvailable,
  removeBackgroundWithAppleSubjectLift,
} from './appleSubjectLift';
import {
  isAndroidMlkitSubjectSegmentationAvailable,
  removeBackgroundWithAndroidMlkit,
} from './androidMlkitSubjectSegmentation';

export type BackgroundRemovalProvider = 'apple-subject-lift' | 'android-mlkit';

type BackgroundRemovalResult = {
  error: Error | null;
  provider: BackgroundRemovalProvider;
  nativeResult?: {
    uri: string;
    subjectCount: number;
    width: number;
    height: number;
    elapsedMs: number;
    alphaMask?: string;
    contentBounds?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
};

export async function removeBackground(
  imageUrl: string
): Promise<BackgroundRemovalResult> {
  if (Platform.OS === 'ios') {
    if (!isAppleSubjectLiftAvailable()) {
      return {
        error: new Error(
          'Apple Subject Lift requires an iOS Development Build. Expo Go cannot run this sticker cutout.'
        ),
        provider: 'apple-subject-lift',
      };
    }

    const appleResult = await removeBackgroundWithAppleSubjectLift(imageUrl);
    if (appleResult.nativeResult?.uri && !appleResult.error) {
      return {
        error: null,
        provider: 'apple-subject-lift',
        nativeResult: appleResult.nativeResult,
      };
    }

    return {
      error: appleResult.error ?? new Error('Apple Subject Lift failed.'),
      provider: 'apple-subject-lift',
    };
  }

  if (Platform.OS === 'android') {
    if (!isAndroidMlkitSubjectSegmentationAvailable()) {
      return {
        error: new Error(
          'Android ML Kit requires an Android Development Build. Expo Go cannot run this sticker cutout.'
        ),
        provider: 'android-mlkit',
      };
    }

    const mlkitResult = await removeBackgroundWithAndroidMlkit(imageUrl);
    if (mlkitResult.nativeResult?.uri && !mlkitResult.error) {
      return {
        error: null,
        provider: 'android-mlkit',
        nativeResult: mlkitResult.nativeResult,
      };
    }

    return {
      error: mlkitResult.error ?? new Error('Android ML Kit subject segmentation failed.'),
      provider: 'android-mlkit',
    };
  }

  return {
    error: new Error('Sticker cutout is only available on iOS and Android.'),
    provider: 'android-mlkit',
  };
}
