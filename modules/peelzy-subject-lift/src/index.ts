import { requireOptionalNativeModule } from 'expo-modules-core';

export type SubjectLiftResult = {
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

type SubjectLiftModule = {
  liftSubjectAsync(imageUri: string): Promise<SubjectLiftResult>;
};

const PeelzySubjectLift = requireOptionalNativeModule<SubjectLiftModule>('PeelzySubjectLift');

export function isSubjectLiftAvailable(): boolean {
  return typeof PeelzySubjectLift?.liftSubjectAsync === 'function';
}

export async function liftSubjectAsync(imageUri: string): Promise<SubjectLiftResult> {
  if (!PeelzySubjectLift?.liftSubjectAsync) {
    throw new Error('Apple Subject Lift native module is not available.');
  }

  return PeelzySubjectLift.liftSubjectAsync(imageUri);
}
