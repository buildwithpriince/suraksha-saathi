import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { getDevice } from '@/db/device';
import { createWorker } from '@/db/workers';
import { isLocale } from '@/i18n';
import { WorkerForm } from '@/ui/WorkerForm';
import { Screen } from '@/ui/components';

export default function EnrolScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  return (
    <Screen>
      <Stack.Screen options={{ title: t('enrol.title') }} />
      <WorkerForm
        initial={{ displayName: '', employeeCode: '', preferredLang: isLocale(i18n.language) ? i18n.language : 'hi' }}
        submitLabel={t('enrol.save.button')}
        onSubmit={(fields) => {
          const device = getDevice();
          if (device === null) return;
          const worker = createWorker({ ...fields, siteCode: device.siteCode });
          router.replace({ pathname: '/worker/[id]', params: { id: worker.id } });
        }}
      />
    </Screen>
  );
}
