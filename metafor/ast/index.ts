/**
 * @packageDocumentation
 * Экспорт API @metafor/ast
 */

export { convertMetaDSLToMetaAST, extractArrayElementTypesFromSource } from "./ast.ts"
export { validateMatterAST } from "../dsl/matter.ts"
export type {
  MetaDSLLike,
  ArrayElementType,
  MetaJson,
  ViewJson,
  MetaAST,
  FieldsAST,
  FieldDefinitionJson,
  ReactionDefinitionJson,
  FieldKey,
} from "./ast.t.ts"
