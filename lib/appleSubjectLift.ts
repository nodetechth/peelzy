import { Platform } from 'react-native';
import {
  isSubjectLiftAvailable,
  liftSubjectAsync,
  type SubjectLiftResult,
} from 'peelzy-subject-lift';

export function isAppleSubjectLiftAvailable(): boolean {
  return Platform.OS === 'ios' && isSubjectLiftAvailable();
}

export async function removeBackgroundWithAppleSubjectLift(
  imageUri: string
): Promise<{
  error: Error | null;
  nativeResult?: SubjectLiftResult;
}> {
  if (!isAppleSubjectLiftAvailable()) {
    return {
      error: new Error(
        'Apple Subject Lift is not available. Please open Peelzy with an iOS Development Build.'
      ),
    };
  }

  try {
    const result = await liftSubjectAsync(imageUri);
    return { error: null, nativeResult: result };
  } catch (error) {
    return { error: error as Error };
  }
}
