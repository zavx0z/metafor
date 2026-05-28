import {describe, expect, test} from "bun:test"
import {
  listLanguageHighlighters,
  registerLanguageHighlighter,
  resolveLanguageHighlighter,
} from "./highlighter.ts"
import type {LanguageHighlighter} from "./tokens.ts"

describe("resolveLanguageHighlighter", () => {
  test("resolves TypeScript by id and aliases", () => {
    expect(resolveLanguageHighlighter({languageId: "typescript"}).id).toBe("typescript")
    expect(resolveLanguageHighlighter({languageId: "ts"}).id).toBe("typescript")
    expect(resolveLanguageHighlighter({languageId: "js"}).id).toBe("typescript")
    expect(resolveLanguageHighlighter({languageId: "javascript"}).id).toBe("typescript")
  })

  test("resolves TypeScript and JavaScript file extensions", () => {
    expect(resolveLanguageHighlighter({path: "foo.ts"}).id).toBe("typescript")
    expect(resolveLanguageHighlighter({path: "foo.js"}).id).toBe("typescript")
  })

  test("resolves HTML and CSS by id and file extensions", () => {
    expect(resolveLanguageHighlighter({languageId: "html"}).id).toBe("html")
    expect(resolveLanguageHighlighter({languageId: "css"}).id).toBe("css")
    expect(resolveLanguageHighlighter({languageId: "sqlite"}).id).toBe("sqlite")
    expect(resolveLanguageHighlighter({languageId: "sql"}).id).toBe("sqlite")
    expect(resolveLanguageHighlighter({path: "proposal.html"}).id).toBe("html")
    expect(resolveLanguageHighlighter({path: "theme.css"}).id).toBe("css")
    expect(resolveLanguageHighlighter({path: "query.sql"}).id).toBe("sqlite")
  })

  test("falls back to plaintext for unknown extensions", () => {
    expect(resolveLanguageHighlighter({path: "foo.unknown"}).id).toBe("plaintext")
  })

  test("replaces registered highlighter with the same id", () => {
    const first: LanguageHighlighter = {
      id: "unit-test-language",
      name: "Unit Test Language",
      extensions: ["utl"],
      aliases: ["utl"],
      tokenize: (lines) => lines.map(() => []),
    }
    const second: LanguageHighlighter = {
      ...first,
      name: "Unit Test Language 2",
      tokenize: (lines) => lines.map((line) => line.length > 0 ? [{s: 0, e: line.length, c: "x"}] : []),
    }

    registerLanguageHighlighter(first)
    registerLanguageHighlighter(second)

    const matches = listLanguageHighlighters().filter((item) => item.id === first.id)
    expect(matches).toHaveLength(1)
    expect(matches[0]).toBe(second)
    expect(resolveLanguageHighlighter({languageId: "utl"})).toBe(second)
  })
})
