import { updateStoreProperties } from './updateStoreProperties';
import { PROPERTY_TYPE } from './utils/constant';
import { echoWarningLog } from './utils/logger';

/**
 * ストアデータのリストを更新するメイン処理
 */
export const updateStoreListData = async (): Promise<void> => {
  try {
    // stateプロパティのリスト更新
    await updateStoreProperties({
      propertyType: PROPERTY_TYPE.STATE.NAME,
      outputPath: PROPERTY_TYPE.STATE.OUTPUT_FILE_PATH,
    });

    // gettersプロパティのリスト更新
    await updateStoreProperties({
      propertyType: PROPERTY_TYPE.GETTERS.NAME,
      outputPath: PROPERTY_TYPE.GETTERS.OUTPUT_FILE_PATH,
    });
  } catch (error) {
    echoWarningLog('ストアデータの更新中にエラーが発生しました', error);
  }
};

await updateStoreListData();
