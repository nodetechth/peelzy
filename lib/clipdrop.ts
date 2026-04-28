import { File, Paths } from 'expo-file-system/next';
import { decode } from 'base64-arraybuffer';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const CLIPDROP_API_URL = 'https://clipdrop-api.co/remove-background/v1';

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

async function downloadImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  const blob = await response.blob();
  return blobToBase64(blob);
}

async function saveBase64ToFile(base64: string, fileName: string): Promise<string> {
  const file = new File(Paths.cache, fileName);
  const arrayBuffer = decode(base64);
  await file.write(new Uint8Array(arrayBuffer));
  return file.uri;
}

async function callClipdropApi(localUri: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append('image_file', {
    uri: localUri,
    name: 'image.jpg',
    type: 'image/jpeg',
  } as any);

  const response = await fetch(CLIPDROP_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Clipdrop API error: ${response.status} - ${errorText}`);
  }

  const blob = await response.blob();
  return blobToBase64(blob);
}

export async function removeBackground(
  imageUrl: string
): Promise<{ base64: string | null; error: Error | null }> {
  try {
    const apiKey = process.env.EXPO_PUBLIC_CLIPDROP_API_KEY;
    if (!apiKey) {
      return { base64: null, error: new Error('CLIPDROP_API_KEY is not configured') };
    }

    const imageBase64 = await downloadImageAsBase64(imageUrl);

    const tempFileName = `temp_${generateUUID()}.jpg`;
    const localUri = await saveBase64ToFile(imageBase64, tempFileName);

    const resultBase64 = await callClipdropApi(localUri, apiKey);

    try {
      const tempFile = new File(localUri);
      await tempFile.delete();
    } catch {}

    return { base64: resultBase64, error: null };
  } catch (error) {
    return { base64: null, error: error as Error };
  }
}
