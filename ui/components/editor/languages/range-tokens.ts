import type {EditorToken, EditorTokens} from "../tokens.ts"

export type SyntaxCategory = "k" | "s" | "n" | "c" | "t" | "f" | "p" | "d"
export type RangeToken = {s: number; e: number; c: SyntaxCategory; bg?: string}
export type RangePush = (s: number, e: number, c: SyntaxCategory, bg?: string) => void

export function pushRange(tokens: RangeToken[], s: number, e: number, c: SyntaxCategory, bg?: string): void {
  if (e <= s) return
  tokens.push(bg === undefined ? {s, e, c} : {s, e, c, bg})
}

export function distributeRangeTokens(tokens: readonly RangeToken[], lines: readonly string[]): EditorTokens {
  const result: EditorTokens = lines.map(() => [] as EditorToken[])
  const offsets = new Array<number>(lines.length + 1)
  offsets[0] = 0
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    offsets[lineIndex + 1] = offsets[lineIndex]! + (lines[lineIndex]?.length ?? 0) + 1
  }

  for (const token of tokens) {
    let lineIndex = upperBound(offsets, token.s) - 1
    if (lineIndex < 0) lineIndex = 0
    let cursor = token.s
    while (cursor < token.e && lineIndex < lines.length) {
      const lineStart = offsets[lineIndex]!
      const lineLen = lines[lineIndex]?.length ?? 0
      const lineEnd = lineStart + lineLen
      const spanEnd = Math.min(token.e, lineEnd)
      const sCol = cursor - lineStart
      const eCol = spanEnd - lineStart
      if (eCol > sCol) {
        const editorToken: EditorToken = token.bg === undefined
          ? {s: sCol, e: eCol, c: token.c}
          : {s: sCol, e: eCol, c: token.c, bg: token.bg}
        result[lineIndex]!.push(editorToken)
      }
      cursor = spanEnd + 1
      lineIndex++
    }
  }
  return result
}

function upperBound(arr: readonly number[], value: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if ((arr[mid] ?? 0) <= value) lo = mid + 1
    else hi = mid
  }
  return lo
}
