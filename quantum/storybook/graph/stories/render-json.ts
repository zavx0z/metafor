import type {UiSurfaceRect} from "@layout/core/runtime"
import type {UiSurface} from "@layout/core/surface"
import {CodeEditor} from "@ui/components/code-editor"
import {Typography} from "@ui/components/typography"

/** Рисует один JSON-result внутри consumer-owned preview Surface. */
export function renderGraphJson(
  surface: UiSurface,
  frame: UiSurfaceRect,
  key: string,
  title: string,
  value: unknown,
): void {
  const inset = 18
  Typography(surface, frame.x + inset, frame.y + 52, Math.max(1, frame.w - inset * 2), 28, {
    children: title,
    variant: "subtitle",
  })
  CodeEditor(
    surface,
    frame.x + inset,
    frame.y + 86,
    Math.max(1, frame.w - inset * 2),
    Math.max(1, frame.h - 104),
    {
      key,
      value: JSON.stringify(value, null, 2),
      readOnly: true,
      languageId: "json",
      showLineNumbers: true,
    },
  )
}
