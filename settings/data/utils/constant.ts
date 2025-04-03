import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const __filename = fileURLToPath(import.meta.url);
export const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.join(__dirname, '../../../');
export const STORE_DIR = path.join(PROJECT_ROOT, 'src/store');

export const STORE_DATA_DIR = path.join(PROJECT_ROOT, 'settings/data/json');
export const STORE_STATE_LIST_PATH = path.join(STORE_DATA_DIR, 'store-state-list.json');
export const STORE_GETTERS_LIST_PATH = path.join(STORE_DATA_DIR, 'store-getters-list.json');

export const PROPERTY_TYPE = {
  STATE: {
    NAME: 'state',
    OUTPUT_FILE_PATH: STORE_STATE_LIST_PATH,
  } as const,
  GETTERS: {
    NAME: 'getters',
    OUTPUT_FILE_PATH: STORE_GETTERS_LIST_PATH,
  } as const,
} as const;
