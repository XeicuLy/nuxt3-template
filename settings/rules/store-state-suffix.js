import { readFileSync } from 'fs';
import { resolve } from 'path';

const stateList = JSON.parse(
  readFileSync(resolve(new URL('.', import.meta.url).pathname, './data/store-state-list.json'), 'utf8'),
);

/**
 * @fileoverview stateの値を使用する時に "State" という接尾辞をつけることを強制するESLintルール
 */

export const storeStateSuffix = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'stateの値を使用する時は "State" という接尾辞をつける',
      category: 'Best Practices',
      recommended: false,
    },
    fixable: 'code',
    messages: {
      requireStateSuffix:
        'stateの "{{name}}" には "State" 接尾辞が必要です。"{{name}}: {{name}}State" に変更してください。',
    },
    schema: [],
  },
  create(context) {
    /**
     * プロパティがstateListに含まれるか確認し、必要に応じてエラーを報告する
     * @param {ASTNode} property - チェックするプロパティノード
     */
    function checkProperty(property) {
      const originalName = property.key.name;
      const aliasName = property.value.name;
      const nameToCheck = aliasName || originalName;
      if (stateList.includes(originalName) && !nameToCheck.endsWith('State')) {
        context.report({
          node: property,
          messageId: 'requireStateSuffix',
          data: {
            name: nameToCheck,
          },
          fix: (fixer) => {
            const newName = `${nameToCheck}State`;
            const newPropertySource = aliasName ? `${originalName}: ${newName}` : newName;
            return fixer.replaceText(property, newPropertySource);
          },
        });
      }
    }

    /**
     * VariableDeclaratorノードをチェックし、storeToRefs関数の呼び出しから生成された変数に "State" 接尾辞を付ける。
     * @param {ASTNode} node - チェックするASTノード
     */
    function checkVariableDeclarator(node) {
      if (
        node.id.type === 'ObjectPattern' &&
        node.init &&
        node.init.type === 'CallExpression' &&
        node.init.callee.name === 'storeToRefs'
      ) {
        node.id.properties.forEach(checkProperty);
      }
    }

    return {
      VariableDeclarator: checkVariableDeclarator,
    };
  },
};
