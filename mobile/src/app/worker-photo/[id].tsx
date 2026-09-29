import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { Body, Button, Card, Screen } from '@/ui/components';
import { colors } from '@/ui/theme';
import { discardTakenPhoto, removeWorkerPhoto, saveWorkerPhoto, workerPhotoUri } from '@/workers/photos';

/** Stored photo size: the card's 16 × 20 mm photo box at about 760 dpi, a few tens of KB. */
const PHOTO_PX = { width: 480, height: 600 };

/**
 * ID card photo (D-046): the supervisor photographs the worker, checks the framing and keeps it.
 * What is kept is the framed preview, saved at PHOTO_PX, so the card shows exactly this crop and
 * no full-size camera image is stored. Photos stay on this phone.
 */
export default function WorkerPhotoScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [taken, setTaken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasPhoto] = useState(() => workerPhotoUri(id) !== null);
  const camera = useRef<CameraView>(null);
  const frame = useRef<View>(null);

  if (permission === null) return null;
  const frameWidth = Math.round(width * 0.7);
  const frameHeight = Math.round((frameWidth * PHOTO_PX.height) / PHOTO_PX.width);

  const take = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const picture = await camera.current?.takePictureAsync({ quality: 0.9 });
      if (picture !== undefined) setTaken(picture.uri);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const keep = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const framed = await captureRef(frame, { format: 'jpg', quality: 0.85, result: 'tmpfile', ...PHOTO_PX });
      saveWorkerPhoto(id, framed);
      if (taken !== null) discardTakenPhoto(taken);
      router.back();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  };

  const remove = () => {
    removeWorkerPhoto(id);
    router.back();
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: t('photo.title') }} />
      {!permission.granted ? (
        <Card>
          <Body>{t('photo.camera.body')}</Body>
          {permission.canAskAgain ? <Button label={t('verify.camera.allow.button')} onPress={() => void requestPermission()} /> : null}
        </Card>
      ) : (
        <Card>
          <View ref={frame} collapsable={false} style={[styles.frame, { width: frameWidth, height: frameHeight }]}>
            {taken !== null ? (
              <Image source={{ uri: taken }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <CameraView ref={camera} style={StyleSheet.absoluteFill} facing={facing} />
            )}
          </View>
          <Body muted>{t('photo.hint')}</Body>
          {failed ? <Body>{t('photo.failed')}</Body> : null}
          {taken === null ? (
            <>
              <Button label={t('photo.capture.button')} onPress={() => void take()} disabled={busy} />
              <Button kind="secondary" label={t('photo.flip.button')} onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} disabled={busy} />
            </>
          ) : (
            <>
              <Button label={t('photo.use.button')} onPress={() => void keep()} disabled={busy} />
              <Button
                kind="secondary"
                label={t('photo.retake.button')}
                onPress={() => {
                  discardTakenPhoto(taken);
                  setTaken(null);
                }}
                disabled={busy}
              />
            </>
          )}
        </Card>
      )}
      {hasPhoto ? <Button kind="danger" label={t('photo.remove.button')} onPress={remove} disabled={busy} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  // Square corners: this view is what gets saved
  frame: { alignSelf: 'center', overflow: 'hidden', backgroundColor: colors.text },
});
