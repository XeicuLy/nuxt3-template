import {
  isArrayExpression,
  isArrayPattern,
  isCallExpression,
  isIdentifier,
  isMemberExpression,
  isObjectExpression,
  isObjectPattern,
  isProperty,
  isVariableDeclarator,
} from './ast-helpers.js';
import type { TSESTree } from '@typescript-eslint/utils';

export const isPropertyValue = (node: TSESTree.Node): boolean => isProperty(node) && isObjectExpression(node.parent);

/**
 * 祖先ノードの中からCallExpressionを探す
 */
export const findAncestorCallExpression = (node: TSESTree.Node): TSESTree.CallExpression | null => {
  let currentNode: TSESTree.Node | undefined = node.parent;

  while (currentNode) {
    if (isCallExpression(currentNode)) {
      return currentNode;
    }
    currentNode = currentNode.parent;
  }

  return null;
};

/**
 * ノードがwatch関数の第一引数かどうかをチェック
 */
export const isWatchArgument = (node: TSESTree.Identifier): boolean => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;

  // watch関数の呼び出しか確認
  if (!isIdentifier(callExpression.callee) || callExpression.callee.name !== 'watch') {
    return false;
  }

  // 第一引数がidentifierの場合
  if (callExpression.arguments[0] === node) {
    return true;
  }

  // 第一引数が配列の場合（複数の監視対象）
  return isArrayExpression(callExpression.arguments[0]) && callExpression.arguments[0].elements.includes(node);
};

/**
 * 特定の関数の引数として使用されているかチェック
 */
export const isSpecialFunctionArgument = (node: TSESTree.Identifier, specialFunctions: readonly string[]): boolean => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;

  // 特別な関数の呼び出しか確認
  if (!isIdentifier(callExpression.callee) || !specialFunctions.includes(callExpression.callee.name)) {
    return false;
  }

  // 引数にノードが含まれているか確認
  return callExpression.arguments.includes(node);
};

/**
 * composables関数の引数として使用されているかチェック
 */
export const isComposablesFunctionArgument = (node: TSESTree.Identifier): boolean => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;

  const COMPOSABLES_FUNCTION_PATTERN = /^use[A-Z]/;

  if (!isIdentifier(callExpression.callee) || !COMPOSABLES_FUNCTION_PATTERN.test(callExpression.callee.name)) {
    return false;
  }

  return callExpression.arguments.includes(node);
};

/**
 * 特定の条件でリアクティブ変数の警告を抑制するかどうか判断する
 */
export const shouldSuppressWarning = (
  node: TSESTree.Identifier,
  parent: TSESTree.Node,
  composableFunctions: readonly string[],
  ignoredFunctionNames: readonly string[],
): boolean => {
  // 親ノードに基づく条件
  const isDeclaration = isVariableDeclarator(parent) || isArrayPattern(parent);
  const isObjectPatternProperty = isProperty(parent) && parent.parent && isObjectPattern(parent.parent);
  const isValueAccess = isMemberExpression(parent) && isIdentifier(parent.property) && parent.property.name === 'value';
  const isObjectMember = isMemberExpression(parent) && parent.property !== node;
  const isObjectPropertyKey = isProperty(parent) && parent.key === node;
  const isPropertyValueAccess = isProperty(parent) && isObjectExpression(parent.parent);

  // 配列リテラル内の要素かどうか
  const isArrayElement = isArrayExpression(node.parent);

  // 関数パラメータ関連
  const isWatchArg = isWatchArgument(node);
  const isSpecialFunctionArg = isSpecialFunctionArgument(node, composableFunctions);
  const isIgnoredFunctionArg = isArgumentOfFunction(node, ignoredFunctionNames);
  const isComposablesArg = isComposablesFunctionArgument(node);

  // いずれかの条件が真であれば警告を抑制
  return (
    isDeclaration ||
    isObjectPatternProperty ||
    isValueAccess ||
    isObjectMember ||
    isObjectPropertyKey ||
    isPropertyValueAccess ||
    isWatchArg ||
    isSpecialFunctionArg ||
    isIgnoredFunctionArg ||
    isArrayElement ||
    isComposablesArg
  );
};

/**
 * 特定の関数の引数として使用されているかチェック（利用者側の実装用に外部で定義）
 */
export const isArgumentOfFunction = (node: TSESTree.Identifier, ignoredFunctionNames: readonly string[]): boolean => {
  const parent = node.parent;

  if (!isCallExpression(parent)) {
    return false;
  }

  return (
    parent.arguments.includes(node) && isIdentifier(parent.callee) && ignoredFunctionNames.includes(parent.callee.name)
  );
};
