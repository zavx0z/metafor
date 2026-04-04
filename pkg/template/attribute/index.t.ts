import type { SplitterFn } from "./index.ts"
import type { ValueArray } from "./array.t.ts"
import type { ValueBoolean } from "./boolean.t.ts"
import type { ValueEvent } from "./event.t.ts"
import type { ValueString } from "./string.t.ts"
import type { ValueStyle } from "./style.t.ts"

export type ValueType = "dynamic" | "static" | "mixed"

export type SplitterResolved = { fn: SplitterFn; delim: string }

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
