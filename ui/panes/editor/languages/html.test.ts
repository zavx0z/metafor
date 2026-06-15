import {describe, expect, test} from "bun:test"
import {tokenizeHtml} from "./html.ts"
import type {EditorToken} from "../tokens.ts"

describe("tokenizeHtml", () => {
  test("highlights HTML plus embedded CSS and TypeScript", () => {
    const lines = [
      "<section class=\"pane\">{{title}}</section>",
      "<style>.pane { color: #fff; background: rgba(12, 18, 30, 0.78); grid-template-columns: 1fr auto auto; }</style>",
      "<script>const total: number = calc(2)</script>",
    ]
    const tokens = tokenizeHtml(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "<")?.fg).toBe("#d5b778")
    expect(tokenFor(lines[0]!, tokens[0]!, "section")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "class")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "\"pane\"")?.c).toBe("s")
    expect(tokenFor(lines[0]!, tokens[0]!, "{{title}}")?.c).toBe("f")
    expect(tokenFor(lines[1]!, tokens[1]!, ".pane")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "#fff")?.bg).toBe("#fff")
    expect(tokenFor(lines[1]!, tokens[1]!, "rgba")?.c).toBe("f")
    expect(tokenFor(lines[1]!, tokens[1]!, "rgba")?.bg).toBe("rgba(12, 18, 30, 0.78)")
    expect(tokenFor(lines[1]!, tokens[1]!, "grid-template-columns")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "auto")?.c).toBe("k")
    expect(tokenFor(lines[2]!, tokens[2]!, "const")?.c).toBe("k")
    expect(tokenFor(lines[2]!, tokens[2]!, "number")?.c).toBe("t")
    expect(tokenFor(lines[2]!, tokens[2]!, "calc")?.c).toBe("f")
  })
})

function tokenFor(line: string, tokens: readonly EditorToken[], fragment: string): EditorToken | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}
