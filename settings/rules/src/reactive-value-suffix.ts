import { ESLintUtils, type TSESLint, type ParserServices, type TSESTree } from '@typescript-eslint/utils';
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
import type { TypeChecker } from 'typescript';

const MESSAGE_ID = 'reactiveValueSuffix' as const;

type RuleOptions = {
  functionNamesToIgnoreValueCheck?: string[];
};
type RuleContext = Readonly<TSESLint.RuleContext<typeof MESSAGE_ID, RuleOptions[]>>;
type PropertyWithIdentifierObject = TSESTree.Property & {
  key: TSESTree.Identifier;
  value: TSESTree.Identifier;
};

const getTypeServices = (context: RuleContext) => {
  const parserServices = ESLintUtils.getParserServices(context);
  const typeChecker = parserServices.program.getTypeChecker();

  return { parserServices, typeChecker };
};

export const needsValueSuffix = (
  node: TSESTree.Identifier,
  typeChecker: TypeChecker,
  parserServices: ParserServices,
): boolean => {
  const typeString = getTypeString(node, typeChecker, parserServices);

  const isRefType = typeString.includes('Ref');
  const isValueSuffixMissing = !typeString.includes('.value');
  const isParentNonNullExpression = isTSNonNullExpression(node.parent);

  return isRefType && isValueSuffixMissing && !isParentNonNullExpression;
};

const getVariableDeclarators = (context: RuleContext): TSESTree.VariableDeclarator[] => {
  return context.sourceCode.ast.body.flatMap((node) => {
    if (isVariableDeclaration(node)) {
      return node.declarations;
    }
    return [];
  });
};

const getStoreToRefsVariables = (context: RuleContext): string[] => {
  const isStoreToRefsDeclarator = (decl: TSESTree.VariableDeclarator): boolean =>
    isObjectPattern(decl.id) &&
    !!decl.init &&
    isCallExpression(decl.init) &&
    isIdentifier(decl.init.callee) &&
    decl.init.callee.name === 'storeToRefs';

  const getIdentifierNames = (decl: TSESTree.VariableDeclarator): string[] => {
    if (!isObjectPattern(decl.id)) return [];

    return decl.id.properties
      .filter(
        (prop): prop is PropertyWithIdentifierObject =>
          isProperty(prop) && isIdentifier(prop.key) && isIdentifier(prop.value),
      )
      .map((prop) => prop.value.name);
  };

  return getVariableDeclarators(context).filter(isStoreToRefsDeclarator).flatMap(getIdentifierNames);
};

const getReactiveVariableNames = (context: RuleContext): string[] => {
  // リアクティブ関数のリスト
  const REACTIVE_FUNCTIONS = ['ref', 'computed', 'reactive', 'toRef', 'shallowRef'];

  // リアクティブ関数からの変数を特定する
  const isReactiveFunction = (decl: TSESTree.VariableDeclarator): boolean =>
    !!decl.init &&
    isCallExpression(decl.init) &&
    isIdentifier(decl.init.callee) &&
    REACTIVE_FUNCTIONS.includes(decl.init.callee.name);

  // 変数名を抽出する
  const getVarNames = (node: TSESTree.VariableDeclarator): string[] => {
    if (isIdentifier(node.id)) {
      return [node.id.name];
    } else if (isObjectPattern(node.id)) {
      return node.id.properties
        .filter(
          (
            prop,
          ): prop is TSESTree.Property & {
            value: TSESTree.Identifier;
          } => isProperty(prop) && isIdentifier(prop.value),
        )
        .map((prop) => prop.value.name);
    }
    return [];
  };

  // リアクティブ関数からの変数を取得
  const reactiveVariables = getVariableDeclarators(context)
    .filter(
      (
        decl,
      ): decl is TSESTree.VariableDeclarator & {
        init: TSESTree.CallExpression & { callee: TSESTree.Identifier };
      } => isReactiveFunction(decl),
    )
    .flatMap(getVarNames);

  // storeToRefs からの変数を取得
  const storeToRefsVariables = getStoreToRefsVariables(context);

  // 両方のソースからの変数を結合して返す
  return [...reactiveVariables, ...storeToRefsVariables];
};

const getComposableFunctionCalls = (context: RuleContext): string[] => {
  const COMPOSABLES_FUNCTION_PATTERN = /^use[A-Z]/;

  // コンポーザブル関数のリスト（use[A-Z]で始まる関数）
  const isComposableCall = (decl: TSESTree.VariableDeclarator): boolean =>
    !!decl.init &&
    isCallExpression(decl.init) &&
    isIdentifier(decl.init.callee) &&
    COMPOSABLES_FUNCTION_PATTERN.test(decl.init.callee.name);

  // コンポーザブル関数からの変数を取得
  const getPropertyNames = (decl: TSESTree.VariableDeclarator): string[] => {
    if (!isObjectPattern(decl.id)) return [];

    return decl.id.properties
      .filter(
        (prop): prop is PropertyWithIdentifierObject =>
          isProperty(prop) && isIdentifier(prop.key) && isIdentifier(prop.value),
      )
      .map((prop) => prop.value.name);
  };

  return getVariableDeclarators(context)
    .filter(
      (
        decl,
      ): decl is TSESTree.VariableDeclarator & {
        id: TSESTree.ObjectPattern;
        init: TSESTree.CallExpression & { callee: TSESTree.Identifier };
      } => isComposableCall(decl),
    )
    .flatMap(getPropertyNames);
};

/**
 * Identifierノードの処理
 */
const processIdentifier = (
  node: TSESTree.Identifier,
  context: RuleContext,
  reactiveVariables: readonly string[],
  composableFunctions: readonly string[],
  ignoredFunctionNames: readonly string[],
): void => {
  if (!node.parent) return;
  if (!reactiveVariables.includes(node.name)) return;

  const { parserServices, typeChecker } = getTypeServices(context);

  // 警告を抑制する条件を確認
  if (shouldSuppressWarning(node, node.parent, composableFunctions, ignoredFunctionNames)) {
    return;
  }

  // ValueSuffixが必要なら警告
  if (needsValueSuffix(node, typeChecker, parserServices)) {
    context.report(createReportData(node, MESSAGE_ID));
  }
};

/**
 * MemberExpressionノードの処理
 */
const processMemberExpression = (
  node: TSESTree.MemberExpression,
  context: RuleContext,
  reactiveVariables: readonly string[],
): void => {
  // リアクティブ変数へのアクセスでない場合はスキップ
  if (!isIdentifier(node.object) || !reactiveVariables.includes(node.object.name)) {
    return;
  }

  // .valueプロパティにアクセスしている場合は警告しない
  if (isIdentifier(node.property) && node.property.name === 'value') {
    return;
  }

  // オブジェクトプロパティ内の場合はスキップ
  if (isProperty(node.parent) && isObjectExpression(node.parent.parent)) {
    return;
  }

  const { parserServices, typeChecker } = getTypeServices(context);

  // ValueSuffixが必要なら警告
  if (needsValueSuffix(node.object, typeChecker, parserServices)) {
    context.report(createReportData(node.object, MESSAGE_ID));
  }
};

// ----------------------------------------------------------------------------
// ルール定義
// ----------------------------------------------------------------------------

const createRule = ESLintUtils.RuleCreator(() => 'https://www.npmjs.com/package/eslint-plugin-reactive-value-suffix');

export const reactiveValueSuffix = createRule<RuleOptions[], typeof MESSAGE_ID>({
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
  create(context: RuleContext) {
    // オプションの取得
    const options = context.options[0] || {};
    const functionNamesToIgnoreValueCheck = options.functionNamesToIgnoreValueCheck || [];

    // 各種データを一度だけ収集してキャッシュ
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
