import type {EditorTokens, LanguageHighlighter} from "../tokens.ts"
import {tokenizeCssRanges} from "./css.ts"
import {pushRange, distributeRangeTokens, type RangePush, type RangeToken} from "./range-tokens.ts"
import {tokenizeTypeScript} from "./typescript.ts"

export function tokenizeHtml(lines: string[]): EditorTokens {
  const source = lines.join("\n")
  const N = source.length
  const tokens: RangeToken[] = []
  const push: RangePush = (s, e, c, bg) => pushRange(tokens, s, e, c, bg)

  let i = 0
  while (i < N) {
    const ch = source[i]!

    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4)
      const stop = end === -1 ? N : end + 3
      push(i, stop, "c")
      i = stop
      continue
    }

    if ((source.startsWith("<!", i) || source.startsWith("<?", i)) && !source.startsWith("<!--", i)) {
      const stop = source.indexOf(">", i)
      const end = stop === -1 ? N : stop + 1
      push(i, end, "k")
      i = end
      continue
    }

    if (ch === "<" && source[i + 1] === "/") {
      i = scanTag(source, i, push)
      continue
    }

    if (ch === "<" && isNameStart(source[i + 1])) {
      const tagStart = i
      const result = scanOpenTag(source, i, push)
      i = result.end
      const name = result.name.toLowerCase()
      if (name === "style" && !result.selfClose) {
        i = scanRawBlock(source, i, "style", push, tokenizeCssRanges)
      } else if (name === "script" && !result.selfClose) {
        i = scanRawBlock(source, i, "script", push, tokenizeScriptRanges)
      }
      if (i <= tagStart) i = tagStart + 1
      continue
    }

    if (source.startsWith("{{", i)) {
      const end = source.indexOf("}}", i + 2)
      const stop = end === -1 ? N : end + 2
      push(i, stop, "f")
      i = stop
      continue
    }

    i++
  }

  return distributeRangeTokens(tokens, lines)
}

export const htmlHighlighter: LanguageHighlighter = {
  id: "html",
  name: "HTML / CSS / JS",
  extensions: ["html", "htm"],
  aliases: ["markup", "proposal"],
  tokenize: tokenizeHtml,
}

function isNameStart(c: string | undefined): boolean {
  if (c === undefined) return false
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")
}

function isNameChar(c: string | undefined): boolean {
  if (c === undefined) return false
  return isNameStart(c) || (c >= "0" && c <= "9") || c === "-" || c === "_" || c === ":"
}

function scanTag(source: string, i: number, push: RangePush): number {
  const N = source.length
  push(i, i + 1, "p")
  i++
  if (source[i] === "/") {
    push(i, i + 1, "p")
    i++
  }
  const nameStart = i
  while (i < N && isNameChar(source[i])) i++
  if (i > nameStart) push(nameStart, i, "k")
  while (i < N && source[i] !== ">") i++
  if (i < N) {
    push(i, i + 1, "p")
    i++
  }
  return i
}

function scanOpenTag(source: string, i: number, push: RangePush): {end: number; name: string; selfClose: boolean} {
  const N = source.length
  push(i, i + 1, "p")
  i++
  const nameStart = i
  while (i < N && isNameChar(source[i])) i++
  const name = source.slice(nameStart, i)
  if (i > nameStart) push(nameStart, i, "k")

  while (i < N) {
    while (i < N && /\s/.test(source[i] ?? "")) i++
    if (source[i] === "/" && source[i + 1] === ">") {
      push(i, i + 2, "p")
      return {end: i + 2, name, selfClose: true}
    }
    if (source[i] === ">") {
      push(i, i + 1, "p")
      return {end: i + 1, name, selfClose: false}
    }
    if (i >= N) break

    const attrStart = i
    while (i < N && isNameChar(source[i])) i++
    if (i > attrStart) push(attrStart, i, "t")
    else {
      i++
      continue
    }

    while (i < N && /\s/.test(source[i] ?? "")) i++
    if (source[i] === "=") {
      push(i, i + 1, "p")
      i++
      while (i < N && /\s/.test(source[i] ?? "")) i++
      const quote = source[i]
      if (quote === "\"" || quote === "'") {
        const valueStart = i
        i++
        while (i < N && source[i] !== quote) i++
        if (i < N) i++
        push(valueStart, i, "s")
      } else {
        const valueStart = i
        while (i < N && !/[\s>/]/.test(source[i] ?? "")) i++
        if (i > valueStart) push(valueStart, i, "s")
      }
    }
  }
  return {end: N, name, selfClose: false}
}

function scanRawBlock(
  source: string,
  i: number,
  tag: "script" | "style",
  push: RangePush,
  sub: (content: string, base: number, push: RangePush) => void,
): number {
  const lower = source.toLowerCase()
  const end = lower.indexOf(`</${tag}`, i)
  const stop = end === -1 ? source.length : end
  if (stop > i) sub(source.slice(i, stop), i, push)
  if (end === -1) return source.length
  return scanTag(source, end, push)
}

function tokenizeScriptRanges(content: string, base: number, push: RangePush): void {
  const lines = content.split("\n")
  const tokens = tokenizeTypeScript(lines)
  let lineBase = base
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    for (const token of tokens[lineIndex] ?? []) {
      push(lineBase + token.s, lineBase + token.e, token.c as "k" | "s" | "n" | "c" | "t" | "f" | "p" | "d", token.bg)
    }
    lineBase += (lines[lineIndex]?.length ?? 0) + 1
  }
}
