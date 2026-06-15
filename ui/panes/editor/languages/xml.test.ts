import {describe, expect, test} from "bun:test"
import {tokenizeXml} from "./xml.ts"
import type {EditorToken} from "../tokens.ts"

describe("tokenizeXml", () => {
  test("highlights XML tags, tag punctuation, attributes, strings and entities without embedded CSS", () => {
    const lines = [
      "<?xml version=\"1.0\"?>",
      "<svg viewBox=\"0 0 24 24\"><style>.pane { color: #fff; }</style><text>&amp;</text></svg>",
    ]
    const tokens = tokenizeXml(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "<?")?.c).toBe("k")
    expect(tokenFor(lines[1]!, tokens[1]!, "<")?.fg).toBe("#d5b778")
    expect(tokenFor(lines[1]!, tokens[1]!, "svg")?.c).toBe("k")
    expect(tokenFor(lines[1]!, tokens[1]!, "viewBox")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "\"0 0 24 24\"")?.c).toBe("s")
    expect(tokenFor(lines[1]!, tokens[1]!, ".pane")).toBeUndefined()
    expect(tokenFor(lines[1]!, tokens[1]!, "#fff")?.bg).toBeUndefined()
    expect(tokenFor(lines[1]!, tokens[1]!, "&amp;")?.c).toBe("n")
  })
})

function tokenFor(line: string, tokens: readonly EditorToken[], fragment: string): EditorToken | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}
