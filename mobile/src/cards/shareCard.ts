import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Saves a drawn wallet card (D-046) as a PNG and opens the Android share sheet, so it can go to
 * WhatsApp, Files or a printer app. The image is taken at the phone's own pixel density (about
 * 900–1200 px wide, 270–360 dpi at the real card size). Works offline; only the chosen app may
 * need a network. Resolves false if this phone cannot share. The PNG stays in the cache folder
 * (Android clears it): the share sheet returns before the chosen app has read the file.
 */
export async function shareCard(card: RefObject<View | null>, dialogTitle: string): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle, UTI: 'public.png' });
  return true;
}
