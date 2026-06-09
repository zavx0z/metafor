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
    const tokens = tokenizeSource(line, {path: "store/wimp.sql"})

    expect(tokenFor(line, tokens[0]!, "SELECT")?.c).toBe("k")
    expect(tokenFor(line, tokens[0]!, "FROM")?.c).toBe("k")
    expect(tokenFor(line, tokens[0]!, "'x'")?.c).toBe("s")
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
