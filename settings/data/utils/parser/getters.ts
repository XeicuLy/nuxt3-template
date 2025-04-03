import {
  isIdentifier,
  isMethodDeclaration,
  isObjectLiteralExpression,
  isPropertyAssignment,
  type ObjectLiteralElementLike,
  type SourceFile,
} from 'typescript';
import { PROPERTY_TYPE } from '../constant';
import { findDefineStoreCallsAndExtractProperties } from './common';

/**
 * getters要素から含まれるプロパティ名を抽出する関数
 * sourceFileを必要としないためシンプルな実装
 */
const extractGettersPropertyNames = (gettersProperty: ObjectLiteralElementLike): string[] => {
  if (!isPropertyAssignment(gettersProperty) || !isObjectLiteralExpression(gettersProperty.initializer)) {
    return [];
  }

  // gettersはオブジェクトリテラルのプロパティとして定義される
  // プロパティ名（ゲッター名）を抽出
  return gettersProperty.initializer.properties
    .map((property) => {
      // アロー関数形式のゲッター: gettersFunc: (state) => state.count
      if (isPropertyAssignment(property) && isIdentifier(property.name)) {
        return property.name.escapedText?.toString() || property.name.text;
      }

      // メソッド構文のゲッター: gettersFunc(state) { return state.count + 2; }
      if (isMethodDeclaration(property) && isIdentifier(property.name)) {
        return property.name.escapedText?.toString() || property.name.text;
      }

      return '';
    })
    .filter(Boolean);
};

/**
 * ソースファイルからdefineStoreの呼び出しを見つけてゲッタープロパティを抽出する純粋関数
 */
export const findDefineStoreCallsAndExtractGettersProperties = (sourceFile: SourceFile): string[] => {
  return findDefineStoreCallsAndExtractProperties(sourceFile, PROPERTY_TYPE.GETTERS.NAME, extractGettersPropertyNames);
};
