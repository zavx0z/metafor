import {describe, expect, test} from "bun:test"
import {tokenizeTypeScript} from "./typescript.ts"
import type {EditorToken} from "../tokens.ts"

describe("tokenizeTypeScript", () => {
  test("highlights common JavaScript and TypeScript token classes", () => {
    const lines = [
      "import {describe, expect, test} from \"bun:test\"",
      "const Thing = call(\"value\", 42) // tail",
      "/* open",
      "still */ const next = 1",
    ]
    const tokens = tokenizeTypeScript(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "import")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "describe")?.c).toBe("f")
    expect(tokenFor(lines[0]!, tokens[0]!, "expect")?.c).toBe("f")
    expect(tokenFor(lines[0]!, tokens[0]!, "test")?.c).toBe("f")
    expect(tokenFor(lines[0]!, tokens[0]!, "\"bun:test\"")?.c).toBe("s")
    expect(tokenFor(lines[1]!, tokens[1]!, "const")?.c).toBe("k")
    expect(tokenFor(lines[1]!, tokens[1]!, "\"value\"")?.c).toBe("s")
    expect(tokenFor(lines[1]!, tokens[1]!, "42")?.c).toBe("n")
    expect(tokenFor(lines[1]!, tokens[1]!, "// tail")?.c).toBe("c")
    expect(tokenFor(lines[1]!, tokens[1]!, "call")?.c).toBe("f")
    expect(tokenFor(lines[1]!, tokens[1]!, "Thing")?.c).toBe("t")
    expect(tokenFor(lines[2]!, tokens[2]!, "/* open")?.c).toBe("c")
    expect(tokenFor(lines[3]!, tokens[3]!, "still */")?.c).toBe("c")
  })

  test("highlights sqlite inside sql tagged template literals", () => {
    const lines = [
      "await sql<Array<{src: string}>>`SELECT src FROM wimp WHERE src = 'zavx0z/git-history-commit'`",
    ]
    const tokens = tokenizeTypeScript(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "await")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "sql")?.c).toBe("f")
    expect(tokenFor(lines[0]!, tokens[0]!, "Array")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "SELECT")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "FROM")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "WHERE")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "'zavx0z/git-history-commit'")?.c).toBe("s")
  })

  test("highlights object keys and typed parameter names", () => {
    const lines = [
      "const store = { fields: [{ type: FIELD_TYPE.F32 }], localValueOffset: 0 }",
      "function update(braneIndex: number, fieldIndex?: number) { return { scope: \"local\" } }",
    ]
    const tokens = tokenizeTypeScript(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "fields")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "type")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "localValueOffset")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "FIELD_TYPE")?.c).toBe("n")
    expect(tokenFor(lines[1]!, tokens[1]!, "braneIndex")?.c).toBe("d")
    expect(tokenFor(lines[1]!, tokens[1]!, "fieldIndex")?.c).toBe("d")
    expect(tokenFor(lines[1]!, tokens[1]!, "number")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "scope")?.c).toBe("t")
  })
})

function tokenFor(line: string, tokens: readonly EditorToken[], fragment: string): EditorToken | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}
