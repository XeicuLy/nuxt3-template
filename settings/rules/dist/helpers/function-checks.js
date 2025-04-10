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
export const isPropertyValue = (node) => isProperty(node) && isObjectExpression(node.parent);
export const findAncestorCallExpression = (node) => {
  let currentNode = node.parent;
  while (currentNode) {
    if (isCallExpression(currentNode)) {
      return currentNode;
    }
    currentNode = currentNode.parent;
  }
  return null;
};
export const isWatchArgument = (node) => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;
  if (!isIdentifier(callExpression.callee) || callExpression.callee.name !== 'watch') {
    return false;
  }
  if (callExpression.arguments[0] === node) {
    return true;
  }
  return isArrayExpression(callExpression.arguments[0]) && callExpression.arguments[0].elements.includes(node);
};
export const isSpecialFunctionArgument = (node, specialFunctions) => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;
  if (!isIdentifier(callExpression.callee) || !specialFunctions.includes(callExpression.callee.name)) {
    return false;
  }
  return callExpression.arguments.includes(node);
};
export const isComposablesFunctionArgument = (node) => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;
  const COMPOSABLES_FUNCTION_PATTERN = /^use[A-Z]/;
  if (!isIdentifier(callExpression.callee) || !COMPOSABLES_FUNCTION_PATTERN.test(callExpression.callee.name)) {
    return false;
  }
  return callExpression.arguments.includes(node);
};
export const shouldSuppressWarning = (node, parent, composableFunctions, ignoredFunctionNames) => {
  const isDeclaration = isVariableDeclarator(parent) || isArrayPattern(parent);
  const isObjectPatternProperty = isProperty(parent) && parent.parent && isObjectPattern(parent.parent);
  const isValueAccess = isMemberExpression(parent) && isIdentifier(parent.property) && parent.property.name === 'value';
  const isObjectMember = isMemberExpression(parent) && parent.property !== node;
  const isObjectPropertyKey = isProperty(parent) && parent.key === node;
  const isPropertyValueAccess = isProperty(parent) && isObjectExpression(parent.parent);
  const isArrayElement = isArrayExpression(node.parent);
  const isWatchArg = isWatchArgument(node);
  const isSpecialFunctionArg = isSpecialFunctionArgument(node, composableFunctions);
  const isIgnoredFunctionArg = isArgumentOfFunction(node, ignoredFunctionNames);
  const isComposablesArg = isComposablesFunctionArgument(node);
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
export const isArgumentOfFunction = (node, ignoredFunctionNames) => {
  const parent = node.parent;
  if (!isCallExpression(parent)) {
    return false;
  }
  return (
    parent.arguments.includes(node) && isIdentifier(parent.callee) && ignoredFunctionNames.includes(parent.callee.name)
  );
};
