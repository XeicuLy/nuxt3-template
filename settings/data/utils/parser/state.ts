import { isArrowFunction, isPropertyAssignment, type ObjectLiteralElementLike, type SourceFile } from 'typescript';
import { PROPERTY_TYPE } from '../constant';
import { findDefineStoreCallsAndExtractProperties } from './common';
import { extractPropertyNamesFromReturnExpression, extractReturnExpressionFromArrowFunction } from './object';

/**
 * state要素から含まれるプロパティ名を抽出する関数
 */
const extractStatePropertyNames = (sourceFile: SourceFile, stateProperty: ObjectLiteralElementLike): string[] => {
  if (!isPropertyAssignment(stateProperty) || !isArrowFunction(stateProperty.initializer)) {
    return [];
  }

  const returnExpression = extractReturnExpressionFromArrowFunction(stateProperty.initializer);
  if (!returnExpression) {
    return [];
  }

  return extractPropertyNamesFromReturnExpression(sourceFile, returnExpression);
};

/**
 * ソースファイルからdefineStoreの呼び出しを見つけてstateプロパティを抽出する純粋関数
 */
export const findDefineStoreCallsAndExtractStateProperties = (sourceFile: SourceFile): string[] => {
  return findDefineStoreCallsAndExtractProperties(sourceFile, PROPERTY_TYPE.STATE.NAME, extractStatePropertyNames);
};
