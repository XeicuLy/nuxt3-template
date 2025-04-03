import type { PROPERTY_TYPE } from '../data/utils/constant';
import type { Node, ObjectLiteralExpression } from 'typescript';

/**
 * 変数名から変数宣言ノードを判定する純粋関数（型ガード）
 * オブジェクトリテラルで初期化された変数宣言を表す型
 */
export type VariableDeclarationWithObjectInitializer = Node & {
  name: { text: string };
  initializer: ObjectLiteralExpression;
};

export type PropertyType = 'STATE' | 'GETTERS';

export interface UpdateOptions {
  propertyType: (typeof PROPERTY_TYPE)[PropertyType]['NAME'];
  outputPath: (typeof PROPERTY_TYPE)[PropertyType]['OUTPUT_FILE_PATH'];
}

export type ExtractorWithSourceFile<T> = (sourceFile: SourceFile, propertyNode: ObjectLiteralElementLike) => T[];
export type ExtractorWithoutSourceFile<T> = (propertyNode: ObjectLiteralElementLike) => T[];
export type PropertyExtractor<T> = ExtractorWithSourceFile<T> | ExtractorWithoutSourceFile<T>;
