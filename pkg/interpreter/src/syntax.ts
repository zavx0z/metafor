import {tokenizeSourcePattern} from "@ui/panes/syntax"

export type TokenCategory =
  | "k"  // keyword
  | "s"  // string literal / template
  | "n"  // number / bigint / regex
  | "c"  // comment
  | "t"  // type-like identifier
  | "f"  // function-call identifier
  | "p"  // punctuation / operator
  | "d"  // default identifier

export type Token = {
  s: number
  e: number
  c: TokenCategory
  fg?: string
  bg?: string
}

export type SourceTokens = Token[][]

type SharedToken = {
  s: number
  e: number
  c: string
  fg?: string
  bg?: string
}

export function tokenizeSource(source: string, opts: {path?: string} = {}): SourceTokens {
  return normalizeTokens(tokenizeSourcePattern(source.split("\n"), opts))
}

export function tokenize(source: string): SourceTokens {
  return tokenizeSource(source)
}

function normalizeTokens(tokens: readonly (readonly SharedToken[])[]): SourceTokens {
  return tokens.map((line) => line.map((token) => {
    const out: Token = {s: token.s, e: token.e, c: normalizeCategory(token.c)}
    if (token.fg !== undefined) out.fg = token.fg
    if (token.bg !== undefined) out.bg = token.bg
    return out
  }))
}

function normalizeCategory(category: string): TokenCategory {
  if (
    category === "k" ||
    category === "s" ||
    category === "n" ||
    category === "c" ||
    category === "t" ||
    category === "f" ||
    category === "p" ||
    category === "d"
  ) return category
  return "d"
}
