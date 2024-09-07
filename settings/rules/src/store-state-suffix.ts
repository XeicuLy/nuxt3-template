import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { TSESLint } from '@typescript-eslint/utils';
import { isStoreToRefsCall, hasStateNameWithoutStateSuffix } from './helpers/astHelpers.js';
import type { VariableDeclarator, Property, RestElement, Node } from './types/eslint.js';

type MessageId = 'requireStateSuffix';
type RuleModule = TSESLint.RuleModule<MessageId>;

const stateListPath = resolve(new URL(import.meta.url).pathname, '../../../data/json/store-state-list.json');
const stateList: string[] = JSON.parse(readFileSync(stateListPath, 'utf8'));

/**
 * @fileoverview stateの値を使用する時に "State" という接尾辞をつけることを強制するESLintルール
 * @type {RuleModule}
 */
export const storeStateSuffix: RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'stateの値を使用する時は "State" という接尾辞をつける',
      recommended: 'recommended',
    },
    fixable: 'code',
    messages: {
      requireStateSuffix: 'stateの "{{name}}" には "State" というSuffix(接尾辞)が必要です。',
    },
    schema: [],
  },
  create(context) {
    /**
     * プロパティがstateListに含まれるかを確認
     * @param {string} originalName - 元のプロパティ名
     * @param {string} nameToCheck - チェックするプロパティ名
     * @returns {boolean} - 接尾辞が必要かどうか
     */
    function needsStateSuffix(originalName: string, nameToCheck: string): boolean {
      return hasStateNameWithoutStateSuffix(originalName, nameToCheck, stateList);
    }

    /**
     * エラーレポートを生成
     * @param {Property} property - エラーが発生したプロパティノード
     * @param {string} name - プロパティ名
     */
    function reportStateSuffixError(property: Property, name: string) {
      context.report({
        node: property,
        messageId: 'requireStateSuffix',
        data: {
          name,
        },
      });
    }

    /**
     * プロパティがstateListに含まれるか確認し、"State" というsuffixがない場合はエラーを報告
     * @param {Property} property - チェックするプロパティノード
     */
    function checkPropertyWithStateSuffix(property: Property) {
      const originalName = getPropertyName(property.key);
      const aliasName = getPropertyName(property.value);
      const nameToCheck = aliasName || originalName;

      if (needsStateSuffix(originalName, nameToCheck)) {
        reportStateSuffixError(property, nameToCheck);
      }
    }

    /**
     * プロパティ名を取得するためのヘルパー関数
     * @param {Node} node - ASTノード
     * @returns {string} - プロパティ名（Identifierの場合）
     */
    function getPropertyName(node: Node): string {
      if (node.type === 'Identifier') {
        return node.name;
      } else if (node.type === 'AssignmentPattern' && node.left.type === 'Identifier') {
        return node.left.name;
      }
      return '';
    }

    /**
     * プロパティが Property 型かどうかを判定する型ガード関数
     * @param {Property | RestElement} prop - チェックするプロパティ
     * @returns {prop is Property} - Property 型であれば true を返す
     */
    function isPropertyNode(prop: Property | RestElement): prop is Property {
      return prop?.type === 'Property';
    }

    /**
     * VariableDeclaratorノードをチェックし、storeToRefs関数の呼び出しから生成された変数に "State" 接尾辞を付ける。
     * @param {VariableDeclarator} node - チェックするASTノード
     */
    function checkVariableDeclaratorForStateSuffix(node: VariableDeclarator) {
      if (isStoreToRefsCall(node) && node.id.type === 'ObjectPattern') {
        node.id.properties.forEach((prop) => {
          if (isPropertyNode(prop)) {
            checkPropertyWithStateSuffix(prop);
          }
        });
      }
    }

    return {
      VariableDeclarator: checkVariableDeclaratorForStateSuffix,
    };
  },
  defaultOptions: [],
};