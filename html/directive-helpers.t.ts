import { _$LH } from "./html"
import type { MaybeCompiledTemplateResult, UncompiledTemplateResult } from "./html.t"

export type Primitive = null | undefined | boolean | number | string | symbol | bigint

export const TemplateResultType = {
  HTML: 1,
  SVG: 2,
  MATHML: 3,
} as const

export type TemplateResultType = (typeof TemplateResultType)[keyof typeof TemplateResultType]

type IsTemplateResult = {
  (val: unknown): val is MaybeCompiledTemplateResult
  <T extends TemplateResultType>(val: unknown, type: T): val is UncompiledTemplateResult<T>
}

export type { IsTemplateResult }
export const { _ChildPart: ChildPart } = _$LH
export type ChildPart = InstanceType<typeof ChildPart>
