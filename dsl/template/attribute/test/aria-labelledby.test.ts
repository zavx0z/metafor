import { describe, it, expect } from "bun:test"
import { parseAttributes } from ".."

describe("aria-labelledby", () => {
  describe("статические значения", () => {
    it("aria-labelledby одно", () => {
      const attrs = parseAttributes('aria-labelledby="title"')
      expect(attrs).toEqual({
        string: { "aria-labelledby": { type: "static", value: "title" } },
      })
    })
    it("aria-labelledby одно без кавычек", () => {
      const attrs = parseAttributes("aria-labelledby=title")
      expect(attrs).toEqual({
        string: { "aria-labelledby": { type: "static", value: "title" } },
      })
    })
    it("aria-labelledby несколько", () => {
      const attrs = parseAttributes('aria-labelledby="title subtitle"')
      expect(attrs).toEqual({
        array: {
          "aria-labelledby": [
            { type: "static", value: "title" },
            { type: "static", value: "subtitle" },
          ],
        },
      })
    })
    it("aria-describedby несколько", () => {
      const attrs = parseAttributes('aria-describedby="description note"')
      expect(attrs).toEqual({
        array: {
          "aria-describedby": [
            { type: "static", value: "description" },
            { type: "static", value: "note" },
          ],
        },
      })
    })
  })

  describe("динамические значения", () => {
    it("aria-labelledby одно", () => {
      const attrs = parseAttributes('aria-labelledby="${core.id}"')
      expect(attrs).toEqual({
        string: { "aria-labelledby": { type: "dynamic", value: "${core.id}" } },
      })
    })
    it("aria-labelledby одно без кавычек", () => {
      const attrs = parseAttributes("aria-labelledby=${core.id}")
      expect(attrs).toEqual({
        string: { "aria-labelledby": { type: "dynamic", value: "${core.id}" } },
      })
    })
    it("aria-labelledby несколько", () => {
      const attrs = parseAttributes('aria-labelledby="${core.id} ${core.id}"')
      expect(attrs).toEqual({
        array: {
          "aria-labelledby": [
            { type: "dynamic", value: "${core.id}" },
            { type: "dynamic", value: "${core.id}" },
          ],
        },
      })
    })

    it("с операторами сравнения", () => {
      const attrs = parseAttributes('aria-labelledby="${core.type === "admin" ? "admin-title" : "user-title"}"')
      expect(attrs).toEqual({
        string: {
          "aria-labelledby": {
            type: "dynamic",
            value: '${core.type === "admin" ? "admin-title" : "user-title"}',
          },
        },
      })
    })

    it("с логическими операторами", () => {
      const attrs = parseAttributes(
        'aria-labelledby="${core.hasTitle && core.hasSubtitle ? "title subtitle" : "title"}"'
      )
      expect(attrs).toEqual({
        string: {
          "aria-labelledby": {
            type: "dynamic",
            value: '${core.hasTitle && core.hasSubtitle ? "title subtitle" : "title"}',
          },
        },
      })
    })

    it("с оператором ИЛИ", () => {
      const attrs = parseAttributes(
        'aria-labelledby="${core.hasTitle || core.hasSubtitle ? "title subtitle" : "default"}"'
      )
      expect(attrs).toEqual({
        string: {
          "aria-labelledby": {
            type: "dynamic",
            value: '${core.hasTitle || core.hasSubtitle ? "title subtitle" : "default"}',
          },
        },
      })
    })

    it("с оператором НЕ", () => {
      const attrs = parseAttributes('aria-labelledby="${!core.hidden ? "title" : ""}"')
      expect(attrs).toEqual({
        string: {
          "aria-labelledby": { type: "dynamic", value: '${!core.hidden ? "title" : ""}' },
        },
      })
    })
  })

  describe("смешанные значения", () => {
    it("aria-describedby динамика+статик", () => {
      const attrs = parseAttributes('aria-describedby="${core.id} note"')
      expect(attrs).toEqual({
        array: {
          "aria-describedby": [
            { type: "dynamic", value: "${core.id}" },
            { type: "static", value: "note" },
          ],
        },
      })
    })

    it("aria-labelledby статик+динамика", () => {
      const attrs = parseAttributes('aria-labelledby="title ${core.subtitle}"')
      expect(attrs).toEqual({
        array: {
          "aria-labelledby": [
            { type: "static", value: "title" },
            { type: "dynamic", value: "${core.subtitle}" },
          ],
        },
      })
    })

    it("с операторами сравнения в смешанном значении", () => {
      const attrs = parseAttributes('aria-labelledby="title-${core.type === "admin" ? "admin" : "user"}"')
      expect(attrs).toEqual({
        string: {
          "aria-labelledby": { type: "mixed", value: 'title-${core.type === "admin" ? "admin" : "user"}' },
        },
      })
    })

    it("с логическими операторами в смешанном значении", () => {
      const attrs = parseAttributes('aria-labelledby="label-${core.hasTitle && core.hasSubtitle ? "full" : "simple"}"')
      expect(attrs).toEqual({
        string: {
          "aria-labelledby": {
            type: "mixed",
            value: 'label-${core.hasTitle && core.hasSubtitle ? "full" : "simple"}',
          },
        },
      })
    })
  })

  describe("различные варианты", () => {
    it("с условными ID", () => {
      const attrs = parseAttributes(
        'aria-labelledby="title ${core.hasSubtitle ? "subtitle" : ""} ${core.hasDescription ? "description" : ""}"'
      )
      expect(attrs).toEqual({
        array: {
          "aria-labelledby": [
            { type: "static", value: "title" },
            { type: "dynamic", value: '${core.hasSubtitle ? "subtitle" : ""}' },
            { type: "dynamic", value: '${core.hasDescription ? "description" : ""}' },
          ],
        },
      })
    })

    it("с вложенными выражениями", () => {
      const attrs = parseAttributes('aria-labelledby="label/${core.nested ? "nested" : "default"}"')
      expect(attrs).toEqual({
        string: {
          "aria-labelledby": { type: "mixed", value: 'label/${core.nested ? "nested" : "default"}' },
        },
      })
    })

    it("с пустыми значениями", () => {
      const attrs = parseAttributes('aria-labelledby="title ${core.hasSubtitle ? "subtitle" : ""}"')
      expect(attrs).toEqual({
        array: {
          "aria-labelledby": [
            { type: "static", value: "title" },
            { type: "dynamic", value: '${core.hasSubtitle ? "subtitle" : ""}' },
          ],
        },
      })
    })
  })
})
