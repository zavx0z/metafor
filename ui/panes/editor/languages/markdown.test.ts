import {describe, expect, test} from "bun:test"
import type {EditorToken} from "../tokens.ts"
import {tokenizeMarkdown} from "./markdown.ts"

describe("tokenizeMarkdown", () => {
  test("highlights markdown headings, inline code and links", () => {
    const lines = [
      "## Пример action-модуля",
      "Use `source.open` with [selection](https://example.test).",
    ]
    const tokens = tokenizeMarkdown(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "##")?.c).toBe("p")
    expect(tokenFor(lines[0]!, tokens[0]!, "Пример action-модуля")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "`source.open`")?.c).toBe("s")
    expect(tokenFor(lines[1]!, tokens[1]!, "selection")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "https://example.test")?.c).toBe("s")
  })

  test("uses nested TypeScript highlighting inside fenced code blocks", () => {
    const lines = [
      "```typescript",
      "const value: string = html`<meta-for fields=${{ command: op }} />`",
      "```",
    ]
    const tokens = tokenizeMarkdown(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "```")?.c).toBe("p")
    expect(tokenFor(lines[0]!, tokens[0]!, "typescript")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "const")?.c).toBe("k")
    expect(tokenFor(lines[1]!, tokens[1]!, "string")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "${")?.c).toBe("p")
    expect(tokenFor(lines[1]!, tokens[1]!, "command")?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, "op")?.c).toBe("d")
    expect(tokenFor(lines[2]!, tokens[2]!, "```")?.c).toBe("p")
  })
})

function tokenFor(line: string, tokens: readonly EditorToken[], fragment: string): EditorToken | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}
