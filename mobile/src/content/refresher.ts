import raw from '@content/refresher.json';

import { parseRefresherConfig, type RefresherConfig } from '@/core/refresher/schedule';

/** When refreshers fall due, in days after the first pass (D-044). Validated once at startup. */
export const REFRESHER_CONFIG: RefresherConfig = parseRefresherConfig(raw);
