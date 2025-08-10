/**
 * Типы для рендера представлений
 * @packageDocumentation
 * @module ViewRender
 */

import type { ExtractValues, Update } from "../../context"
import type { ContextSchema } from "../../context/types.t.ts"
import type { Core } from "../../index.t.ts"
import type { Schema, AttributeValue, ConditionSchema } from "../parser/index.t.ts"

/**
 * Параметры функции рендеринга
 */
export interface RenderParams<C extends ContextSchema, S extends string, I extends Core> {
  state: S
  context: ExtractValues<C>
  core: I
  element: HTMLElement | DocumentFragment
  update: Update<C>
  schema: Schema
}

/**
 * Функция рендеринга
 */
export type RenderFunction<C extends ContextSchema, S extends string, I extends Core> = (
  params: RenderParams<C, S, I>
) => void

/**
 * Результат оценки условия
 */
export type ConditionResult = boolean

/**
 * Результат оценки атрибута
 */
export type AttributeResult = string | boolean | undefined

/**
 * Контекст для рендеринга элементов массива
 */
export interface ArrayRenderContext {
  item: any
  index: number
  array: any[]
}

/**
 * Функция для оценки условий
 */
export type ConditionEvaluator = (
  condition: ConditionSchema,
  context: any,
  core: any,
  arrayContext?: ArrayRenderContext
) => ConditionResult

/**
 * Функция для оценки атрибутов
 */
export type AttributeEvaluator = (
  attribute: AttributeValue,
  context: any,
  core: any,
  arrayContext?: ArrayRenderContext
) => AttributeResult
