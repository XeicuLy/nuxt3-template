import { globSync } from 'glob';
import { STATE_REGEX, STORE_DIR, STORE_STATE_LIST_PATH } from './utils/constant';
import { readJsonFile, writeJsonFile } from './utils/json';
import { logMessage } from './utils/logger';
import { extractValuesByRegex, getUniqueValues } from './utils/regex';

/**
 * stateの値を抽出してJSONファイルを更新する関数
 */
const updateStateValues = async (): Promise<void> => {
  const storeFiles = globSync(`${STORE_DIR}/**/*.ts`);
  const allStateValues = storeFiles.flatMap((filePath) => extractValuesByRegex(filePath, STATE_REGEX));
  const uniqueStateValues = getUniqueValues(allStateValues);

  const storeStateList = readJsonFile(STORE_STATE_LIST_PATH);
  const updatedStateList = storeStateList.filter((value) => uniqueStateValues.includes(value));
  uniqueStateValues.forEach((value) => {
    if (!updatedStateList.includes(value)) {
      updatedStateList.push(value);
    }
  });
  await writeJsonFile(STORE_STATE_LIST_PATH, updatedStateList);
  logMessage('store-state-list.json が更新されました。');
};

export default updateStateValues;
