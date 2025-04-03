import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format, resolveConfig } from 'prettier';
import { PROJECT_ROOT } from './constant';

/**
 * ファイルを読み込む関数
 * @param filePath - 読み込むファイルのパス
 * @returns ファイルの内容
 * @throws エラーが発生した場合はErrorをスロー
 */
export const readFile = (filePath: string): string => {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  try {
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`File read error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * ファイルにデータを書き込む関数
 * @param filePath - 書き込むファイルのパス
 * @param data - 書き込むデータ
 * @throws エラーが発生した場合はErrorをスロー
 */
export const writeFile = (filePath: string, data: string): void => {
  try {
    writeFileSync(filePath, data, 'utf-8');
  } catch (error) {
    throw new Error(`File write error: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * JSONファイルにデータを書き込む関数
 * @param filePath - 書き込み先のJSONファイルのパス
 * @param data - 書き込むデータ
 * @throws エラーが発生した場合はErrorをスロー
 */
export const writeJsonFile = async <T>(filePath: string, data: T): Promise<void> => {
  try {
    const options = await resolveConfig(join(PROJECT_ROOT, 'prettier.config.mjs'));
    const formattedJson = await format(JSON.stringify(data), { ...options, parser: 'json' });
    writeFile(filePath, formattedJson);
  } catch (error) {
    throw new Error(`JSON file write error: ${error instanceof Error ? error.message : String(error)}`);
  }
};
