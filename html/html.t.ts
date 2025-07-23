/**
 * Типы для html.ts
 * @packageDocumentation
 */

import type { Template } from "./html"

// ==================== БАЗОВЫЕ ТИПЫ ====================

export type Primitive = null | undefined | boolean | number | string | symbol | bigint

export type ResultType = typeof HTML_RESULT | typeof SVG_RESULT | typeof MATHML_RESULT

// ==================== КОНСТАНТЫ ====================

export const HTML_RESULT = 1
export const SVG_RESULT = 2
export const MATHML_RESULT = 3

// Типы частей шаблона
export const ATTRIBUTE_PART = 1
export const CHILD_PART = 2
export const PROPERTY_PART = 3
export const BOOLEAN_ATTRIBUTE_PART = 4
export const EVENT_PART = 5
export const ELEMENT_PART = 6
export const COMMENT_PART = 7

// ==================== ТИПЫ РЕЗУЛЬТАТА ШАБЛОНА ====================

export type UncompiledTemplateResult<T extends ResultType = ResultType> = {
  ['_$htmlType$']: T
  strings: TemplateStringsArray
  values: unknown[]
}

export type MaybeCompiledTemplateResult<T extends ResultType = ResultType> =
  | UncompiledTemplateResult<T>
  | CompiledTemplateResult

export type TemplateResult<T extends ResultType = ResultType> =
  UncompiledTemplateResult<T>

export type HTMLTemplateResult = TemplateResult<typeof HTML_RESULT>

export type SVGTemplateResult = TemplateResult<typeof SVG_RESULT>

export type MathMLTemplateResult = TemplateResult<typeof MATHML_RESULT>

export interface CompiledTemplateResult {
  ['_$htmlType$']: CompiledTemplate
  values: unknown[]
}

export interface CompiledTemplate extends Omit<Template, 'el'> {
  el?: HTMLTemplateElement
  h: TemplateStringsArray
}

// ==================== ТИПЫ ЧАСТЕЙ ШАБЛОНА ====================

export type AttributeTemplatePart = {
  readonly type: typeof ATTRIBUTE_PART
  readonly index: number
  readonly name: string
  readonly ctor: any
  readonly strings: ReadonlyArray<string>
}

export type ChildTemplatePart = {
  readonly type: typeof CHILD_PART
  readonly index: number
}

export type ElementTemplatePart = {
  readonly type: typeof ELEMENT_PART
  readonly index: number
}

export type CommentTemplatePart = {
  readonly type: typeof COMMENT_PART
  readonly index: number
}

export type TemplatePart =
  | ChildTemplatePart
  | AttributeTemplatePart
  | ElementTemplatePart
  | CommentTemplatePart

export type Part = any

// ==================== ИНТЕРФЕЙС DISCONNECTABLE ====================

export interface Disconnectable {
  _$parent?: Disconnectable | undefined
  _$disconnectableChildren?: Set<Disconnectable>
  _$isConnected: boolean
}

// ==================== ИНТЕРФЕЙС DIRECTIVE PARENT ====================

export interface DirectiveParent {
  _$parent?: DirectiveParent | undefined
  _$isConnected: boolean
  __directive?: any
  __directives?: Array<any | undefined>
}

// ==================== DEBUG LOG ТИПЫ ====================

export namespace LitUnstable {
  export namespace DebugLog {
    export type Entry = any
  }
}

// ==================== ИНТЕРФЕЙС ОКНА ДЛЯ DEBUG LOG ====================

export interface DebugLoggingWindow {
  emitLitDebugLogEvents?: boolean
}

// ==================== ТИПЫ SANITIZER ====================

export type SanitizerFactory = (
  node: Node,
  name: string,
  type: 'property' | 'attribute'
) => ValueSanitizer

export type ValueSanitizer = (value: unknown) => unknown

// ==================== ИНТЕРФЕЙС ОПЦИЙ РЕНДЕРА ====================

export interface RenderOptions {
  host?: object
  renderBefore?: ChildNode | null
  creationScope?: {importNode(node: Node, deep?: boolean): Node}
  isConnected?: boolean
}

// ==================== ТИПЫ ОБРАБОТЧИКОВ СОБЫТИЙ ====================

export type EventListenerWithOptions = EventListenerOrEventListenerObject &
  Partial<AddEventListenerOptions>

// ==================== ИНТЕРФЕЙС ROOT PART ====================

export interface RootPart {
  setConnected(isConnected: boolean): void
}

// ==================== ТИПЫ TRUSTED TYPES ====================

export interface TrustedHTML {
  toString(): string
}

export interface TrustedTypesWindow {
  trustedTypes?: {
    createPolicy(name: string, rules: { createHTML: (s: string) => string }): {
      createHTML: (s: string) => TrustedHTML
    }
    emptyScript: TrustedHTML
  }
}

// ==================== ГЛОБАЛЬНЫЕ РАСШИРЕНИЯ ====================

declare global {
  var litIssuedWarnings: Set<string>
  var ShadyDOM: {
    inUse?: boolean
    noPatch?: boolean
    wrap?: <T extends Node>(node: T) => T
  }
  var litHtmlPolyfillSupport: ((Template: any, ChildPart: any) => void) | undefined
  var litHtmlPolyfillSupportDevMode: ((Template: any, ChildPart: any) => void) | undefined
  var litHtmlVersions: string[]
  var emitLitDebugLogEvents: boolean
}
