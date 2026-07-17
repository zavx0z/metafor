import {describe, expect, test} from "bun:test"
import {activeSyntaxThemeName, resolveVscodeSyntaxTokens, syntaxTokens, type VscodeColorTheme} from "./theme.ts"
import type {Color} from "@metafor/engine"

function toHex(color: Color): string {
  const part = (value: number): string => Math.round(value * 255).toString(16).padStart(2, "0")
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`
}

describe("VS Code syntax themes", () => {
  test("resolves the bundled Islands Dark theme", () => {
    expect(activeSyntaxThemeName).toBe("Islands Dark")
    expect(toHex(syntaxTokens.k)).toBe("#cf8e6d")
    expect(toHex(syntaxTokens.s)).toBe("#6aab73")
    expect(toHex(syntaxTokens.n)).toBe("#2aacb8")
    expect(toHex(syntaxTokens.c)).toBe("#7a7e85")
    expect(toHex(syntaxTokens.t)).toBe("#bcbec4")
    expect(toHex(syntaxTokens.f)).toBe("#56a8f5")
    expect(toHex(syntaxTokens.p)).toBe("#bcbec4")
    expect(toHex(syntaxTokens.d)).toBe("#bcbec4")
  })

  test("maps TextMate scopes from a VS Code theme JSON", () => {
    const theme: VscodeColorTheme = {
      colors: {"editor.foreground": "#101112"},
      tokenColors: [
        {scope: "keyword", settings: {foreground: "#111111"}},
        {scope: ["string", "constant.numeric"], settings: {foreground: "#222222"}},
        {scope: "comment, punctuation.definition.comment", settings: {foreground: "#333333"}},
        {scope: "entity.name.function", settings: {foreground: "#444444"}},
        {scope: "entity.name.type", settings: {foreground: "#555555"}},
        {scope: "punctuation.separator.delimiter", settings: {foreground: "#666666"}},
      ],
    }

    const resolved = resolveVscodeSyntaxTokens(theme)
    expect(toHex(resolved.k)).toBe("#111111")
    expect(toHex(resolved.s)).toBe("#222222")
    expect(toHex(resolved.n)).toBe("#222222")
    expect(toHex(resolved.c)).toBe("#333333")
    expect(toHex(resolved.f)).toBe("#444444")
    expect(toHex(resolved.t)).toBe("#555555")
    expect(toHex(resolved.p)).toBe("#666666")
    expect(toHex(resolved.d)).toBe("#101112")
  })
})
