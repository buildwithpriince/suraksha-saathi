import * as Print from 'expo-print';

import type { WorkerRecord } from '@/core/sync/payloads';
import { idCardSheetHtml, workerCardText } from '@/core/workers/idCard';
import i18n from '@/i18n';

/** Card lines under the name, in the current app language. */
export function cardLines(worker: WorkerRecord): string[] {
  const lines = [i18n.t('card.site.value', { site: worker.siteCode })];
  if (worker.employeeCode !== null) lines.unshift(i18n.t('card.code.value', { code: worker.employeeCode }));
  return lines;
}

/**
 * Opens the system print dialog for these workers' ID cards (D-034). Android's dialog can also
 * save a PDF. Everything is generated on the device, so it works offline.
 */
export async function printIdCards(workers: readonly WorkerRecord[]): Promise<void> {
  const html = idCardSheetHtml(
    workers.map((w) => ({ name: w.displayName, lines: cardLines(w), qrText: workerCardText(w.id) })),
    { heading: i18n.t('app.title'), title: i18n.t('card.title') },
  );
  await Print.printAsync({ html });
}
