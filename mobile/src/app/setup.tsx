import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createDevice } from '@/device/identity';
import { Button, Card, Field, Screen } from '@/ui/components';

const SITE_CODE = /^[A-Z0-9-]{2,16}$/;

/** First launch: which site this device serves (docs/01 "Device setup"). */
export default function SetupScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [site, setSite] = useState('DHN-01');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const code = site.trim().toUpperCase();
    if (!SITE_CODE.test(code)) {
      setError(t('setup.site_code.invalid'));
      return;
    }
    createDevice(code);
    router.replace('/');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('setup.title'), headerBackVisible: false }} />
      <Card>
        <Field
          label={t('setup.site_code.label')}
          hint={t('setup.site_code.hint')}
          error={error}
          value={site}
          onChangeText={setSite}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
        />
        <Button label={t('setup.save.button')} onPress={save} />
      </Card>
    </Screen>
  );
}
