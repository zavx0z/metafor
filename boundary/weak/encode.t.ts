/**
 * Типы кодирования значений для слабого слоя.
 *
 * @packageDocumentation
 */

export interface EncodingContext {
  type: number
  subType?: number
  enum?: any[]
  allocateHeap?: (size: number) => number
  heap?: Uint32Array
  stringInterner?: { intern(value: string): number }
}

export interface EncodedValue {
  value: number
  type: number
}

export interface EncodedValueResult {
  value1: number
  value2: number
}
