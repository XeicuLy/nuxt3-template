import { ESLintUtils } from '@typescript-eslint/utils';
import {
  isCallExpression,
  isIdentifier,
  isObjectExpression,
  isObjectPattern,
  isProperty,
  isTSNonNullExpression,
  isVariableDeclaration,
} from './helpers/ast-helpers.js';
import { shouldSuppressWarning } from './helpers/function-checks.js';
import { createReportData, getTypeString, memoize } from './helpers/types.js';
const MESSAGE_ID = 'reactiveValueSuffix';
const getTypeServices = (context) => {
  const parserServices = ESLintUtils.getParserServices(context);
  const typeChecker = parserServices.program.getTypeChecker();
  return { parserServices, typeChecker };
};
export const needsValueSuffix = (node, typeChecker, parserServices) => {
  const typeString = getTypeString(node, typeChecker, parserServices);
  const isRefType = typeString.includes('Ref');
  const isValueSuffixMissing = !typeString.includes('.value');
  const isParentNonNullExpression = isTSNonNullExpression(node.parent);
  return isRefType && isValueSuffixMissing && !isParentNonNullExpression;
};
const getVariableDeclarators = (context) => {
  return context.sourceCode.ast.body.flatMap((node) => {
    if (isVariableDeclaration(node)) {
      return node.declarations;
    }
    return [];
  });
};
const getStoreToRefsVariables = (context) => {
  const isStoreToRefsDeclarator = (decl) =>
    isObjectPattern(decl.id) &&
    !!decl.init &&
    isCallExpression(decl.init) &&
    isIdentifier(decl.init.callee) &&
    decl.init.callee.name === 'storeToRefs';
  const getIdentifierNames = (decl) => {
    if (!isObjectPattern(decl.id)) return [];
    return decl.id.properties
      .filter((prop) => isProperty(prop) && isIdentifier(prop.key) && isIdentifier(prop.value))
      .map((prop) => prop.value.name);
  };
  return getVariableDeclarators(context).filter(isStoreToRefsDeclarator).flatMap(getIdentifierNames);
};
const getReactiveVariableNames = (context) => {
  const REACTIVE_FUNCTIONS = ['ref', 'computed', 'reactive', 'toRef', 'shallowRef'];
  const isReactiveFunction = (decl) =>
    !!decl.init &&
    isCallExpression(decl.init) &&
    isIdentifier(decl.init.callee) &&
    REACTIVE_FUNCTIONS.includes(decl.init.callee.name);
  const getVarNames = (node) => {
    if (isIdentifier(node.id)) {
      return [node.id.name];
    } else if (isObjectPattern(node.id)) {
      return node.id.properties
        .filter((prop) => isProperty(prop) && isIdentifier(prop.value))
        .map((prop) => prop.value.name);
    }
    return [];
  };
  const reactiveVariables = getVariableDeclarators(context)
    .filter((decl) => isReactiveFunction(decl))
    .flatMap(getVarNames);
  const storeToRefsVariables = getStoreToRefsVariables(context);
  return [...reactiveVariables, ...storeToRefsVariables];
};
const getComposableFunctionCalls = (context) => {
  const COMPOSABLES_FUNCTION_PATTERN = /^use[A-Z]/;
  const isComposableCall = (decl) =>
    !!decl.init &&
    isCallExpression(decl.init) &&
    isIdentifier(decl.init.callee) &&
    COMPOSABLES_FUNCTION_PATTERN.test(decl.init.callee.name);
  const getPropertyNames = (decl) => {
    if (!isObjectPattern(decl.id)) return [];
    return decl.id.properties
      .filter((prop) => isProperty(prop) && isIdentifier(prop.key) && isIdentifier(prop.value))
      .map((prop) => prop.value.name);
  };
  return getVariableDeclarators(context)
    .filter((decl) => isComposableCall(decl))
    .flatMap(getPropertyNames);
};
const processIdentifier = (node, context, reactiveVariables, composableFunctions, ignoredFunctionNames) => {
  if (!node.parent) return;
  if (!reactiveVariables.includes(node.name)) return;
  const { parserServices, typeChecker } = getTypeServices(context);
  if (shouldSuppressWarning(node, node.parent, composableFunctions, ignoredFunctionNames)) {
    return;
  }
  if (needsValueSuffix(node, typeChecker, parserServices)) {
    context.report(createReportData(node, MESSAGE_ID));
  }
};
const processMemberExpression = (node, context, reactiveVariables) => {
  if (!isIdentifier(node.object) || !reactiveVariables.includes(node.object.name)) {
    return;
  }
  if (isIdentifier(node.property) && node.property.name === 'value') {
    return;
  }
  if (isProperty(node.parent) && isObjectExpression(node.parent.parent)) {
    return;
  }
  const { parserServices, typeChecker } = getTypeServices(context);
  if (needsValueSuffix(node.object, typeChecker, parserServices)) {
    context.report(createReportData(node.object, MESSAGE_ID));
  }
};
const createRule = ESLintUtils.RuleCreator(() => 'https://www.npmjs.com/package/eslint-plugin-reactive-value-suffix');
export const reactiveValueSuffix = createRule({
  name: 'reactive-value-suffix',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Rule to enforce accessing reactive values with a ".value" suffix.',
    },
    messages: {
      [MESSAGE_ID]: 'Reactive variable "{{name}}" should be accessed with "{{name}}.value"',
    },
    schema: [
      {
        type: 'object',
        properties: {
          functionNamesToIgnoreValueCheck: {
            type: 'array',
            items: { type: 'string' },
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{}],
  create(context) {
    const options = context.options[0] || {};
    const functionNamesToIgnoreValueCheck = options.functionNamesToIgnoreValueCheck || [];
    const getReactiveVariables = memoize(() => getReactiveVariableNames(context));
    const getComposableFunctions = memoize(() => getComposableFunctionCalls(context));
    return {
      Identifier(node) {
        processIdentifier(
          node,
          context,
          getReactiveVariables(),
          getComposableFunctions(),
          functionNamesToIgnoreValueCheck,
        );
      },
      MemberExpression(node) {
        processMemberExpression(node, context, getReactiveVariables());
      },
    };
  },
});
