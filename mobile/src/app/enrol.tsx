import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getDevice } from '@/db/device';
import { MAX_WORKER_NAME, createWorker } from '@/db/workers';
import { LOCALES, isLocale, type Locale } from '@/i18n';
import { Body, Button, Card, Field, Screen, Segmented } from '@/ui/components';

export default function EnrolScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [lang, setLang] = useState<Locale>(isLocale(i18n.language) ? i18n.language : 'hi');
  const [error, setError] = useState<string | null>(null);

  function save() {
    const device = getDevice();
    const displayName = name.trim().replace(/\s+/g, ' ');
    if (device === null) return;
    if (displayName === '') {
      setError(t('enrol.name.required'));
      return;
    }
    const worker = createWorker({
      displayName,
      employeeCode: code.trim() === '' ? null : code.trim(),
      siteCode: device.siteCode,
      preferredLang: lang,
    });
    router.replace({ pathname: '/worker/[id]', params: { id: worker.id } });
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('enrol.title') }} />
      <Card>
        <Field
          label={t('enrol.name.label')}
          hint={t('enrol.name.hint')}
          error={error}
          value={name}
          onChangeText={setName}
          maxLength={MAX_WORKER_NAME}
          autoCapitalize="words"
        />
        <Field label={t('enrol.employee_code.label')} value={code} onChangeText={setCode} maxLength={40} />
        <Body>{t('enrol.language.label')}</Body>
        <Segmented options={LOCALES.map((l) => ({ value: l, label: t(`lang.${l}`) }))} value={lang} onChange={setLang} />
        <Button label={t('enrol.save.button')} onPress={save} />
      </Card>
    </Screen>
  );
}
