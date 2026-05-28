export type PatternTokenStream = string | PatternToken | PatternTokenStream[]

export type PatternToken = {
  type: string
  content: PatternTokenStream
  aliases?: readonly string[]
}

export type PatternGrammar = {
  [token: string]: PatternGrammarValue | PatternGrammar | undefined
  rest?: PatternGrammar
}

export type PatternGrammarEntry = RegExp | PatternDefinition

export type PatternGrammarValue = PatternGrammarEntry | PatternGrammarEntry[]

export type PatternDefinition = {
  pattern: RegExp
  lookbehind?: boolean
  greedy?: boolean
  alias?: string | readonly string[]
  inside?: PatternGrammar | null
}

type Segment = string | PatternToken

export function tokenizePatternText(source: string, grammar: PatternGrammar): PatternTokenStream[] {
  return tokenizeSegments(source, grammar)
}

export function extendGrammar(base: PatternGrammar, additions: PatternGrammar): PatternGrammar {
  return {...base, ...additions}
}

export function insertBefore(grammar: PatternGrammar, before: string, insert: PatternGrammar): PatternGrammar {
  const next: PatternGrammar = {}
  let inserted = false
  for (const [key, value] of Object.entries(grammar)) {
    if (key === "rest") continue
    if (key === before) {
      Object.assign(next, insert)
      inserted = true
    }
    next[key] = value
  }
  if (!inserted) Object.assign(next, insert)
  if (grammar.rest !== undefined) next.rest = grammar.rest

  for (const key of Object.keys(grammar)) delete grammar[key]
  Object.assign(grammar, next)
  return grammar
}

function tokenizeSegments(source: string, grammar: PatternGrammar): Segment[] {
  let segments: Segment[] = [source]
  for (const [type, value] of grammarEntries(grammar)) {
    const definitions = Array.isArray(value) ? value : [value]
    for (const definition of definitions) {
      segments = applyPattern(segments, type, normalizeDefinition(definition))
    }
  }
  return segments
}

function grammarEntries(grammar: PatternGrammar): Array<[string, PatternGrammarValue]> {
  const entries: Array<[string, PatternGrammarValue]> = []
  for (const [key, value] of Object.entries(grammar)) {
    if (key === "rest" || value === undefined) continue
    entries.push([key, value as PatternGrammarValue])
  }
  if (grammar.rest !== undefined) entries.push(...grammarEntries(grammar.rest))
  return entries
}

function normalizeDefinition(value: RegExp | PatternDefinition): PatternDefinition {
  return value instanceof RegExp ? {pattern: value} : value
}

function applyPattern(segments: readonly Segment[], type: string, definition: PatternDefinition): Segment[] {
  const out: Segment[] = []
  for (const segment of segments) {
    if (typeof segment !== "string") {
      out.push(segment)
      continue
    }
    out.push(...matchSegment(segment, type, definition))
  }
  return out
}

function matchSegment(source: string, type: string, definition: PatternDefinition): Segment[] {
  const re = toGlobalRegExp(definition.pattern)
  const out: Segment[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(source)) !== null) {
    if (match[0].length === 0) {
      re.lastIndex++
      continue
    }

    let start = match.index
    let text = match[0]
    if (definition.lookbehind === true && match[1] !== undefined) {
      start += match[1].length
      text = text.slice(match[1].length)
    }

    const end = start + text.length
    if (end <= cursor) continue
    if (start > cursor) out.push(source.slice(cursor, start))
    const token: PatternToken = {
      type,
      content: definition.inside == null ? text : tokenizeSegments(text, definition.inside),
    }
    const aliases = normalizeAliases(definition.alias)
    if (aliases !== undefined) token.aliases = aliases
    out.push(token)
    cursor = end
  }

  if (cursor < source.length) out.push(source.slice(cursor))
  return out
}

function toGlobalRegExp(re: RegExp): RegExp {
  const flags = Array.from(new Set(`${re.flags.replace(/y/g, "")}g`.split(""))).join("")
  return new RegExp(re.source, flags)
}

function normalizeAliases(alias: string | readonly string[] | undefined): readonly string[] | undefined {
  if (alias === undefined) return undefined
  if (typeof alias === "string") return [alias]
  return alias
}
