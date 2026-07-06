import {firstNumberParam, numberParam, objectParamMaybe} from "./command-params.ts"

export type SourceOpenOptions = {
  line?: number
  column?: number
  selection?: SourceOpenSelection
  revealInWorkspace?: boolean
}

export type SourceOpenPosition = {
  /** 1-based line for external API callers. */
  line: number
  /** 0-based column, matching editor/context API columns. */
  column: number
}

export type SourceOpenSelection = {
  anchor: SourceOpenPosition
  focus: SourceOpenPosition
}

export function parseSourceOpenSelection(params: Record<string, unknown>): SourceOpenSelection | undefined {
  const nested = objectParamMaybe(params["selection"]) ?? objectParamMaybe(params["range"])
  if (nested !== undefined) return parseSourceOpenSelectionObject(nested, "source.open selection")

  const anchor = parseSourceOpenPositionFields(params, ["anchorLine", "startLine", "selectionStartLine"], ["anchorColumn", "anchorCol", "startColumn", "startCol", "selectionStartColumn", "selectionStartCol"])
  const focus = parseSourceOpenPositionFields(params, ["focusLine", "endLine", "selectionEndLine"], ["focusColumn", "focusCol", "endColumn", "endCol", "selectionEndColumn", "selectionEndCol"])
  if (anchor === undefined && focus === undefined) return undefined
  if (anchor === undefined || focus === undefined) throw new Error("source.open selection requires both start/end or anchor/focus positions")
  return {anchor, focus}
}

function parseSourceOpenSelectionObject(params: Record<string, unknown>, label: string): SourceOpenSelection {
  const anchor = parseSourceOpenPosition(params["anchor"])
    ?? parseSourceOpenPosition(params["start"])
    ?? parseSourceOpenPositionFields(params, ["anchorLine", "startLine"], ["anchorColumn", "anchorCol", "startColumn", "startCol"])
  const focus = parseSourceOpenPosition(params["focus"])
    ?? parseSourceOpenPosition(params["end"])
    ?? parseSourceOpenPositionFields(params, ["focusLine", "endLine"], ["focusColumn", "focusCol", "endColumn", "endCol"])
  if (anchor === undefined || focus === undefined) throw new Error(`${label} requires both start/end or anchor/focus positions`)
  return {anchor, focus}
}

function parseSourceOpenPosition(value: unknown): SourceOpenPosition | undefined {
  const object = objectParamMaybe(value)
  if (object === undefined) return undefined
  const line = numberParam(object["line"])
  if (line === undefined) return undefined
  const column = numberParam(object["column"]) ?? numberParam(object["col"]) ?? 0
  return {line, column}
}

function parseSourceOpenPositionFields(params: Record<string, unknown>, lineKeys: readonly string[], columnKeys: readonly string[]): SourceOpenPosition | undefined {
  const line = firstNumberParam(params, lineKeys)
  if (line === undefined) return undefined
  const column = firstNumberParam(params, columnKeys) ?? 0
  return {line, column}
}
