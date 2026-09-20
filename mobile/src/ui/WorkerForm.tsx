import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { LOCALES, isLocale, type Locale } from '@/core/locales';
import { MAX_EMPLOYEE_CODE, MAX_WORKER_NAME, workerFields, type WorkerFieldError, type WorkerFields } from '@/core/workers/edit';

import { Body, Button, Card, Field, Segmented } from './components';

const ERROR_KEYS: Record<WorkerFieldError, string> = {
  name_required: 'enrol.name.required',
  name_too_long: 'enrol.name.hint',
  code_too_long: 'enrol.employee_code.too_long',
  bad_language: 'enrol.language.required',
};

/** Name, employee code and language, shared by enrol and edit so both validate the same (D-035). */
export function WorkerForm({
  initial,
  submitLabel,
  onSubmit,
  children,
}: {
  initial: { displayName: string; employeeCode: string; preferredLang: string };
  submitLabel: string;
  onSubmit: (fields: WorkerFields) => void;
  /** Shown above the submit button, e.g. a note about what the change affects. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial.displayName);
  const [code, setCode] = useState(initial.employeeCode);
  const [lang, setLang] = useState<Locale>(isLocale(initial.preferredLang) ? initial.preferredLang : 'hi');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const result = workerFields({ displayName: name, employeeCode: code, preferredLang: lang });
    if (!result.ok) {
      setError(t(ERROR_KEYS[result.error]));
      return;
    }
    setError(null);
    onSubmit(result.fields);
  };

  return (
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
      <Field label={t('enrol.employee_code.label')} value={code} onChangeText={setCode} maxLength={MAX_EMPLOYEE_CODE} />
      <Body>{t('enrol.language.label')}</Body>
      <Segmented options={LOCALES.map((l) => ({ value: l, label: t(`lang.${l}`) }))} value={lang} onChange={setLang} />
      {children}
      <Button label={submitLabel} onPress={submit} />
    </Card>
  );
}
