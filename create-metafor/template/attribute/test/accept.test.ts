import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../index.ts"

describe("accept", () => {
  describe("статические значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('accept="image/png"')
      expect(attrs).toEqual({
        string: { accept: { type: "static", value: "image/png" } },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes("accept=image/png")
      expect(attrs).toEqual({
        string: { accept: { type: "static", value: "image/png" } },
      })
    })
    it("одно значение с запятой внутри", () => {
      const attrs = parseAttributes('accept="image/png,image/jpeg"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/png" },
            { type: "static", value: "image/jpeg" },
          ],
        },
      })
    })
    it("одно значение с пробелами и запятыми", () => {
      const attrs = parseAttributes('accept="image/png, image/jpeg"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/png" },
            { type: "static", value: "image/jpeg" },
          ],
        },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes('accept="image/png, image/jpeg, .pdf"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/png" },
            { type: "static", value: "image/jpeg" },
            { type: "static", value: ".pdf" },
          ],
        },
      })
    })
    it("несколько с разными типами", () => {
      const attrs = parseAttributes('accept="image/*, video/*, .pdf, .doc"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/*" },
            { type: "static", value: "video/*" },
            { type: "static", value: ".pdf" },
            { type: "static", value: ".doc" },
          ],
        },
      })
    })
    it("несколько с пробелами", () => {
      const attrs = parseAttributes('accept="image/png , image/jpeg , .pdf"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/png" },
            { type: "static", value: "image/jpeg" },
            { type: "static", value: ".pdf" },
          ],
        },
      })
    })
  })

  describe("динамические значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('accept="${core.mime}"')
      expect(attrs).toEqual({
        string: { accept: { type: "dynamic", value: "${core.mime}" } },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes("accept=${core.mime}")
      expect(attrs).toEqual({
        string: { accept: { type: "dynamic", value: "${core.mime}" } },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes('accept="${core.mime}, ${core.mime}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "dynamic", value: "${core.mime}" },
            { type: "dynamic", value: "${core.mime}" },
          ],
        },
      })
    })

    it("с операторами сравнения", () => {
      const attrs = parseAttributes('accept="${core.type === "image" ? "image/*" : "text/*"}"')
      expect(attrs).toEqual({
        string: { accept: { type: "dynamic", value: '${core.type === "image" ? "image/*" : "text/*"}' } },
      })
    })

    it("с логическими операторами", () => {
      const attrs = parseAttributes('accept="${core.allowImages && core.allowDocs ? "image/*,.pdf" : "text/*"}"')
      expect(attrs).toEqual({
        string: {
          accept: { type: "dynamic", value: '${core.allowImages && core.allowDocs ? "image/*,.pdf" : "text/*"}' },
        },
      })
    })

    it("с оператором ИЛИ", () => {
      const attrs = parseAttributes('accept="${core.allowImages || core.allowVideos ? "image/*,video/*" : "text/*"}"')
      expect(attrs).toEqual({
        string: {
          accept: { type: "dynamic", value: '${core.allowImages || core.allowVideos ? "image/*,video/*" : "text/*"}' },
        },
      })
    })

    it("с оператором НЕ", () => {
      const attrs = parseAttributes('accept="${!core.restricted ? "image/*,video/*" : "text/*"}"')
      expect(attrs).toEqual({
        string: { accept: { type: "dynamic", value: '${!core.restricted ? "image/*,video/*" : "text/*"}' } },
      })
    })

    it("сложное выражение с запятыми", () => {
      const attrs = parseAttributes('accept="${core.type === "image" ? "image/png,image/jpeg" : "text/plain"}"')
      expect(attrs).toEqual({
        string: {
          accept: { type: "dynamic", value: '${core.type === "image" ? "image/png,image/jpeg" : "text/plain"}' },
        },
      })
    })

    it("выражение с множественными условиями", () => {
      const attrs = parseAttributes('accept="${core.allowImages && core.allowDocs ? "image/*,.pdf,.doc" : "text/*"}"')
      expect(attrs).toEqual({
        string: {
          accept: { type: "dynamic", value: '${core.allowImages && core.allowDocs ? "image/*,.pdf,.doc" : "text/*"}' },
        },
      })
    })

    it("несколько динамических значений", () => {
      const attrs = parseAttributes('accept="${core.imageType}, ${core.videoType}, ${core.docType}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "dynamic", value: "${core.imageType}" },
            { type: "dynamic", value: "${core.videoType}" },
            { type: "dynamic", value: "${core.docType}" },
          ],
        },
      })
    })

    it("динамические значения с пробелами", () => {
      const attrs = parseAttributes('accept="${core.type1} , ${core.type2} , ${core.type3}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "dynamic", value: "${core.type1}" },
            { type: "dynamic", value: "${core.type2}" },
            { type: "dynamic", value: "${core.type3}" },
          ],
        },
      })
    })
  })

  describe("смешанные значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('accept="image/*, ${core.mime}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/*" },
            { type: "dynamic", value: "${core.mime}" },
          ],
        },
      })
    })

    it("несколько", () => {
      const attrs = parseAttributes('accept="image/*, ${core.mime}, .pdf"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/*" },
            { type: "dynamic", value: "${core.mime}" },
            { type: "static", value: ".pdf" },
          ],
        },
      })
    })

    it("с операторами сравнения в смешанном значении", () => {
      const attrs = parseAttributes('accept="image-${core.type === "png" ? "png" : "jpeg"}"')
      expect(attrs).toEqual({
        string: {
          accept: {
            type: "mixed",
            value: 'image-${core.type === "png" ? "png" : "jpeg"}',
          },
        },
      })
    })

    it("с логическими операторами в смешанном значении", () => {
      const attrs = parseAttributes('accept="file-${core.allowImages && core.allowVideos ? "media" : "doc"}"')
      expect(attrs).toEqual({
        string: {
          accept: {
            type: "mixed",
            value: 'file-${core.allowImages && core.allowVideos ? "media" : "doc"}',
          },
        },
      })
    })

    it("смешанное значение с запятыми", () => {
      const attrs = parseAttributes('accept="type-${core.format === "image" ? "png,jpeg" : "pdf,doc"}"')
      expect(attrs).toEqual({
        string: {
          accept: {
            type: "mixed",
            value: 'type-${core.format === "image" ? "png,jpeg" : "pdf,doc"}',
          },
        },
      })
    })

    it("несколько смешанных значений", () => {
      const attrs = parseAttributes('accept="image-${core.type}, video-${core.format}, .${core.ext}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "mixed", value: "image-${core.type}" },
            { type: "mixed", value: "video-${core.format}" },
            { type: "mixed", value: ".${core.ext}" },
          ],
        },
      })
    })

    it("смешанные значения с пробелами", () => {
      const attrs = parseAttributes('accept="img-${core.type} , vid-${core.format} , .${core.ext}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "mixed", value: "img-${core.type}" },
            { type: "mixed", value: "vid-${core.format}" },
            { type: "mixed", value: ".${core.ext}" },
          ],
        },
      })
    })
  })

  describe("различные варианты", () => {
    it("с условными типами файлов", () => {
      const attrs = parseAttributes('accept="image/*, ${core.allowPdf ? ".pdf" : ""}, ${core.allowDoc ? ".doc" : ""}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/*" },
            { type: "dynamic", value: '${core.allowPdf ? ".pdf" : ""}' },
            { type: "dynamic", value: '${core.allowDoc ? ".doc" : ""}' },
          ],
        },
      })
    })

    it("с вложенными выражениями", () => {
      const attrs = parseAttributes('accept="media/${core.nested ? "nested" : "default"}"')
      expect(attrs).toEqual({
        string: {
          accept: {
            type: "mixed",
            value: 'media/${core.nested ? "nested" : "default"}',
          },
        },
      })
    })

    it("с пустыми значениями", () => {
      const attrs = parseAttributes('accept="image/*, ${core.allowPdf ? ".pdf" : ""}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/*" },
            { type: "dynamic", value: '${core.allowPdf ? ".pdf" : ""}' },
          ],
        },
      })
    })

    it("сложное условное выражение как строка", () => {
      const attrs = parseAttributes(
        'accept="${core.type === "image" && core.quality === "high" ? "image/png,image/jpeg" : "image/*"}"'
      )
      expect(attrs).toEqual({
        string: {
          accept: {
            type: "dynamic",
            value: '${core.type === "image" && core.quality === "high" ? "image/png,image/jpeg" : "image/*"}',
          },
        },
      })
    })

    it("выражение с вложенными условиями", () => {
      const attrs = parseAttributes(
        'accept="${core.allowImages ? (core.highQuality ? "image/png,image/jpeg" : "image/*") : "text/*"}"'
      )
      expect(attrs).toEqual({
        string: {
          accept: {
            type: "dynamic",
            value: '${core.allowImages ? (core.highQuality ? "image/png,image/jpeg" : "image/*") : "text/*"}',
          },
        },
      })
    })

    it("массив с тремя типами значений", () => {
      const attrs = parseAttributes('accept="image/*, ${core.videoType}, video-${core.format}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/*" },
            { type: "dynamic", value: "${core.videoType}" },
            { type: "mixed", value: "video-${core.format}" },
          ],
        },
      })
    })

    it("массив с четырьмя типами значений", () => {
      const attrs = parseAttributes('accept="image/*, ${core.videoType}, video-${core.format}, .${core.ext}"')
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/*" },
            { type: "dynamic", value: "${core.videoType}" },
            { type: "mixed", value: "video-${core.format}" },
            { type: "mixed", value: ".${core.ext}" },
          ],
        },
      })
    })

    it("массив с условными значениями", () => {
      const attrs = parseAttributes(
        'accept="image/*, ${core.allowPdf ? ".pdf" : ""}, ${core.allowDoc ? ".doc" : ""}, ${core.allowTxt ? ".txt" : ""}"'
      )
      expect(attrs).toEqual({
        array: {
          accept: [
            { type: "static", value: "image/*" },
            { type: "dynamic", value: '${core.allowPdf ? ".pdf" : ""}' },
            { type: "dynamic", value: '${core.allowDoc ? ".doc" : ""}' },
            { type: "dynamic", value: '${core.allowTxt ? ".txt" : ""}' },
          ],
        },
      })
    })
  })
})
