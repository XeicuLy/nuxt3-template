import {
  isIdentifier,
  isObjectLiteralExpression,
  isPropertyAssignment,
  type CallExpression,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  type SourceFile,
} from 'typescript';
import { processNodeRecursively } from './astUtils';
import { isDefineStoreFunctionCall } from './pinia';
import type {
  ExtractorWithoutSourceFile,
  ExtractorWithSourceFile,
  PropertyExtractor,
} from '~~/settings/types/customRule';

/**
 * オブジェクトリテラルから特定のプロパティを見つける純粋関数
 */
export const findPropertyInOptions = (
  optionsObject: ObjectLiteralExpression,
  propertyName: string,
): ObjectLiteralElementLike | undefined => {
  return optionsObject.properties.find(
    (property) => isPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === propertyName,
  );
};

/**
 * defineStoreの呼び出しからプロパティを抽出する汎用関数
 */
export const extractPropertiesFromDefineStoreCall = <T>(
  sourceFile: SourceFile,
  callExpression: CallExpression,
  propertyName: string,
  extractorFunction: PropertyExtractor<T>,
): T[] => {
  const optionsArgument = callExpression.arguments[1];

  if (!optionsArgument || !isObjectLiteralExpression(optionsArgument)) {
    return [];
  }

  const propertyNode = findPropertyInOptions(optionsArgument, propertyName);

  if (!propertyNode) {
    return [];
  }

  // 抽出関数の引数の数に基づいて、適切な呼び出し方を選択
  return extractorFunction.length === 1
    ? (extractorFunction as ExtractorWithoutSourceFile<T>)(propertyNode)
    : (extractorFunction as ExtractorWithSourceFile<T>)(sourceFile, propertyNode);
};

/**
 * ソースファイルからdefineStoreの呼び出しを見つけてプロパティを抽出する汎用関数
 */
export const findDefineStoreCallsAndExtractProperties = <T>(
  sourceFile: SourceFile,
  propertyName: string,
  extractorFunction: PropertyExtractor<T>,
): T[] => {
  return processNodeRecursively(sourceFile, isDefineStoreFunctionCall, (callExpression) =>
    extractPropertiesFromDefineStoreCall(sourceFile, callExpression, propertyName, extractorFunction),
  );
};
