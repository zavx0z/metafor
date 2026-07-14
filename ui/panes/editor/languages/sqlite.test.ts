import {describe, expect, test} from "bun:test"
import {tokenizeSqlite} from "./sqlite.ts"
import type {EditorToken} from "../tokens.ts"

describe("tokenizeSqlite", () => {
  test("highlights SQLite keywords, strings, functions, comments and numbers", () => {
    const lines = [
      "SELECT src, count(*) FROM wimp WHERE src = 'owner/project-history-commit' AND n > 1 -- tail",
    ]
    const tokens = tokenizeSqlite(lines)

    expect(tokenFor(lines[0]!, tokens[0]!, "SELECT")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "FROM")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "WHERE")?.c).toBe("k")
    expect(tokenFor(lines[0]!, tokens[0]!, "'owner/project-history-commit'")?.c).toBe("s")
    expect(tokenFor(lines[0]!, tokens[0]!, "count")?.c).toBe("f")
    expect(tokenFor(lines[0]!, tokens[0]!, "1")?.c).toBe("n")
    expect(tokenFor(lines[0]!, tokens[0]!, "-- tail")?.c).toBe("c")
  })
})

function tokenFor(line: string, tokens: readonly EditorToken[], fragment: string): EditorToken | undefined {
  const s = line.indexOf(fragment)
  if (s < 0) return undefined
  const e = s + fragment.length
  return tokens.find((token) => token.s <= s && token.e >= e)
}
