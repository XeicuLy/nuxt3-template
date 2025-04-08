import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
const MESSAGE_ID = 'reactiveValueSuffix';
const getTypeString = (node, typeChecker, parserServices) => {
  const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
  const type = typeChecker.getTypeAtLocation(tsNode);
  return typeChecker.typeToString(type);
};
const isIdentifier = (node) => node.type === AST_NODE_TYPES.Identifier;
const isMemberExpression = (node) => node.type === AST_NODE_TYPES.MemberExpression;
const isObjectKey = (parent, node) => parent.type === AST_NODE_TYPES.Property && parent.key === node;
const isVariableDeclarator = (node) => node.type === AST_NODE_TYPES.VariableDeclarator;
const isPropertyValue = (node) =>
  node.type === AST_NODE_TYPES.Property && node.parent?.type === AST_NODE_TYPES.ObjectExpression;
const isOriginalDeclaration = (node) =>
  node.type === AST_NODE_TYPES.VariableDeclarator || node.type === AST_NODE_TYPES.ArrayPattern;
const isArgumentOfFunction = (node, ignoredFunctionNames) => {
  const parent = node.parent;
  if (parent?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  return (
    parent.arguments.includes(node) && isIdentifier(parent.callee) && ignoredFunctionNames.includes(parent.callee.name)
  );
};
const getVariableDeclarators = (context) => {
  return context.sourceCode.ast.body.flatMap((node) => {
    if (node.type === AST_NODE_TYPES.VariableDeclaration) {
      return node.declarations;
    }
    return [];
  });
};
const getStoreToRefsVariables = (context) => {
  const isStoreToRefsDeclarator = (decl) =>
    decl.id.type === AST_NODE_TYPES.ObjectPattern &&
    !!decl.init &&
    decl.init.type === AST_NODE_TYPES.CallExpression &&
    decl.init.callee.type === AST_NODE_TYPES.Identifier &&
    decl.init.callee.name === 'storeToRefs';
  const getIdentifierNames = (decl) => {
    if (decl.id.type !== AST_NODE_TYPES.ObjectPattern) return [];
    return decl.id.properties
      .filter(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.value.type === AST_NODE_TYPES.Identifier,
      )
      .map((prop) => prop.value.name);
  };
  return getVariableDeclarators(context).filter(isStoreToRefsDeclarator).flatMap(getIdentifierNames);
};
const getReactiveVariableNames = (context) => {
  const REACTIVE_FUNCTIONS = ['ref', 'computed', 'reactive', 'toRef', 'shallowRef'];
  const isReactiveFunction = (decl) =>
    !!decl.init &&
    decl.init.type === AST_NODE_TYPES.CallExpression &&
    decl.init.callee.type === AST_NODE_TYPES.Identifier &&
    REACTIVE_FUNCTIONS.includes(decl.init.callee.name);
  const getVarNames = (node) => {
    if (node.id.type === AST_NODE_TYPES.Identifier) {
      return [node.id.name];
    } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
      return node.id.properties
        .filter((prop) => prop.type === AST_NODE_TYPES.Property && prop.value.type === AST_NODE_TYPES.Identifier)
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
    decl.init.type === AST_NODE_TYPES.CallExpression &&
    decl.init.callee.type === AST_NODE_TYPES.Identifier &&
    COMPOSABLES_FUNCTION_PATTERN.test(decl.init.callee.name);
  const getPropertyNames = (decl) => {
    if (decl.id.type !== AST_NODE_TYPES.ObjectPattern) return [];
    return decl.id.properties
      .filter(
        (prop) =>
          prop.type === AST_NODE_TYPES.Property &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.value.type === AST_NODE_TYPES.Identifier,
      )
      .map((prop) => prop.value.name);
  };
  return getVariableDeclarators(context)
    .filter((decl) => isComposableCall(decl))
    .flatMap(getPropertyNames);
};
const needsValueSuffix = (node, typeChecker, parserServices) => {
  const typeString = getTypeString(node, typeChecker, parserServices);
  const isRefType = typeString.includes('Ref');
  const isValueSuffixMissing = !typeString.includes('.value');
  const isParentNonNullExpression = node.parent && node.parent?.type === AST_NODE_TYPES.TSNonNullExpression;
  return isRefType && isValueSuffixMissing && !isParentNonNullExpression;
};
const createReportData = (node) => ({
  node,
  messageId: MESSAGE_ID,
  data: { name: node.name },
});
const findAncestorCallExpression = (node) => {
  let currentNode = node.parent;
  while (currentNode) {
    if (currentNode.type === AST_NODE_TYPES.CallExpression) {
      return currentNode;
    }
    currentNode = currentNode.parent;
  }
  return null;
};
const isWatchArgument = (node) => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;
  if (callExpression.callee.type !== AST_NODE_TYPES.Identifier || callExpression.callee.name !== 'watch') {
    return false;
  }
  if (callExpression.arguments[0] === node) {
    return true;
  }
  return (
    callExpression.arguments[0]?.type === AST_NODE_TYPES.ArrayExpression &&
    callExpression.arguments[0].elements.includes(node)
  );
};
const isSpecialFunctionArgument = (node, specialFunctions) => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;
  if (
    callExpression.callee.type !== AST_NODE_TYPES.Identifier ||
    !specialFunctions.includes(callExpression.callee.name)
  ) {
    return false;
  }
  return callExpression.arguments.includes(node);
};
const shouldSuppressWarning = (node, parent, reactiveVariables, composableFunctions, ignoredFunctionNames) => {
  const isDeclaration = isVariableDeclarator(parent) || isOriginalDeclaration(parent);
  const isObjectPatternProperty =
    parent.type === AST_NODE_TYPES.Property && parent.parent && parent.parent.type === AST_NODE_TYPES.ObjectPattern;
  const isValueAccess = isMemberExpression(parent) && isIdentifier(parent.property) && parent.property.name === 'value';
  const isObjectMember = isMemberExpression(parent) && parent.property !== node;
  const isObjectPropertyKey = isObjectKey(parent, node);
  const isPropertyValueAccess = isPropertyValue(parent);
  const isWatchArg = isWatchArgument(node);
  const isSpecialFunctionArg = isSpecialFunctionArgument(node, composableFunctions);
  const isIgnoredFunctionArg = isArgumentOfFunction(node, ignoredFunctionNames);
  return (
    isDeclaration ||
    isObjectPatternProperty ||
    isValueAccess ||
    isObjectMember ||
    isObjectPropertyKey ||
    isPropertyValueAccess ||
    isWatchArg ||
    isSpecialFunctionArg ||
    isIgnoredFunctionArg
  );
};
const processIdentifier = (
  node,
  reactiveVariables,
  composableFunctions,
  context,
  parserServices,
  typeChecker,
  ignoredFunctionNames,
) => {
  if (!node.parent) return;
  if (!reactiveVariables.includes(node.name)) return;
  if (shouldSuppressWarning(node, node.parent, reactiveVariables, composableFunctions, ignoredFunctionNames)) {
    return;
  }
  if (needsValueSuffix(node, typeChecker, parserServices)) {
    context.report(createReportData(node));
  }
};
const processMemberExpression = (node, reactiveVariables, context, parserServices, typeChecker) => {
  if (!isIdentifier(node.object) || !reactiveVariables.includes(node.object.name)) {
    return;
  }
  if (isIdentifier(node.property) && node.property.name === 'value') {
    return;
  }
  if (isPropertyValue(node)) {
    return;
  }
  if (needsValueSuffix(node.object, typeChecker, parserServices)) {
    context.report(createReportData(node.object));
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
    const parserServices = ESLintUtils.getParserServices(context);
    const typeChecker = parserServices.program.getTypeChecker();
    const options = context.options[0] || {};
    const functionNamesToIgnoreValueCheck = options.functionNamesToIgnoreValueCheck || [];
    const memoize = (fn) => {
      let cached;
      return () => {
        if (cached === undefined) {
          cached = fn();
        }
        return cached;
      };
    };
    const getReactiveVariables = memoize(() => getReactiveVariableNames(context));
    const getComposableFunctions = memoize(() => getComposableFunctionCalls(context));
    return {
      Identifier(node) {
        if (!node.parent) return;
        processIdentifier(
          node,
          getReactiveVariables(),
          getComposableFunctions(),
          context,
          parserServices,
          typeChecker,
          functionNamesToIgnoreValueCheck,
        );
      },
      MemberExpression(node) {
        processMemberExpression(node, getReactiveVariables(), context, parserServices, typeChecker);
      },
    };
  },
});
