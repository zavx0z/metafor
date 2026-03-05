import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../index.ts"

describe("ping", () => {
  describe("статические значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('ping="https://a.example"')
      expect(attrs).toEqual({
        string: { ping: { type: "static", value: "https://a.example" } },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes("ping=https://a.example")
      expect(attrs).toEqual({
        string: { ping: { type: "static", value: "https://a.example" } },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes('ping="https://a.example https://b.example"')
      expect(attrs).toEqual({
        array: {
          ping: [
            { type: "static", value: "https://a.example" },
            { type: "static", value: "https://b.example" },
          ],
        },
      })
    })
  })

  describe("динамические значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('ping="${core.url}"')
      expect(attrs).toEqual({
        string: { ping: { type: "dynamic", value: "${core.url}" } },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes("ping=${core.url}")
      expect(attrs).toEqual({
        string: { ping: { type: "dynamic", value: "${core.url}" } },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes('ping="${core.url} ${core.url}"')
      expect(attrs).toEqual({
        array: {
          ping: [
            { type: "dynamic", value: "${core.url}" },
            { type: "dynamic", value: "${core.url}" },
          ],
        },
      })
    })

    it("с операторами сравнения", () => {
      const attrs = parseAttributes(
        'ping="${core.type === "external" ? "https://tracker.example" : "https://internal.example"}"'
      )
      expect(attrs).toEqual({
        string: {
          ping: {
            type: "dynamic",
            value: '${core.type === "external" ? "https://tracker.example" : "https://internal.example"}',
          },
        },
      })
    })

    it("с логическими операторами", () => {
      const attrs = parseAttributes(
        'ping="${core.tracking && core.analytics ? "https://tracker.example https://analytics.example" : "https://basic.example"}"'
      )
      expect(attrs).toEqual({
        string: {
          ping: {
            type: "dynamic",
            value:
              '${core.tracking && core.analytics ? "https://tracker.example https://analytics.example" : "https://basic.example"}',
          },
        },
      })
    })

    it("с оператором ИЛИ", () => {
      const attrs = parseAttributes(
        'ping="${core.tracking || core.analytics ? "https://tracker.example" : "https://basic.example"}"'
      )
      expect(attrs).toEqual({
        string: {
          ping: {
            type: "dynamic",
            value: '${core.tracking || core.analytics ? "https://tracker.example" : "https://basic.example"}',
          },
        },
      })
    })

    it("с оператором НЕ", () => {
      const attrs = parseAttributes('ping="${!core.privacy ? "https://tracker.example" : ""}"')
      expect(attrs).toEqual({
        string: { ping: { type: "dynamic", value: '${!core.privacy ? "https://tracker.example" : ""}' } },
      })
    })
  })

  describe("смешанные значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('ping="https://a.example ${core.url}"')
      expect(attrs).toEqual({
        array: {
          ping: [
            { type: "static", value: "https://a.example" },
            { type: "dynamic", value: "${core.url}" },
          ],
        },
      })
    })

    it("несколько", () => {
      const attrs = parseAttributes('ping="https://a.example ${core.url} https://b.example"')
      expect(attrs).toEqual({
        array: {
          ping: [
            { type: "static", value: "https://a.example" },
            { type: "dynamic", value: "${core.url}" },
            { type: "static", value: "https://b.example" },
          ],
        },
      })
    })

    it("с операторами сравнения в смешанном значении", () => {
      const attrs = parseAttributes('ping="https://${core.type === "external" ? "tracker" : "internal"}.example"')
      expect(attrs).toEqual({
        string: {
          ping: { type: "mixed", value: 'https://${core.type === "external" ? "tracker" : "internal"}.example' },
        },
      })
    })

    it("с логическими операторами в смешанном значении", () => {
      const attrs = parseAttributes('ping="https://${core.tracking && core.analytics ? "full" : "basic"}.example"')
      expect(attrs).toEqual({
        string: {
          ping: { type: "mixed", value: 'https://${core.tracking && core.analytics ? "full" : "basic"}.example' },
        },
      })
    })
  })

  describe("различные варианты", () => {
    it("с условными URL", () => {
      const attrs = parseAttributes(
        'ping="https://a.example ${core.tracking ? "https://tracker.example" : ""} ${core.analytics ? "https://analytics.example" : ""}"'
      )
      expect(attrs).toEqual({
        array: {
          ping: [
            { type: "static", value: "https://a.example" },
            { type: "dynamic", value: '${core.tracking ? "https://tracker.example" : ""}' },
            { type: "dynamic", value: '${core.analytics ? "https://analytics.example" : ""}' },
          ],
        },
      })
    })

    it("с вложенными выражениями", () => {
      const attrs = parseAttributes('ping="https://${core.nested ? "nested" : "default"}.example"')
      expect(attrs).toEqual({
        string: { ping: { type: "mixed", value: 'https://${core.nested ? "nested" : "default"}.example' } },
      })
    })

    it("с пустыми значениями", () => {
      const attrs = parseAttributes('ping="https://a.example ${core.tracking ? "https://tracker.example" : ""}"')
      expect(attrs).toEqual({
        array: {
          ping: [
            { type: "static", value: "https://a.example" },
            { type: "dynamic", value: '${core.tracking ? "https://tracker.example" : ""}' },
          ],
        },
      })
    })
  })
})
