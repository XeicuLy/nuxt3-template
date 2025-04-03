import { globSync } from 'glob';
import { STORE_DIR, PROPERTY_TYPE } from './utils/constant';
import { writeJsonFile } from './utils/file';
import { echoWarningLog } from './utils/logger';
import { extractGettersProperties, extractStateProperties } from './utils/parser';

type PropertyType = 'STATE' | 'GETTERS';

interface UpdateOptions {
  propertyType: (typeof PROPERTY_TYPE)[PropertyType]['NAME'];
  outputPath: (typeof PROPERTY_TYPE)[PropertyType]['OUTPUT_FILE_PATH'];
}

/**
 * ストアプロパティを抽出してJSONファイルを更新する汎用関数
 */
export const updateStoreProperties = async ({ propertyType, outputPath }: UpdateOptions): Promise<void> => {
  try {
    const storeFiles = globSync(`${STORE_DIR}/**/*.ts`);

    if (storeFiles.length === 0) {
      console.info(`No ".ts" files found in ${STORE_DIR} directory.`); // eslint-disable-line no-console
      return;
    }

    // 抽出関数を選択
    const extractFunction =
      propertyType === PROPERTY_TYPE.STATE.NAME ? extractStateProperties : extractGettersProperties;

    // ファイルからプロパティを抽出
    const allPropertyValues = storeFiles.flatMap((filePath) => {
      try {
        return extractFunction(filePath);
      } catch (error) {
        echoWarningLog(`Error extracting ${propertyType} from file ${filePath}:`, error);
        return [];
      }
    });

    // 重複を除去
    const uniquePropertyValues = [...new Set(allPropertyValues)];

    // JSONファイルに保存
    await writeJsonFile(outputPath, uniquePropertyValues);
  } catch (error) {
    throw new Error(`${propertyType} list update error: ${error instanceof Error ? error.message : String(error)}`);
  }
};
