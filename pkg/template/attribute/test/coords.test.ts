import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../index.ts"

describe.each([
  ["rect", 'shape="rect"'],
  ["poly", 'shape="poly"'],
  ["circle", 'shape="circle"'],
  ["default", 'shape="default"'],
])("coords для %s", (shape, tag) => {
  describe("статические значения", () => {
    it("одно значение", () => {
      const attrs = parseAttributes(tag + ' coords="100"')
      expect(attrs).toEqual({
        string: {
          coords: { type: "static", value: "100" },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("одно значение без кавычек", () => {
      const attrs = parseAttributes(tag + " coords=100")
      expect(attrs).toEqual({
        string: {
          coords: { type: "static", value: "100" },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("простые числа через запятую", () => {
      const attrs = parseAttributes(tag + ' coords="34,44,270,350"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "34" },
            { type: "static", value: "44" },
            { type: "static", value: "270" },
            { type: "static", value: "350" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
    it("несколько чисел с пробелами", () => {
      const attrs = parseAttributes(tag + ' coords="10 , 20 , 30 , 40"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "10" },
            { type: "static", value: "20" },
            { type: "static", value: "30" },
            { type: "static", value: "40" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
    it("разные типы координат", () => {
      const attrs = parseAttributes(tag + ' coords="0,0,100,100,50,50"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "0" },
            { type: "static", value: "0" },
            { type: "static", value: "100" },
            { type: "static", value: "100" },
            { type: "static", value: "50" },
            { type: "static", value: "50" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
  })

  describe("динамические значения", () => {
    it("одно", () => {
      const attrs = parseAttributes(tag + ' coords="${core.x}"')
      expect(attrs).toEqual({
        string: {
          coords: { type: "dynamic", value: "${core.x}" },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("одно без кавычек", () => {
      const attrs = parseAttributes(tag + " coords=${core.x}")
      expect(attrs).toEqual({
        string: {
          coords: { type: "dynamic", value: "${core.x}" },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes(tag + ' coords="${core.x}, ${core.y}, ${core.width}, ${core.height}"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "dynamic", value: "${core.x}" },
            { type: "dynamic", value: "${core.y}" },
            { type: "dynamic", value: "${core.width}" },
            { type: "dynamic", value: "${core.height}" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
    it("с операторами сравнения", () => {
      const attrs = parseAttributes(tag + ' coords="${core.type === "large" ? "0,0,200,200" : "0,0,100,100"}"')
      expect(attrs).toEqual({
        string: {
          coords: {
            type: "dynamic",
            value: '${core.type === "large" ? "0,0,200,200" : "0,0,100,100"}',
          },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("с логическими операторами", () => {
      const attrs = parseAttributes(tag + ' coords="${core.visible && core.active ? "10,10,90,90" : "0,0,50,50"}"')
      expect(attrs).toEqual({
        string: {
          coords: {
            type: "dynamic",
            value: '${core.visible && core.active ? "10,10,90,90" : "0,0,50,50"}',
          },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("с оператором ИЛИ", () => {
      const attrs = parseAttributes(
        tag + ' coords="${core.fullscreen || core.expanded ? "0,0,300,300" : "0,0,100,100"}"'
      )
      expect(attrs).toEqual({
        string: {
          coords: {
            type: "dynamic",
            value: '${core.fullscreen || core.expanded ? "0,0,300,300" : "0,0,100,100"}',
          },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("с оператором НЕ", () => {
      const attrs = parseAttributes(tag + ' coords="${!core.hidden ? "10,10,110,110" : "0,0,0,0"}"')
      expect(attrs).toEqual({
        string: {
          coords: {
            type: "dynamic",
            value: '${!core.hidden ? "10,10,110,110" : "0,0,0,0"}',
          },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("динамические значения с пробелами", () => {
      const attrs = parseAttributes(tag + ' coords="${core.x} , ${core.y} , ${core.z}"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "dynamic", value: "${core.x}" },
            { type: "dynamic", value: "${core.y}" },
            { type: "dynamic", value: "${core.z}" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
  })

  describe("смешанные значения", () => {
    it("одно", () => {
      const attrs = parseAttributes(tag + ' coords="10, ${core.y}"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "10" },
            { type: "dynamic", value: "${core.y}" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
    it("несколько", () => {
      const attrs = parseAttributes(tag + ' coords="10, ${core.y}, 30, ${core.height}"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "10" },
            { type: "dynamic", value: "${core.y}" },
            { type: "static", value: "30" },
            { type: "dynamic", value: "${core.height}" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
    it("с операторами сравнения в смешанном значении", () => {
      const attrs = parseAttributes(tag + ' coords="pos-${core.type === "center" ? "50" : "0"}"')
      expect(attrs).toEqual({
        string: {
          coords: { type: "mixed", value: 'pos-${core.type === "center" ? "50" : "0"}' },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("с логическими операторами в смешанном значении", () => {
      const attrs = parseAttributes(tag + ' coords="offset-${core.visible && core.active ? "10" : "0"}"')
      expect(attrs).toEqual({
        string: {
          coords: { type: "mixed", value: 'offset-${core.visible && core.active ? "10" : "0"}' },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("смешанные значения с пробелами", () => {
      const attrs = parseAttributes(tag + ' coords="10 , ${core.y} , 30 , ${core.height}"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "10" },
            { type: "dynamic", value: "${core.y}" },
            { type: "static", value: "30" },
            { type: "dynamic", value: "${core.height}" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
  })

  describe("различные варианты", () => {
    it("с условными координатами", () => {
      const attrs = parseAttributes(
        tag + ' coords="0, 0, ${core.width ? core.width : "100"}, ${core.height ? core.height : "100"}"'
      )
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "0" },
            { type: "static", value: "0" },
            { type: "dynamic", value: '${core.width ? core.width : "100"}' },
            { type: "dynamic", value: '${core.height ? core.height : "100"}' },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
    it("с вложенными выражениями", () => {
      const attrs = parseAttributes(tag + ' coords="pos-${core.nested ? "nested" : "default"}"')
      expect(attrs).toEqual({
        string: {
          coords: { type: "mixed", value: 'pos-${core.nested ? "nested" : "default"}' },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("с пустыми значениями", () => {
      const attrs = parseAttributes(tag + ' coords="0, 0, ${core.width ? core.width : ""}"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "0" },
            { type: "static", value: "0" },
            { type: "dynamic", value: '${core.width ? core.width : ""}' },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
    it("сложное условное выражение как строка", () => {
      const attrs = parseAttributes(
        tag + ' coords="${core.type === "large" && core.visible ? "0,0,300,300" : "0,0,100,100"}"'
      )
      expect(attrs).toEqual({
        string: {
          coords: {
            type: "dynamic",
            value: '${core.type === "large" && core.visible ? "0,0,300,300" : "0,0,100,100"}',
          },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("выражение с вложенными условиями", () => {
      const attrs = parseAttributes(
        tag + ' coords="${core.visible ? (core.fullscreen ? "0,0,400,400" : "0,0,200,200") : "0,0,0,0"}"'
      )
      expect(attrs).toEqual({
        string: {
          coords: {
            type: "dynamic",
            value: '${core.visible ? (core.fullscreen ? "0,0,400,400" : "0,0,200,200") : "0,0,0,0"}',
          },
          shape: { type: "static", value: shape },
        },
      })
    })
    it("массив с тремя типами значений", () => {
      const attrs = parseAttributes(tag + ' coords="10, ${core.y}, pos-${core.offset}"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "10" },
            { type: "dynamic", value: "${core.y}" },
            { type: "mixed", value: "pos-${core.offset}" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
    it("массив с четырьмя типами значений", () => {
      const attrs = parseAttributes(tag + ' coords="10, ${core.y}, pos-${core.offset}, ${core.final}"')
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "10" },
            { type: "dynamic", value: "${core.y}" },
            { type: "mixed", value: "pos-${core.offset}" },
            { type: "dynamic", value: "${core.final}" },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
    it("массив с условными значениями", () => {
      const attrs = parseAttributes(
        tag + ' coords="0, 0, ${core.width ? core.width : ""}, ${core.height ? core.height : ""}"'
      )
      expect(attrs).toEqual({
        array: {
          coords: [
            { type: "static", value: "0" },
            { type: "static", value: "0" },
            { type: "dynamic", value: '${core.width ? core.width : ""}' },
            { type: "dynamic", value: '${core.height ? core.height : ""}' },
          ],
        },
        string: {
          shape: { type: "static", value: shape },
        },
      })
    })
  })
})
