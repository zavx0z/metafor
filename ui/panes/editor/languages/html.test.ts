import {describe, expect, test} from "bun:test"
import {tokenizeHtml} from "./html.ts"
import type {EditorToken} from "../tokens.ts"

describe("tokenizeHtml", () => {
  test("highlights HTML plus embedded CSS and JavaScript", () => {
    const lines = [
      "<section class=\"pane\">{{title}}</section>",
      "<style>.pane { color: #fff; }</style>",
      "<script>const total = calc(2)</script>",
    ]
    const tokens = tokenizeHtml(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "section")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "class")?.c).toBe("t")
    expect(tokenFor(lines[0]!, tokens[0]!, "\"pane\"")?.c).toBe("s")
    expect(tokenFor(lines[0]!, tokens[0]!, "{{title}}")?.c).toBe("f")
    expect(tokenFor(lines[1]!, tokens[1]!, ".pane")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "#fff")?.bg).toBe("#fff")
    expect(tokenFor(lines[2]!, tokens[2]!, "const")?.c).toBe("k")
    expect(tokenFor(lines[2]!, tokens[2]!, "calc")?.c).toBe("f")
  })
})

function tokenFor(line: string, tokens: readonly EditorToken[], fragment: string): EditorToken | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}
