import {describe, expect, test} from "bun:test"
import {tokenizeCss} from "./css.ts"
import type {EditorToken} from "../tokens.ts"

describe("tokenizeCss", () => {
  test("highlights selectors, properties, values, numbers, colors, and comments", () => {
    const lines = [
      ".pane { color: #ffcc00; margin: 12px; display: flex; }",
      "/* theme */",
    ]
    const tokens = tokenizeCss(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, ".pane")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "color")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "#ffcc00")?.c).toBe("n")
    expect(tokenFor(lines[0]!, tokens[0]!, "#ffcc00")?.bg).toBe("#ffcc00")
    expect(tokenFor(lines[0]!, tokens[0]!, "12px")?.c).toBe("n")
    expect(tokenFor(lines[0]!, tokens[0]!, "flex")?.c).toBe("k")
    expect(tokenFor(lines[1]!, tokens[1]!, "/* theme */")?.c).toBe("c")
  })
})

function tokenFor(line: string, tokens: readonly EditorToken[], fragment: string): EditorToken | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}
