import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../index.ts"

describe("class", () => {
  describe("статические значения", () => {
    it("class в элементе с одним статическим значением", () => {
      const attrs = parseAttributes('class="div-active"')
      expect(attrs).toEqual({
        string: {
          class: { type: "static", value: "div-active" },
        },
      })
    })

    it("class в элементе с одним статическим значением без кавычек", () => {
      const attrs = parseAttributes("class=div-active")
      expect(attrs).toEqual({
        string: {
          class: { type: "static", value: "div-active" },
        },
      })
    })
    it("class в элементе с несколькими статическими значениями", () => {
      const attrs = parseAttributes('class="div-active div-inactive"')
      expect(attrs).toEqual({
        array: {
          class: [
            { type: "static", value: "div-active" },
            { type: "static", value: "div-inactive" },
          ],
        },
      })
    })
  })

  describe("динамические значения", () => {
    it("class в элементе с одним динамическим значением", () => {
      const attrs = parseAttributes('class="${core.active ? "active" : "inactive"}')
      expect(attrs).toEqual({
        string: {
          class: {
            type: "dynamic",
            value: '${core.active ? "active" : "inactive"}',
          },
        },
      })
    })

    it("class в элементе с одним динамическим значением без кавычек", () => {
      const attrs = parseAttributes('class=${core.active ? "active" : "inactive"}')
      expect(attrs).toEqual({
        string: {
          class: {
            type: "dynamic",
            value: '${core.active ? "active" : "inactive"}',
          },
        },
      })
    })

    it("class в элементе с несколькими динамическими значениями", () => {
      const attrs = parseAttributes(
        'class="${core.active ? "active" : "inactive"} ${core.active ? "active" : "inactive"}'
      )
      expect(attrs).toEqual({
        array: {
          class: [
            { type: "dynamic", value: '${core.active ? "active" : "inactive"}' },
            { type: "dynamic", value: '${core.active ? "active" : "inactive"}' },
          ],
        },
      })
    })

    it("class в элементе с операторами сравнения", () => {
      const attrs = parseAttributes('class="${core.count > 5 ? "large" : "small"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${core.count > 5 ? "large" : "small"}' },
        },
      })
    })

    it("class в элементе с операторами равенства", () => {
      const attrs = parseAttributes('class="${core.status === "loading" ? "loading" : "ready"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${core.status === "loading" ? "loading" : "ready"}' },
        },
      })
    })

    it("class в элементе с логическими операторами", () => {
      const attrs = parseAttributes('class="${core.active && core.visible ? "show" : "hide"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${core.active && core.visible ? "show" : "hide"}' },
        },
      })
    })

    it("class в элементе с оператором ИЛИ", () => {
      const attrs = parseAttributes('class="${core.error || core.warning ? "alert" : "normal"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${core.error || core.warning ? "alert" : "normal"}' },
        },
      })
    })

    it("class в элементе с оператором НЕ", () => {
      const attrs = parseAttributes('class="${!core.disabled ? "enabled" : "disabled"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${!core.disabled ? "enabled" : "disabled"}' },
        },
      })
    })

    it("class в элементе с оператором И &&", () => {
      const attrs = parseAttributes('class="${core.active && "active"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${core.active && "active"}' },
        },
      })
    })

    it("class в элементе с операторами сравнения", () => {
      const attrs = parseAttributes('class="${core.value >= 10 ? "high" : "low"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${core.value >= 10 ? "high" : "low"}' },
        },
      })
    })

    it("class в элементе с оператором неравенства", () => {
      const attrs = parseAttributes('class="${core.type !== "admin" ? "user" : "admin"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${core.type !== "admin" ? "user" : "admin"}' },
        },
      })
    })

    it("class в элементе с оператором меньше или равно", () => {
      const attrs = parseAttributes('class="${core.age <= 18 ? "minor" : "adult"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${core.age <= 18 ? "minor" : "adult"}' },
        },
      })
    })

    it("class в элементе с оператором меньше", () => {
      const attrs = parseAttributes('class="${core.score < 50 ? "fail" : "pass"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "dynamic", value: '${core.score < 50 ? "fail" : "pass"}' },
        },
      })
    })
  })

  describe("смешанные значения", () => {
    it("class в элементе с одним смешанным значением", () => {
      const attrs = parseAttributes('class="div-${core.active ? "active" : "inactive"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'div-${core.active ? "active" : "inactive"}' },
        },
      })
    })

    it("class в элементе с одним смешанным значением без кавычек", () => {
      const attrs = parseAttributes('class=div-${core.active ? "active" : "inactive"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'div-${core.active ? "active" : "inactive"}' },
        },
      })
    })

    it("class в элементе с несколькими смешанными значениями", () => {
      const attrs = parseAttributes(
        'class="div-${core.active ? "active" : "inactive"} div-${core.active ? "active" : "inactive"}'
      )
      expect(attrs).toEqual({
        array: {
          class: [
            { type: "mixed", value: 'div-${core.active ? "active" : "inactive"}' },
            { type: "mixed", value: 'div-${core.active ? "active" : "inactive"}' },
          ],
        },
      })
    })

    it("class в элементе с операторами сравнения в смешанном значении", () => {
      const attrs = parseAttributes('class="size-${core.count > 5 ? "large" : "small"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'size-${core.count > 5 ? "large" : "small"}' },
        },
      })
    })

    it("class в элементе с операторами равенства в смешанном значении", () => {
      const attrs = parseAttributes('class="status-${core.status === "loading" ? "loading" : "ready"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'status-${core.status === "loading" ? "loading" : "ready"}' },
        },
      })
    })

    it("class в элементе с логическими операторами в смешанном значении", () => {
      const attrs = parseAttributes('class="visibility-${core.active && core.visible ? "show" : "hide"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'visibility-${core.active && core.visible ? "show" : "hide"}' },
        },
      })
    })

    it("class в элементе с оператором ИЛИ в смешанном значении", () => {
      const attrs = parseAttributes('class="alert-${core.error || core.warning ? "alert" : "normal"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'alert-${core.error || core.warning ? "alert" : "normal"}' },
        },
      })
    })

    it("class в элементе с оператором НЕ в смешанном значении", () => {
      const attrs = parseAttributes('class="state-${!core.disabled ? "enabled" : "disabled"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'state-${!core.disabled ? "enabled" : "disabled"}' },
        },
      })
    })

    it("class в элементе с оператором больше или равно в смешанном значении", () => {
      const attrs = parseAttributes('class="level-${core.value >= 10 ? "high" : "low"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'level-${core.value >= 10 ? "high" : "low"}' },
        },
      })
    })

    it("class в элементе с оператором неравенства в смешанном значении", () => {
      const attrs = parseAttributes('class="role-${core.type !== "admin" ? "user" : "admin"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'role-${core.type !== "admin" ? "user" : "admin"}' },
        },
      })
    })

    it("class в элементе с оператором меньше или равно в смешанном значении", () => {
      const attrs = parseAttributes('class="age-${core.age <= 18 ? "minor" : "adult"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'age-${core.age <= 18 ? "minor" : "adult"}' },
        },
      })
    })

    it("class в элементе с оператором меньше в смешанном значении", () => {
      const attrs = parseAttributes('class="result-${core.score < 50 ? "fail" : "pass"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'result-${core.score < 50 ? "fail" : "pass"}' },
        },
      })
    })

    it("class в элементе с множественными операторами в смешанном значении", () => {
      const attrs = parseAttributes(
        'class="complex-${core.active && core.count > 5 || core.admin ? "special" : "regular"}'
      )
      expect(attrs).toEqual({
        string: {
          class: {
            type: "mixed",
            value: 'complex-${core.active && core.count > 5 || core.admin ? "special" : "regular"}',
          },
        },
      })
    })

    it("class в элементе с оператором И && в смешанном значении", () => {
      const attrs = parseAttributes('class="element${context.active && "-active"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'element${context.active && "-active"}' },
        },
      })
    })
  })

  describe("различные варианты", () => {
    it("class в элементе с смешанным и статическим значениями", () => {
      const attrs = parseAttributes('class="div-${core.active ? "active" : "inactive"} visible')
      expect(attrs).toEqual({
        array: {
          class: [
            {
              type: "mixed",
              value: 'div-${core.active ? "active" : "inactive"}',
            },
            {
              type: "static",
              value: "visible",
            },
          ],
        },
      })
    })

    it("class в элементе с динамическим и статическим значениями", () => {
      const attrs = parseAttributes('class="${core.active ? "active" : "inactive"} visible')
      expect(attrs).toEqual({
        array: {
          class: [
            {
              type: "dynamic",
              value: '${core.active ? "active" : "inactive"}',
            },
            {
              type: "static",
              value: "visible",
            },
          ],
        },
      })
    })

    it("class в элементе с тремя различными типами значений", () => {
      const attrs = parseAttributes('class="static-value ${core.active ? "active" : "inactive"} mixed-${core.type}')
      expect(attrs).toEqual({
        array: {
          class: [
            {
              type: "static",
              value: "static-value",
            },
            {
              type: "dynamic",
              value: '${core.active ? "active" : "inactive"}',
            },
            {
              type: "mixed",
              value: "mixed-${core.type}",
            },
          ],
        },
      })
    })

    it("class в элементе с несколькими смешанными значениями", () => {
      const attrs = parseAttributes('class="btn-${core.variant} text-${core.size} bg-${core.theme}')
      expect(attrs).toEqual({
        array: {
          class: [
            {
              type: "mixed",
              value: "btn-${core.variant}",
            },
            {
              type: "mixed",
              value: "text-${core.size}",
            },
            {
              type: "mixed",
              value: "bg-${core.theme}",
            },
          ],
        },
      })
    })

    it("class в элементе с условными классами", () => {
      const attrs = parseAttributes(
        'class="base-class ${core.active ? "active" : "inactive"} ${core.disabled ? "disabled" : ""}'
      )
      expect(attrs).toEqual({
        array: {
          class: [
            {
              type: "static",
              value: "base-class",
            },
            {
              type: "dynamic",
              value: '${core.active ? "active" : "inactive"}',
            },
            {
              type: "dynamic",
              value: '${core.disabled ? "disabled" : ""}',
            },
          ],
        },
      })
    })

    it("class в элементе с вложенными выражениями", () => {
      const attrs = parseAttributes('class="container ${core.nested ? "nested" : "default"}')
      expect(attrs).toEqual({
        array: {
          class: [
            {
              type: "static",
              value: "container",
            },
            {
              type: "dynamic",
              value: '${core.nested ? "nested" : "default"}',
            },
          ],
        },
      })
    })

    it("class в элементе с пустыми значениями", () => {
      const attrs = parseAttributes('class="visible ${core.hidden ? "" : "show"} ${core.active ? "active" : ""}')
      expect(attrs).toEqual({
        array: {
          class: [
            {
              type: "static",
              value: "visible",
            },
            {
              type: "dynamic",
              value: '${core.hidden ? "" : "show"}',
            },
            {
              type: "dynamic",
              value: '${core.active ? "active" : ""}',
            },
          ],
        },
      })
    })

    it("class в элементе с атрибутом без кавычек", () => {
      const attrs = parseAttributes('class=static-value-${core.active ? "active" : "inactive"}')
      expect(attrs).toEqual({
        string: {
          class: { type: "mixed", value: 'static-value-${core.active ? "active" : "inactive"}' },
        },
      })
    })
  })
})
