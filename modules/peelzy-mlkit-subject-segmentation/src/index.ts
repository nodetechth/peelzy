import { requireOptionalNativeModule } from 'expo-modules-core';

export type SegmentSubjectResult = {
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

type PeelzyMlkitSubjectSegmentationModule = {
  segmentSubjectAsync(imageUri: string): Promise<SegmentSubjectResult>;
};

const nativeModule = requireOptionalNativeModule<PeelzyMlkitSubjectSegmentationModule>(
  'PeelzyMlkitSubjectSegmentation'
);

export function isMlkitSubjectSegmentationAvailable(): boolean {
  return typeof nativeModule?.segmentSubjectAsync === 'function';
}

export async function segmentSubjectAsync(imageUri: string): Promise<SegmentSubjectResult> {
  if (!nativeModule?.segmentSubjectAsync) {
    throw new Error('Android ML Kit Subject Segmentation native module is not available.');
  }

  return nativeModule.segmentSubjectAsync(imageUri);
}
