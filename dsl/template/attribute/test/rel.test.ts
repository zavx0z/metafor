import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../index.ts"

describe("rel", () => {
  describe("статические значения", () => {
    it("одно значение", () => {
      const attrs = parseAttributes('rel="nofollow"')
      expect(attrs).toEqual({
        string: { rel: { type: "static", value: "nofollow" } },
      })
    })
    it("одно значение без кавычек", () => {
      const attrs = parseAttributes("rel=nofollow")
      expect(attrs).toEqual({
        string: { rel: { type: "static", value: "nofollow" } },
      })
    })
    it("несколько значений", () => {
      const attrs = parseAttributes('rel="nofollow noopener noreferrer"')
      expect(attrs).toEqual({
        array: {
          rel: [
            { type: "static", value: "nofollow" },
            { type: "static", value: "noopener" },
            { type: "static", value: "noreferrer" },
          ],
        },
      })
    })
  })

  describe("динамические значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('rel="${core.rel}"')
      expect(attrs).toEqual({
        string: { rel: { type: "dynamic", value: "${core.rel}" } },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes("rel=${core.rel}")
      expect(attrs).toEqual({
        string: { rel: { type: "dynamic", value: "${core.rel}" } },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes('rel="${core.rel} ${core.rel}"')
      expect(attrs).toEqual({
        array: {
          rel: [
            { type: "dynamic", value: "${core.rel}" },
            { type: "dynamic", value: "${core.rel}" },
          ],
        },
      })
    })

    it("с операторами сравнения", () => {
      const attrs = parseAttributes('rel="${core.type === "external" ? "nofollow noopener" : "nofollow"}"')
      expect(attrs).toEqual({
        string: {
          rel: { type: "dynamic", value: '${core.type === "external" ? "nofollow noopener" : "nofollow"}' },
        },
      })
    })

    it("с логическими операторами", () => {
      const attrs = parseAttributes(
        'rel="${core.external && core.secure ? "nofollow noopener noreferrer" : "nofollow"}"'
      )
      expect(attrs).toEqual({
        string: {
          rel: {
            type: "dynamic",
            value: '${core.external && core.secure ? "nofollow noopener noreferrer" : "nofollow"}',
          },
        },
      })
    })

    it("с оператором ИЛИ", () => {
      const attrs = parseAttributes('rel="${core.external || core.secure ? "nofollow noopener" : "nofollow"}"')
      expect(attrs).toEqual({
        string: {
          rel: { type: "dynamic", value: '${core.external || core.secure ? "nofollow noopener" : "nofollow"}' },
        },
      })
    })

    it("с оператором НЕ", () => {
      const attrs = parseAttributes('rel="${!core.trusted ? "nofollow" : ""}"')
      expect(attrs).toEqual({
        string: { rel: { type: "dynamic", value: '${!core.trusted ? "nofollow" : ""}' } },
      })
    })
  })

  describe("смешанные значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('rel="pre-${core.rel}"')
      expect(attrs).toEqual({
        string: { rel: { type: "mixed", value: "pre-${core.rel}" } },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes('rel="pre-${core.rel} pre-${core.rel}"')
      expect(attrs).toEqual({
        array: {
          rel: [
            { type: "mixed", value: "pre-${core.rel}" },
            { type: "mixed", value: "pre-${core.rel}" },
          ],
        },
      })
    })

    it("с операторами сравнения в смешанном значении", () => {
      const attrs = parseAttributes('rel="rel-${core.type === "external" ? "external" : "internal"}"')
      expect(attrs).toEqual({
        string: { rel: { type: "mixed", value: 'rel-${core.type === "external" ? "external" : "internal"}' } },
      })
    })

    it("с логическими операторами в смешанном значении", () => {
      const attrs = parseAttributes('rel="link-${core.external && core.secure ? "secure" : "normal"}"')
      expect(attrs).toEqual({
        string: { rel: { type: "mixed", value: 'link-${core.external && core.secure ? "secure" : "normal"}' } },
      })
    })
  })

  describe("различные варианты", () => {
    it("с условными rel значениями", () => {
      const attrs = parseAttributes(
        'rel="nofollow ${core.external ? "noopener" : ""} ${core.secure ? "noreferrer" : ""}"'
      )
      expect(attrs).toEqual({
        array: {
          rel: [
            { type: "static", value: "nofollow" },
            { type: "dynamic", value: '${core.external ? "noopener" : ""}' },
            { type: "dynamic", value: '${core.secure ? "noreferrer" : ""}' },
          ],
        },
      })
    })

    it("с вложенными выражениями", () => {
      const attrs = parseAttributes('rel="link/${core.nested ? "nested" : "default"}"')
      expect(attrs).toEqual({
        string: { rel: { type: "mixed", value: 'link/${core.nested ? "nested" : "default"}' } },
      })
    })

    it("с пустыми значениями", () => {
      const attrs = parseAttributes('rel="nofollow ${core.external ? "noopener" : ""}"')
      expect(attrs).toEqual({
        array: {
          rel: [
            { type: "static", value: "nofollow" },
            { type: "dynamic", value: '${core.external ? "noopener" : ""}' },
          ],
        },
      })
    })
  })
})
