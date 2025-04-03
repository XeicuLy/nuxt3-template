import { globSync } from 'glob';
import { STORE_DIR, PROPERTY_TYPE } from './utils/constant';
import { writeJsonFile, readFile } from './utils/file';
import { echoWarningLog } from './utils/logger';
import { createSourceFileFromContent } from './utils/parser/astUtils';
import { findDefineStoreCallsAndExtractGettersProperties } from './utils/parser/getters';
import { findDefineStoreCallsAndExtractStateProperties } from './utils/parser/state';
import type { PropertyType, UpdateOptions } from '../types/customRule';

/**
 * 1つのファイルから複数タイプのプロパティを同時に抽出する関数
 */
const extractPropertiesFromFile = (
  filePath: string,
  propertyType: (typeof PROPERTY_TYPE)[PropertyType]['NAME'],
): string[] => {
  try {
    const fileContent = readFile(filePath);
    const sourceFile = createSourceFileFromContent(filePath, fileContent);

    if (propertyType === PROPERTY_TYPE.STATE.NAME) {
      return findDefineStoreCallsAndExtractStateProperties(sourceFile);
    } else {
      return findDefineStoreCallsAndExtractGettersProperties(sourceFile);
    }
  } catch (error) {
    echoWarningLog(`Error extracting ${propertyType} from file ${filePath}:`, error);
    return [];
  }
};

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

    // ファイルからプロパティを抽出して配列をフラット化
    const allPropertyValues = storeFiles.flatMap((filePath) => extractPropertiesFromFile(filePath, propertyType));

    // 重複を除去
    const uniquePropertyValues = [...new Set(allPropertyValues)];

    // JSONファイルに保存
    await writeJsonFile(outputPath, uniquePropertyValues);
  } catch (error) {
    throw new Error(`${propertyType} list update error: ${error instanceof Error ? error.message : String(error)}`);
  }
};
