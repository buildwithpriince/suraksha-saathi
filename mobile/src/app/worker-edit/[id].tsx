import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { deleteWorker, getWorker, updateWorker } from '@/db/workers';
import { WorkerForm } from '@/ui/WorkerForm';
import { Body, Button, Screen } from '@/ui/components';

/** Edit a worker's name, employee code and language, or soft-delete them (D-035). */
export default function EditWorkerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [worker] = useState(() => getWorker(id));

  if (worker === null) return null;

  const confirmDelete = () =>
    Alert.alert(
      t('edit.delete.title', { name: worker.displayName }),
      t('edit.delete.body'),
      [
        { text: t('edit.delete.cancel'), style: 'cancel' },
        {
          text: t('edit.delete.confirm'),
          style: 'destructive',
          onPress: () => {
            deleteWorker(worker.id);
            // Back to Home: the worker page underneath would show a deleted worker
            router.dismissAll();
          },
        },
      ],
      { cancelable: true },
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: t('edit.title') }} />
      <WorkerForm
        initial={{ displayName: worker.displayName, employeeCode: worker.employeeCode ?? '', preferredLang: worker.preferredLang }}
        submitLabel={t('edit.save.button')}
        onSubmit={(fields) => {
          updateWorker(worker.id, fields);
          router.back();
        }}
      >
        <Body muted>{t('edit.name.note')}</Body>
      </WorkerForm>
      <Button kind="danger" label={t('edit.delete.button')} onPress={confirmDelete} />
    </Screen>
  );
}
