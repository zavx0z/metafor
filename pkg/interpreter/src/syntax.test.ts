import {describe, expect, test} from "bun:test"
import {tokenize, tokenizeSource, type Token} from "./syntax.ts"

describe("syntax tokenizer", () => {
  test("highlights test helper imports and calls", () => {
    const lines = [
      "import {describe, expect, test} from \"bun:test\"",
      "describe(\"x\", () => expect(value).toBe(1))",
    ]
    const tokens = tokenize(lines.join("\n"))

    expect(tokenFor(lines[0]!, tokens[0]!, "import")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "describe")?.c).toBe("f")
    expect(tokenFor(lines[0]!, tokens[0]!, "expect")?.c).toBe("f")
    expect(tokenFor(lines[0]!, tokens[0]!, "test")?.c).toBe("f")
    expect(tokenFor(lines[0]!, tokens[0]!, "\"bun:test\"")?.c).toBe("s")
    expect(tokenFor(lines[1]!, tokens[1]!, "describe")?.c).toBe("f")
    expect(tokenFor(lines[1]!, tokens[1]!, "expect")?.c).toBe("f")
    expect(tokenFor(lines[1]!, tokens[1]!, "toBe")?.c).toBe("f")
    expect(tokenFor(lines[1]!, tokens[1]!, "1")?.c).toBe("n")
  })

  test("highlights sqlite inside sql tagged TypeScript templates", () => {
    const line = "await sql<Array<{src: string}>>`SELECT src FROM wimp WHERE src = 'zavx0z/git-history-commit'`"
    const tokens = tokenize(line)

    expect(tokenFor(line, tokens[0]!, "await")?.c).toBe("k")
    expect(tokenFor(line, tokens[0]!, "sql")?.c).toBe("f")
    expect(tokenFor(line, tokens[0]!, "Array")?.c).toBe("t")
    expect(tokenFor(line, tokens[0]!, "SELECT")?.c).toBe("k")
    expect(tokenFor(line, tokens[0]!, "FROM")?.c).toBe("k")
    expect(tokenFor(line, tokens[0]!, "WHERE")?.c).toBe("k")
    expect(tokenFor(line, tokens[0]!, "'zavx0z/git-history-commit'")?.c).toBe("s")
  })

  test("uses sqlite tokenizer for .sql paths", () => {
    const line = "SELECT src FROM wimp WHERE src = 'x'"
    const tokens = tokenizeSource(line, {path: "boundary/wimp.sql"})

    expect(tokenFor(line, tokens[0]!, "SELECT")?.c).toBe("k")
    expect(tokenFor(line, tokens[0]!, "FROM")?.c).toBe("k")
    expect(tokenFor(line, tokens[0]!, "'x'")?.c).toBe("s")
  })

  test("uses json tokenizer for package.json paths", () => {
    const line = '    "zavx0z:clean": "for dir in zavx0z/*/; do rm -f \\"$dir\\"/git*.json; done"'
    const tokens = tokenizeSource(line, {path: "package.json"})
    const separator = line.indexOf(": ", line.indexOf('"zavx0z:clean"') + '"zavx0z:clean"'.length)

    expect(tokenFor(line, tokens[0]!, '"zavx0z:clean"')?.c).toBe("t")
    expect(tokenFor(line, tokens[0]!, '"for dir in zavx0z/*/; do rm -f \\"$dir\\"/git*.json; done"')?.c).toBe("s")
    expect(tokens[0]!.find((token) => token.s <= separator && token.e > separator)?.c).toBe("p")
  })

  test("uses markdown tokenizer with fenced TypeScript for .md paths", () => {
    const lines = [
      "### Пример action-модуля",
      "",
      "```typescript",
      "const value: string = html`<meta-for fields=${{ command: op }} />`",
      "```",
      "import here is prose, not TypeScript",
    ]
    const tokens = tokenizeSource(lines.join("\n"), {path: "rules/metafor.md"})

    expect(tokenFor(lines[0]!, tokens[0]!, "###")?.c).toBe("p")
    expect(tokenFor(lines[0]!, tokens[0]!, "Пример action-модуля")?.c).toBe("t")
    expect(tokenFor(lines[2]!, tokens[2]!, "typescript")?.c).toBe("t")
    expect(tokenFor(lines[3]!, tokens[3]!, "const")?.c).toBe("k")
    expect(tokenFor(lines[3]!, tokens[3]!, "string")?.c).toBe("t")
    expect(tokenFor(lines[5]!, tokens[5]!, "import")).toBeUndefined()
  })

  test("uses html, css and xml tokenizers for source paths", () => {
    const html = '<style>.pane { color: #fff; background: rgba(12, 18, 30, 0.78); grid-template-columns: 1fr auto auto; }</style><script>const total: number = calc(2)</script>'
    const htmlTokens = tokenizeSource(html, {path: "app/index.html"})[0]!
    expect(tokenFor(html, htmlTokens, "<")?.fg).toBe("#d5b778")
    expect(tokenFor(html, htmlTokens, ".pane")?.c).toBe("t")
    expect(tokenFor(html, htmlTokens, "#fff")?.bg).toBe("#fff")
    expect(tokenFor(html, htmlTokens, "rgba")?.c).toBe("f")
    expect(tokenFor(html, htmlTokens, "rgba")?.bg).toBe("rgba(12, 18, 30, 0.78)")
    expect(tokenFor(html, htmlTokens, "grid-template-columns")?.c).toBe("t")
    expect(tokenFor(html, htmlTokens, "auto")?.c).toBe("k")
    expect(tokenFor(html, htmlTokens, "number")?.c).toBe("t")
    expect(tokenFor(html, htmlTokens, "calc")?.c).toBe("f")

    const css = ".pane { color: #ffcc00; background: rgba(12, 18, 30, 0.78); grid-template-columns: 1fr auto auto; display: flex; }"
    const cssTokens = tokenizeSource(css, {path: "app/style.css"})[0]!
    expect(tokenFor(css, cssTokens, ".pane")?.c).toBe("t")
    expect(tokenFor(css, cssTokens, "#ffcc00")?.bg).toBe("#ffcc00")
    expect(tokenFor(css, cssTokens, "rgba")?.c).toBe("f")
    expect(tokenFor(css, cssTokens, "rgba")?.bg).toBe("rgba(12, 18, 30, 0.78)")
    expect(tokenFor(css, cssTokens, "grid-template-columns")?.c).toBe("t")
    expect(tokenFor(css, cssTokens, "auto")?.c).toBe("k")
    expect(tokenFor(css, cssTokens, "flex")?.c).toBe("k")

    const xml = '<svg><style>.pane { color: #fff; }</style></svg>'
    const xmlTokens = tokenizeSource(xml, {path: "icon.svg"})[0]!
    expect(tokenFor(xml, xmlTokens, "<")?.fg).toBe("#d5b778")
    expect(tokenFor(xml, xmlTokens, ".pane")).toBeUndefined()
    expect(tokenFor(xml, xmlTokens, "#fff")?.bg).toBeUndefined()
  })

  test("highlights template literal expressions as TypeScript", () => {
    const line = "const db = new SQL(`sqlite://${storePath}`)"
    const tokens = tokenize(line)

    expect(tokenFor(line, tokens[0]!, "const")?.c).toBe("k")
    expect(tokenFor(line, tokens[0]!, "SQL")?.c).toBe("n")
    expect(tokenFor(line, tokens[0]!, "sqlite://")?.c).toBe("s")
    expect(tokenFor(line, tokens[0]!, "${")?.c).toBe("p")
    expect(tokenFor(line, tokens[0]!, "storePath")?.c).toBe("d")
    expect(stringTokenCovering(line, tokens[0]!, "storePath")).toBeUndefined()
  })

  test("highlights object keys and typed parameter names", () => {
    const lines = [
      "const store = { fields: [{ type: FIELD_TYPE.F32 }], localValueOffset: 0 }",
      "function update(braneIndex: number, fieldIndex?: number) { return { scope: \"local\" } }",
      "return this.branes[braneIndex] ?? record?.fieldIndex ?? brane.localValueOffset ?? this.getFieldLocation()",
    ]
    const tokens = tokenize(lines.join("\n"))

    expect(tokenFor(lines[0]!, tokens[0]!, "fields")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "type")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "localValueOffset")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "braneIndex")?.c).toBe("d")
    expect(tokenFor(lines[1]!, tokens[1]!, "fieldIndex")?.c).toBe("d")
    expect(tokenFor(lines[1]!, tokens[1]!, "number")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "number")?.fg).toBe("#cf8e6d")
    expect(tokenFor(lines[1]!, tokens[1]!, "scope")?.c).toBe("t")
    expect(tokenFor(lines[2]!, tokens[2]!, "branes")?.c).toBe("t")
    expect(tokenFor(lines[2]!, tokens[2]!, "fieldIndex")?.c).toBe("t")
    expect(tokenFor(lines[2]!, tokens[2]!, "?.fieldIndex")?.c).toBe("t")
    expect(tokenFor(lines[2]!, tokens[2]!, "localValueOffset")?.c).toBe("t")
    expect(tokenFor(lines[2]!, tokens[2]!, ".localValueOffset")?.c).toBe("t")
    expect(tokenFor(lines[2]!, tokens[2]!, "getFieldLocation")?.c).toBe("f")
  })
})

function tokenFor(line: string, tokens: readonly Token[], fragment: string): Token | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}

function stringTokenCovering(line: string, tokens: readonly Token[], fragment: string): Token | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.c === "s" && token.s <= s && token.e >= e)
}
