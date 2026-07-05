import type { ValueArray } from "./array.ts"
import type { ValueBoolean } from "./boolean.ts"
import type { ValueEvent } from "./event.ts"
import type { ValueString } from "./string.ts"
import type { ValueStyle } from "./style.ts"

export type ValueType = "dynamic" | "static" | "mixed"

export interface SplitterFn {
  (raw: string): string[]
}

export interface SplitterResolved {
  fn: SplitterFn
  delim: string
}

export interface Attributes {
  /** События (onclick, onchange, onsubmit и т.д.) */
  event?: Record<string, ValueEvent>
  /** Булевые атрибуты (hidden, disabled, checked, readonly и т.д.) */
  boolean?: Record<string, ValueBoolean>
  /** Массивы атрибутов (class, rel, ping и т.д.) */
  array?: Record<string, ValueArray[]>
  /** Строковые атрибуты (id, title, alt, href и т.д.) */
  string?: Record<string, ValueString>
  /** Стили (CSS в виде строки или объекта) */
  style?: Record<string, ValueStyle>
}
