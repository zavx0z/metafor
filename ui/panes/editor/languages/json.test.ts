import {describe, expect, test} from "bun:test"
import {tokenizeJson} from "./json.ts"
import type {EditorToken} from "../tokens.ts"

describe("tokenizeJson", () => {
  test("highlights package json keys, globs, escaped strings and literals", () => {
    const lines = [
      '  "workspaces": [',
      '    "ui/*",',
      '    "pkg/**/*"',
      "  ],",
      '  "zavx0z:build": "bun run --parallel --filter \'@zavx0z/*\' build",',
      '  "zavx0z:clean": "for dir in zavx0z/*/; do rm -f \\"$dir\\"/git*.json; done",',
      '  "private": true,',
      '  "version": 1',
    ]
    const tokens = tokenizeJson(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, '"workspaces"')?.c).toBe("t")
    expect(tokenFor(lines[1]!, tokens[1]!, '"ui/*"')?.c).toBe("s")
    expect(tokenFor(lines[2]!, tokens[2]!, '"pkg/**/*"')?.c).toBe("s")
    expect(tokenFor(lines[4]!, tokens[4]!, '"zavx0z:build"')?.c).toBe("t")
    expect(tokenFor(lines[4]!, tokens[4]!, '"bun run --parallel --filter \'@zavx0z/*\' build"')?.c).toBe("s")
    expect(tokenFor(lines[5]!, tokens[5]!, '"zavx0z:clean"')?.c).toBe("t")
    expect(tokenFor(lines[5]!, tokens[5]!, '"for dir in zavx0z/*/; do rm -f \\"$dir\\"/git*.json; done"')?.c).toBe("s")
    expect(tokenFor(lines[6]!, tokens[6]!, "true")?.c).toBe("k")
    expect(tokenFor(lines[7]!, tokens[7]!, "1")?.c).toBe("n")
    expect(tokenFor(lines[0]!, tokens[0]!, ":")?.c).toBe("p")
  })
})

function tokenFor(line: string, tokens: readonly EditorToken[], fragment: string): EditorToken | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}
