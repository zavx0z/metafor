import { describe, it, expect } from "bun:test"
import { parseAttributes } from ".."

describe("allow", () => {
  describe("статические значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('allow="camera"')
      expect(attrs).toEqual({
        string: { allow: { type: "static", value: "camera" } },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes("allow=camera")
      expect(attrs).toEqual({
        string: { allow: { type: "static", value: "camera" } },
      })
    })
    it("одно значение с точкой с запятой внутри", () => {
      const attrs = parseAttributes('allow="camera;microphone"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "static", value: "microphone" },
          ],
        },
      })
    })
    it("одно значение с пробелами и точками с запятой", () => {
      const attrs = parseAttributes('allow="camera; microphone"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "static", value: "microphone" },
          ],
        },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes('allow="camera; microphone; geolocation"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "static", value: "microphone" },
            { type: "static", value: "geolocation" },
          ],
        },
      })
    })
    it("несколько с разными разрешениями", () => {
      const attrs = parseAttributes('allow="camera; microphone; geolocation; payment"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "static", value: "microphone" },
            { type: "static", value: "geolocation" },
            { type: "static", value: "payment" },
          ],
        },
      })
    })
    it("несколько с пробелами", () => {
      const attrs = parseAttributes('allow="camera ; microphone ; geolocation"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "static", value: "microphone" },
            { type: "static", value: "geolocation" },
          ],
        },
      })
    })
  })

  describe("динамические значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('allow="${core.permission}"')
      expect(attrs).toEqual({
        string: { allow: { type: "dynamic", value: "${core.permission}" } },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes("allow=${core.permission}")
      expect(attrs).toEqual({
        string: { allow: { type: "dynamic", value: "${core.permission}" } },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes('allow="${core.permission}; ${core.permission}"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "dynamic", value: "${core.permission}" },
            { type: "dynamic", value: "${core.permission}" },
          ],
        },
      })
    })

    it("с операторами сравнения", () => {
      const attrs = parseAttributes('allow="${core.type === "media" ? "camera;microphone" : "geolocation"}"')
      expect(attrs).toEqual({
        string: {
          allow: {
            type: "dynamic",
            value: '${core.type === "media" ? "camera;microphone" : "geolocation"}',
          },
        },
      })
    })

    it("с логическими операторами", () => {
      const attrs = parseAttributes(
        'allow="${core.allowCamera && core.allowMic ? "camera;microphone" : "geolocation"}"'
      )
      expect(attrs).toEqual({
        string: {
          allow: {
            type: "dynamic",
            value: '${core.allowCamera && core.allowMic ? "camera;microphone" : "geolocation"}',
          },
        },
      })
    })

    it("с оператором ИЛИ", () => {
      const attrs = parseAttributes(
        'allow="${core.allowCamera || core.allowMic ? "camera;microphone" : "geolocation"}"'
      )
      expect(attrs).toEqual({
        string: {
          allow: {
            type: "dynamic",
            value: '${core.allowCamera || core.allowMic ? "camera;microphone" : "geolocation"}',
          },
        },
      })
    })

    it("с оператором НЕ", () => {
      const attrs = parseAttributes('allow="${!core.restricted ? "camera;microphone" : "geolocation"}"')
      expect(attrs).toEqual({
        string: {
          allow: {
            type: "dynamic",
            value: '${!core.restricted ? "camera;microphone" : "geolocation"}',
          },
        },
      })
    })

    it("сложное выражение с точками с запятой", () => {
      const attrs = parseAttributes('allow="${core.type === "media" ? "camera;microphone" : "geolocation"}"')
      expect(attrs).toEqual({
        string: {
          allow: {
            type: "dynamic",
            value: '${core.type === "media" ? "camera;microphone" : "geolocation"}',
          },
        },
      })
    })

    it("выражение с множественными условиями", () => {
      const attrs = parseAttributes(
        'allow="${core.allowCamera && core.allowMic ? "camera;microphone;geolocation" : "geolocation"}"'
      )
      expect(attrs).toEqual({
        string: {
          allow: {
            type: "dynamic",
            value: '${core.allowCamera && core.allowMic ? "camera;microphone;geolocation" : "geolocation"}',
          },
        },
      })
    })

    it("несколько динамических значений", () => {
      const attrs = parseAttributes('allow="${core.permission1}; ${core.permission2}; ${core.permission3}"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "dynamic", value: "${core.permission1}" },
            { type: "dynamic", value: "${core.permission2}" },
            { type: "dynamic", value: "${core.permission3}" },
          ],
        },
      })
    })

    it("динамические значения с пробелами", () => {
      const attrs = parseAttributes('allow="${core.perm1} ; ${core.perm2} ; ${core.perm3}"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "dynamic", value: "${core.perm1}" },
            { type: "dynamic", value: "${core.perm2}" },
            { type: "dynamic", value: "${core.perm3}" },
          ],
        },
      })
    })
  })

  describe("смешанные значения", () => {
    it("одно", () => {
      const attrs = parseAttributes('allow="camera; ${core.permission}"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "dynamic", value: "${core.permission}" },
          ],
        },
      })
    })

    it("несколько", () => {
      const attrs = parseAttributes('allow="camera; ${core.permission}; geolocation"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "dynamic", value: "${core.permission}" },
            { type: "static", value: "geolocation" },
          ],
        },
      })
    })

    it("с операторами сравнения в смешанном значении", () => {
      const attrs = parseAttributes('allow="permission-${core.type === "admin" ? "all" : "basic"}"')
      expect(attrs).toEqual({
        string: {
          allow: {
            type: "mixed",
            value: 'permission-${core.type === "admin" ? "all" : "basic"}',
          },
        },
      })
    })

    it("с логическими операторами в смешанном значении", () => {
      const attrs = parseAttributes('allow="access-${core.allowCamera && core.allowMic ? "media" : "basic"}"')
      expect(attrs).toEqual({
        string: { allow: { type: "mixed", value: 'access-${core.allowCamera && core.allowMic ? "media" : "basic"}' } },
      })
    })

    it("смешанное значение с точками с запятой", () => {
      const attrs = parseAttributes('allow="perm-${core.type === "media" ? "camera;microphone" : "geolocation"}"')
      expect(attrs).toEqual({
        string: {
          allow: { type: "mixed", value: 'perm-${core.type === "media" ? "camera;microphone" : "geolocation"}' },
        },
      })
    })

    it("несколько смешанных значений", () => {
      const attrs = parseAttributes('allow="media-${core.type}; access-${core.level}; perm-${core.role}"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "mixed", value: "media-${core.type}" },
            { type: "mixed", value: "access-${core.level}" },
            { type: "mixed", value: "perm-${core.role}" },
          ],
        },
      })
    })

    it("смешанные значения с пробелами", () => {
      const attrs = parseAttributes('allow="media-${core.type} ; access-${core.level} ; perm-${core.role}"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "mixed", value: "media-${core.type}" },
            { type: "mixed", value: "access-${core.level}" },
            { type: "mixed", value: "perm-${core.role}" },
          ],
        },
      })
    })
  })

  describe("различные варианты", () => {
    it("с условными разрешениями", () => {
      const attrs = parseAttributes(
        'allow="camera; ${core.allowMic ? "microphone" : ""}; ${core.allowGeo ? "geolocation" : ""}"'
      )
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "dynamic", value: '${core.allowMic ? "microphone" : ""}' },
            { type: "dynamic", value: '${core.allowGeo ? "geolocation" : ""}' },
          ],
        },
      })
    })

    it("с вложенными выражениями", () => {
      const attrs = parseAttributes('allow="permission/${core.nested ? "nested" : "default"}"')
      expect(attrs).toEqual({
        string: { allow: { type: "mixed", value: 'permission/${core.nested ? "nested" : "default"}' } },
      })
    })

    it("с пустыми значениями", () => {
      const attrs = parseAttributes('allow="camera; ${core.allowMic ? "microphone" : ""}"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "dynamic", value: '${core.allowMic ? "microphone" : ""}' },
          ],
        },
      })
    })

    it("сложное условное выражение как строка", () => {
      const attrs = parseAttributes(
        'allow="${core.type === "media" && core.secure ? "camera;microphone" : "geolocation"}"'
      )
      expect(attrs).toEqual({
        string: {
          allow: {
            type: "dynamic",
            value: '${core.type === "media" && core.secure ? "camera;microphone" : "geolocation"}',
          },
        },
      })
    })

    it("выражение с вложенными условиями", () => {
      const attrs = parseAttributes(
        'allow="${core.allowMedia ? (core.secure ? "camera;microphone" : "camera") : "geolocation"}"'
      )
      expect(attrs).toEqual({
        string: {
          allow: {
            type: "dynamic",
            value: '${core.allowMedia ? (core.secure ? "camera;microphone" : "camera") : "geolocation"}',
          },
        },
      })
    })

    it("массив с тремя типами значений", () => {
      const attrs = parseAttributes('allow="camera; ${core.mediaType}; access-${core.level}"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "dynamic", value: "${core.mediaType}" },
            { type: "mixed", value: "access-${core.level}" },
          ],
        },
      })
    })

    it("массив с четырьмя типами значений", () => {
      const attrs = parseAttributes('allow="camera; ${core.mediaType}; access-${core.level}; perm-${core.role}"')
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "dynamic", value: "${core.mediaType}" },
            { type: "mixed", value: "access-${core.level}" },
            { type: "mixed", value: "perm-${core.role}" },
          ],
        },
      })
    })

    it("массив с условными значениями", () => {
      const attrs = parseAttributes(
        'allow="camera; ${core.allowMic ? "microphone" : ""}; ${core.allowGeo ? "geolocation" : ""}; ${core.allowPay ? "payment" : ""}"'
      )
      expect(attrs).toEqual({
        array: {
          allow: [
            { type: "static", value: "camera" },
            { type: "dynamic", value: '${core.allowMic ? "microphone" : ""}' },
            { type: "dynamic", value: '${core.allowGeo ? "geolocation" : ""}' },
            { type: "dynamic", value: '${core.allowPay ? "payment" : ""}' },
          ],
        },
      })
    })
  })
})
