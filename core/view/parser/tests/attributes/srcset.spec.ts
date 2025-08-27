import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../../attributes.ts"

describe.each([
  ["img", "<img"],
  ["source", "<source"],
])("srcset для %s", (_, tag) => {
  describe("статические значения", () => {
    it("одно", () => {
      const attrs = parseAttributes(tag + ' srcset="a.jpg 1x">')
      expect(attrs).toEqual({
        string: { srcset: { type: "static", value: "a.jpg 1x" } },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes(tag + " srcset=a.jpg>")
      expect(attrs).toEqual({
        string: { srcset: { type: "static", value: "a.jpg" } },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes(tag + ' srcset="a.jpg 1x, b.jpg 2x">')
      expect(attrs).toEqual({
        array: {
          srcset: [
            { type: "static", value: "a.jpg 1x" },
            { type: "static", value: "b.jpg 2x" },
          ],
        },
      })
    })
  })

  describe("динамические значения", () => {
    it("одно (чисто динамический токен)", () => {
      const attrs = parseAttributes(tag + ' srcset="${core.src}">')
      expect(attrs).toEqual({
        string: { srcset: { type: "dynamic", value: "core.src" } },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes(tag + " srcset=${core.src}>")
      expect(attrs).toEqual({
        string: { srcset: { type: "dynamic", value: "core.src" } },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes(tag + ' srcset="${core.src}, ${core.src}">')
      expect(attrs).toEqual({
        array: {
          srcset: [
            { type: "dynamic", value: "core.src" },
            { type: "dynamic", value: "core.src" },
          ],
        },
      })
    })

    it("с операторами сравнения", () => {
      const attrs = parseAttributes(tag + ' srcset="${core.type === "retina" ? "image@2x.jpg 2x" : "image.jpg 1x"}">')
      expect(attrs).toEqual({
        string: { srcset: { type: "dynamic", value: 'core.type === "retina" ? "image@2x.jpg 2x" : "image.jpg 1x"' } },
      })
    })

    it("с логическими операторами", () => {
      const attrs = parseAttributes(
        tag + ' srcset="${core.retina && core.webp ? "image@2x.webp 2x" : "image.jpg 1x"}">'
      )
      expect(attrs).toEqual({
        string: {
          srcset: { type: "dynamic", value: 'core.retina && core.webp ? "image@2x.webp 2x" : "image.jpg 1x"' },
        },
      })
    })

    it("с оператором ИЛИ", () => {
      const attrs = parseAttributes(tag + ' srcset="${core.retina || core.webp ? "image@2x.jpg 2x" : "image.jpg 1x"}">')
      expect(attrs).toEqual({
        string: { srcset: { type: "dynamic", value: 'core.retina || core.webp ? "image@2x.jpg 2x" : "image.jpg 1x"' } },
      })
    })

    it("с оператором НЕ", () => {
      const attrs = parseAttributes(tag + ' srcset="${!core.lowBandwidth ? "image@2x.jpg 2x" : "image.jpg 1x"}">')
      expect(attrs).toEqual({
        string: { srcset: { type: "dynamic", value: '!core.lowBandwidth ? "image@2x.jpg 2x" : "image.jpg 1x"' } },
      })
    })
  })

  describe("смешанные значения", () => {
    it("одно", () => {
      const attrs = parseAttributes(tag + ' srcset="${core.src} 2x">')
      expect(attrs).toEqual({
        string: { srcset: { type: "mixed", value: "${core.src} 2x" } },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes(tag + ' srcset="a.jpg 1x, ${core.src} 2x">')
      expect(attrs).toEqual({
        array: {
          srcset: [
            { type: "static", value: "a.jpg 1x" },
            { type: "mixed", value: "${core.src} 2x" },
          ],
        },
      })
    })

    it("с операторами сравнения в смешанном значении", () => {
      const attrs = parseAttributes(tag + ' srcset="image-${core.type === "retina" ? "2x" : "1x"}.jpg">')
      expect(attrs).toEqual({
        string: { srcset: { type: "mixed", value: 'image-${core.type === "retina" ? "2x" : "1x"}.jpg' } },
      })
    })

    it("с логическими операторами в смешанном значении", () => {
      const attrs = parseAttributes(tag + ' srcset="image-${core.retina && core.webp ? "2x.webp" : "1x.jpg"}">')
      expect(attrs).toEqual({
        string: { srcset: { type: "mixed", value: 'image-${core.retina && core.webp ? "2x.webp" : "1x.jpg"}' } },
      })
    })
  })

  describe("различные варианты", () => {
    it("с условными изображениями", () => {
      const attrs = parseAttributes(
        tag + ' srcset="a.jpg 1x, ${core.retina ? "a@2x.jpg 2x" : ""}, ${core.webp ? "a.webp 1x" : ""}">'
      )
      expect(attrs).toEqual({
        array: {
          srcset: [
            { type: "static", value: "a.jpg 1x" },
            { type: "dynamic", value: 'core.retina ? "a@2x.jpg 2x" : ""' },
            { type: "dynamic", value: 'core.webp ? "a.webp 1x" : ""' },
          ],
        },
      })
    })

    it("с вложенными выражениями", () => {
      const attrs = parseAttributes(tag + ' srcset="image/${core.nested ? "nested" : "default"}.jpg">')
      expect(attrs).toEqual({
        string: { srcset: { type: "mixed", value: 'image/${core.nested ? "nested" : "default"}.jpg' } },
      })
    })

    it("с пустыми значениями", () => {
      const attrs = parseAttributes(tag + ' srcset="a.jpg 1x, ${core.retina ? "a@2x.jpg 2x" : ""}">')
      expect(attrs).toEqual({
        array: {
          srcset: [
            { type: "static", value: "a.jpg 1x" },
            { type: "dynamic", value: 'core.retina ? "a@2x.jpg 2x" : ""' },
          ],
        },
      })
    })
  })
})
