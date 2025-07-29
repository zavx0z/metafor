/**
 * Основные типы MetaFor
 * @packageDocumentation
 * @module Core
 */

import type { ContextSchema, ExtractValues, SerializedSchema } from "./context"

import type { StatesConfig } from "./state/index.t.ts"

/**
 * @template C - схема контекста автомата
 * @template S - строковые ключи состояний
 */
export interface Snapshot<C extends ContextSchema, S extends string> {
  state: S
  states: StatesConfig<S, C>
  context: ExtractValues<C>
  schema: SerializedSchema<C>
}

import { MetaFor as FrameWork } from "./metafor"

declare global {
  interface Window {
    MetaFor: typeof FrameWork
    debugMetaFor: boolean
  }
  var debugMetaFor: boolean
  var htmlIssuedWarnings: Set<string>
  var MetaFor: typeof FrameWork
  var htmlPolyfillSupport: ((Template: any, ChildPart: any) => void) | undefined
  var htmlPolyfillSupportDevMode: ((Template: any, ChildPart: any) => void) | undefined
  var htmlVersions: string[]
  var emitHtmlDebugLogEvents: boolean
}
export {}
