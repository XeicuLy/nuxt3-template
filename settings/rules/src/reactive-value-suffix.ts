import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import type { ParserServices, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type { TypeChecker } from 'typescript';

// ----------------------------------------------------------------------------
// 型定義
// ----------------------------------------------------------------------------
const MESSAGE_ID = 'reactiveValueSuffix' as const;

type RuleOptions = {
  functionNamesToIgnoreValueCheck?: string[];
};

type RuleContext = Readonly<TSESLint.RuleContext<typeof MESSAGE_ID, RuleOptions[]>>;

// ----------------------------------------------------------------------------
// ヘルパー関数
// ----------------------------------------------------------------------------

// 型情報を取得する関数
const getTypeString = (node: TSESTree.Identifier, typeChecker: TypeChecker, parserServices: ParserServices): string => {
  const tsNode = parserServices.esTreeNodeToTSNodeMap.get(node);
  const type = typeChecker.getTypeAtLocation(tsNode);
  return typeChecker.typeToString(type);
};

// AST関連のヘルパー関数
const isIdentifier = (node: TSESTree.Node): node is TSESTree.Identifier => node.type === AST_NODE_TYPES.Identifier;

const isMemberExpression = (node: TSESTree.Node): node is TSESTree.MemberExpression =>
  node.type === AST_NODE_TYPES.MemberExpression;

const isObjectKey = (parent: TSESTree.Node, node: TSESTree.Identifier): boolean =>
  parent.type === AST_NODE_TYPES.Property && parent.key === node;

const isVariableDeclarator = (node: TSESTree.Node): node is TSESTree.VariableDeclarator =>
  node.type === AST_NODE_TYPES.VariableDeclarator;

const isPropertyValue = (node: TSESTree.Node): boolean =>
  node.type === AST_NODE_TYPES.Property && node.parent?.type === AST_NODE_TYPES.ObjectExpression;

const isOriginalDeclaration = (node: TSESTree.Node): boolean =>
  node.type === AST_NODE_TYPES.VariableDeclarator || node.type === AST_NODE_TYPES.ArrayPattern;

const isArgumentOfFunction = (node: TSESTree.Identifier, ignoredFunctionNames: readonly string[]): boolean => {
  const parent = node.parent;

  if (parent?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }

  return (
    parent.arguments.includes(node) && isIdentifier(parent.callee) && ignoredFunctionNames.includes(parent.callee.name)
  );
};

// ----------------------------------------------------------------------------
// 変数収集関数
// ----------------------------------------------------------------------------

// すべての変数宣言を取得
const getVariableDeclarators = (context: RuleContext): TSESTree.VariableDeclarator[] => {
  return context.sourceCode.ast.body.flatMap((node) => {
    if (node.type === AST_NODE_TYPES.VariableDeclaration) {
      return node.declarations;
    }
    return [];
  });
};

// storeToRefsからの変数を取得する関数
const getStoreToRefsVariables = (context: RuleContext): string[] => {
  const isStoreToRefsDeclarator = (decl: TSESTree.VariableDeclarator): boolean =>
    decl.id.type === AST_NODE_TYPES.ObjectPattern &&
    !!decl.init &&
    decl.init.type === AST_NODE_TYPES.CallExpression &&
    decl.init.callee.type === AST_NODE_TYPES.Identifier &&
    decl.init.callee.name === 'storeToRefs';

  const getIdentifierNames = (decl: TSESTree.VariableDeclarator): string[] => {
    if (decl.id.type !== AST_NODE_TYPES.ObjectPattern) return [];

    return decl.id.properties
      .filter(
        (
          prop,
        ): prop is TSESTree.Property & {
          key: TSESTree.Identifier;
          value: TSESTree.Identifier;
        } =>
          prop.type === AST_NODE_TYPES.Property &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.value.type === AST_NODE_TYPES.Identifier,
      )
      .map((prop) => prop.value.name);
  };

  return getVariableDeclarators(context).filter(isStoreToRefsDeclarator).flatMap(getIdentifierNames);
};

// リアクティブな変数名を取得する関数
const getReactiveVariableNames = (context: RuleContext): string[] => {
  // リアクティブ関数のリスト
  const REACTIVE_FUNCTIONS = ['ref', 'computed', 'reactive', 'toRef', 'shallowRef'];

  // リアクティブ関数からの変数を特定する
  const isReactiveFunction = (decl: TSESTree.VariableDeclarator): boolean =>
    !!decl.init &&
    decl.init.type === AST_NODE_TYPES.CallExpression &&
    decl.init.callee.type === AST_NODE_TYPES.Identifier &&
    REACTIVE_FUNCTIONS.includes(decl.init.callee.name);

  // 変数名を抽出する
  const getVarNames = (node: TSESTree.VariableDeclarator): string[] => {
    if (node.id.type === AST_NODE_TYPES.Identifier) {
      return [node.id.name];
    } else if (node.id.type === AST_NODE_TYPES.ObjectPattern) {
      return node.id.properties
        .filter(
          (
            prop,
          ): prop is TSESTree.Property & {
            value: TSESTree.Identifier;
          } => prop.type === AST_NODE_TYPES.Property && prop.value.type === AST_NODE_TYPES.Identifier,
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

// ライブラリや特別な関数の呼び出しを取得する関数
const getComposableFunctionCalls = (context: RuleContext): string[] => {
  const COMPOSABLES_FUNCTION_PATTERN = /^use[A-Z]/;

  // コンポーザブル関数のリスト（use[A-Z]で始まる関数）
  const isComposableCall = (decl: TSESTree.VariableDeclarator): boolean =>
    !!decl.init &&
    decl.init.type === AST_NODE_TYPES.CallExpression &&
    decl.init.callee.type === AST_NODE_TYPES.Identifier &&
    COMPOSABLES_FUNCTION_PATTERN.test(decl.init.callee.name);

  // コンポーザブル関数からの変数を取得
  const getPropertyNames = (decl: TSESTree.VariableDeclarator): string[] => {
    if (decl.id.type !== AST_NODE_TYPES.ObjectPattern) return [];

    return decl.id.properties
      .filter(
        (
          prop,
        ): prop is TSESTree.Property & {
          key: TSESTree.Identifier;
          value: TSESTree.Identifier;
        } =>
          prop.type === AST_NODE_TYPES.Property &&
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.value.type === AST_NODE_TYPES.Identifier,
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

// ----------------------------------------------------------------------------
// 型チェックと検証関数
// ----------------------------------------------------------------------------

// リアクティブ値に.valueが必要かをチェック
const needsValueSuffix = (
  node: TSESTree.Identifier,
  typeChecker: TypeChecker,
  parserServices: ParserServices,
): boolean => {
  const typeString = getTypeString(node, typeChecker, parserServices);
  const isRefType = typeString.includes('Ref');
  const isValueSuffixMissing = !typeString.includes('.value');
  const isParentNonNullExpression = node.parent && node.parent?.type === AST_NODE_TYPES.TSNonNullExpression;

  return isRefType && isValueSuffixMissing && !isParentNonNullExpression;
};

const createReportData = (node: TSESTree.Identifier) => ({
  node,
  messageId: MESSAGE_ID,
  data: { name: node.name },
});

// 祖先ノードの中からCallExpressionを探す
const findAncestorCallExpression = (node: TSESTree.Node): TSESTree.CallExpression | null => {
  let currentNode: TSESTree.Node | undefined = node.parent;

  while (currentNode) {
    if (currentNode.type === AST_NODE_TYPES.CallExpression) {
      return currentNode;
    }
    currentNode = currentNode.parent;
  }

  return null;
};

// ノードがwatch関数の第一引数かどうかをチェック
const isWatchArgument = (node: TSESTree.Identifier): boolean => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;

  // watch関数の呼び出しか確認
  if (callExpression.callee.type !== AST_NODE_TYPES.Identifier || callExpression.callee.name !== 'watch') {
    return false;
  }

  // 第一引数がidentifierの場合
  if (callExpression.arguments[0] === node) {
    return true;
  }

  // 第一引数が配列の場合（複数の監視対象）
  return (
    callExpression.arguments[0]?.type === AST_NODE_TYPES.ArrayExpression &&
    callExpression.arguments[0].elements.includes(node)
  );
};

// 特定の関数の引数として使用されているかチェック
const isSpecialFunctionArgument = (node: TSESTree.Identifier, specialFunctions: readonly string[]): boolean => {
  const callExpression = findAncestorCallExpression(node);
  if (!callExpression) return false;

  // 特別な関数の呼び出しか確認
  if (
    callExpression.callee.type !== AST_NODE_TYPES.Identifier ||
    !specialFunctions.includes(callExpression.callee.name)
  ) {
    return false;
  }

  // 引数にノードが含まれているか確認
  return callExpression.arguments.includes(node);
};

// ----------------------------------------------------------------------------
// 識別子処理関数
// ----------------------------------------------------------------------------

// 特定の条件でリアクティブ変数の警告を抑制するかどうか判断する
const shouldSuppressWarning = (
  node: TSESTree.Identifier,
  parent: TSESTree.Node,
  reactiveVariables: readonly string[],
  composableFunctions: readonly string[],
  ignoredFunctionNames: readonly string[],
): boolean => {
  // 親ノードに基づく条件
  const isDeclaration = isVariableDeclarator(parent) || isOriginalDeclaration(parent);
  const isObjectPatternProperty =
    parent.type === AST_NODE_TYPES.Property && parent.parent && parent.parent.type === AST_NODE_TYPES.ObjectPattern;
  const isValueAccess = isMemberExpression(parent) && isIdentifier(parent.property) && parent.property.name === 'value';
  const isObjectMember = isMemberExpression(parent) && parent.property !== node;
  const isObjectPropertyKey = isObjectKey(parent, node);
  const isPropertyValueAccess = isPropertyValue(parent);

  // 関数パラメータ関連
  const isWatchArg = isWatchArgument(node);
  const isSpecialFunctionArg = isSpecialFunctionArgument(node, composableFunctions);
  const isIgnoredFunctionArg = isArgumentOfFunction(node, ignoredFunctionNames);

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
    isIgnoredFunctionArg
  );
};

// Identifierノードの処理
const processIdentifier = (
  node: TSESTree.Identifier,
  reactiveVariables: readonly string[],
  composableFunctions: readonly string[],
  context: RuleContext,
  parserServices: ParserServices,
  typeChecker: TypeChecker,
  ignoredFunctionNames: readonly string[],
): void => {
  if (!node.parent) return;
  if (!reactiveVariables.includes(node.name)) return;

  // 警告を抑制する条件を確認
  if (shouldSuppressWarning(node, node.parent, reactiveVariables, composableFunctions, ignoredFunctionNames)) {
    return;
  }

  // ValueSuffixが必要なら警告
  if (needsValueSuffix(node, typeChecker, parserServices)) {
    context.report(createReportData(node));
  }
};

// MemberExpressionノードの処理
const processMemberExpression = (
  node: TSESTree.MemberExpression,
  reactiveVariables: readonly string[],
  context: RuleContext,
  parserServices: ParserServices,
  typeChecker: TypeChecker,
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
  if (isPropertyValue(node)) {
    return;
  }

  // ValueSuffixが必要なら警告
  if (needsValueSuffix(node.object, typeChecker, parserServices)) {
    context.report(createReportData(node.object));
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
    // パーサーサービスとタイプチェッカーの取得
    const parserServices = ESLintUtils.getParserServices(context);
    const typeChecker = parserServices.program.getTypeChecker();

    // オプションの取得
    const options = context.options[0] || {};
    const functionNamesToIgnoreValueCheck = options.functionNamesToIgnoreValueCheck || [];

    // 必要な情報を一度だけ収集し、キャッシュするメモ化関数
    const memoize = <T>(fn: () => T): (() => T) => {
      let cached: T | undefined;
      return () => {
        if (cached === undefined) {
          cached = fn();
        }
        return cached;
      };
    };

    // 各種データを一度だけ収集してキャッシュ
    const getReactiveVariables = memoize(() => getReactiveVariableNames(context));
    const getComposableFunctions = memoize(() => getComposableFunctionCalls(context));

    return {
      // Identifierノードの処理
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

      // MemberExpressionノードの処理
      MemberExpression(node) {
        processMemberExpression(node, getReactiveVariables(), context, parserServices, typeChecker);
      },
    };
  },
});
