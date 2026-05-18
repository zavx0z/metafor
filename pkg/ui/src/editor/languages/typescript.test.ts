import {describe, expect, test} from "bun:test"
import {tokenizeTypeScript} from "./typescript.ts"
import type {EditorToken} from "../tokens.ts"

describe("tokenizeTypeScript", () => {
  test("highlights common JavaScript and TypeScript token classes", () => {
    const lines = [
      "const Thing = call(\"value\", 42) // tail",
      "/* open",
      "still */ const next = 1",
    ]
    const tokens = tokenizeTypeScript(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "const")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "\"value\"")?.c).toBe("s")
    expect(tokenFor(lines[0]!, tokens[0]!, "42")?.c).toBe("n")
    expect(tokenFor(lines[0]!, tokens[0]!, "// tail")?.c).toBe("c")
    expect(tokenFor(lines[0]!, tokens[0]!, "call")?.c).toBe("f")
    expect(tokenFor(lines[0]!, tokens[0]!, "Thing")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "/* open")?.c).toBe("c")
    expect(tokenFor(lines[2]!, tokens[2]!, "still */")?.c).toBe("c")
  })
})

function tokenFor(line: string, tokens: readonly EditorToken[], fragment: string): EditorToken | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}
