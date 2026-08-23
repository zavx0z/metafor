import { describe, it, expect } from "bun:test"
import { parseAttributes } from "../index.ts"

describe("стили в виде JavaScript объекта (styled components)", () => {
  describe("простые объекты стилей", () => {
    it("простой объект стилей", () => {
      const attrs = parseAttributes('style=${{backgroundColor: "red", color: "white"}}')
      expect(attrs).toEqual({
        style: '{ backgroundColor: "red", color: "white" }',
      })
    })

    it("объект с числовыми значениями", () => {
      const attrs = parseAttributes("style=${{width: 100, height: 200, fontSize: 16}}")
      expect(attrs).toEqual({
        style: "{ width: 100, height: 200, fontSize: 16 }",
      })
    })

    it("объект с единицами измерения", () => {
      const attrs = parseAttributes('style=${{width: "100px", height: "200px", margin: "10px 20px"}}')
      expect(attrs).toEqual({
        style: '{ width: "100px", height: "200px", margin: "10px 20px" }',
      })
    })
  })

  describe("динамические объекты стилей", () => {
    it("объект с переменными", () => {
      const attrs = parseAttributes("style=${{backgroundColor: theme.primary, color: theme.text}}")
      expect(attrs).toEqual({
        style: "{ backgroundColor: theme.primary, color: theme.text }",
      })
    })

    it("объект с условными стилями", () => {
      const attrs = parseAttributes('style=${{backgroundColor: isActive ? "green" : "red", color: "white"}}')
      expect(attrs).toEqual({
        style: '{ backgroundColor: isActive ? "green" : "red", color: "white" }',
      })
    })

    it("объект с вычисляемыми значениями", () => {
      const attrs = parseAttributes("style=${{width: `${100 + 50}px`, height: `${200 * 2}px`}}")
      expect(attrs).toEqual({
        style: "{ width: `${100 + 50}px`, height: `${200 * 2}px` }",
      })
    })
  })

  describe("сложные объекты стилей", () => {
    it("объект с вложенными свойствами", () => {
      const attrs = parseAttributes(
        'style=${{backgroundColor: "blue", border: { width: "2px", style: "solid", color: "black" }}}'
      )
      expect(attrs).toEqual({
        style: '{ backgroundColor: "blue", border: { width: "2px", style: "solid", color: "black" } }',
      })
    })

    it("объект с функциями", () => {
      const attrs = parseAttributes("style=${{transform: `translateX(${getOffset()}px)`, opacity: getOpacity()}}")
      expect(attrs).toEqual({
        style: "{ transform: `translateX(${getOffset()}px)`, opacity: getOpacity() }",
      })
    })

    it("объект с множественными условиями", () => {
      const attrs = parseAttributes(
        'style=${{backgroundColor: isActive ? "green" : isDisabled ? "gray" : "blue", color: isActive ? "white" : "black", fontSize: isLarge ? "18px" : "14px"}}'
      )
      expect(attrs).toEqual({
        style:
          '{ backgroundColor: isActive ? "green" : isDisabled ? "gray" : "blue", color: isActive ? "white" : "black", fontSize: isLarge ? "18px" : "14px" }',
      })
    })
  })

  describe("стили с другими атрибутами", () => {
    it("стили с классом", () => {
      const attrs = parseAttributes('class="container" style=${{backgroundColor: "red", color: "white"}}')
      expect(attrs).toEqual({
        style: '{ backgroundColor: "red", color: "white" }',
        string: {
          class: { type: "static", value: "container" },
        },
      })
    })

    it("стили с событиями", () => {
      const attrs = parseAttributes('style=${{backgroundColor: "blue"}} onclick="${(e) => handleClick(e)}"')
      expect(attrs).toEqual({
        style: '{ backgroundColor: "blue" }',
        event: {
          onclick: "(e) => handleClick(e)",
        },
      })
    })

    it("стили с булевыми атрибутами", () => {
      const attrs = parseAttributes('style=${{backgroundColor: "green"}} disabled=${isLoading}')
      expect(attrs).toEqual({
        style: '{ backgroundColor: "green" }',
        boolean: {
          disabled: { type: "dynamic", value: "isLoading" },
        },
      })
    })
  })

  describe("граничные случаи", () => {
    it("пустой объект стилей", () => {
      const attrs = parseAttributes("style=${{}}")
      expect(attrs).toEqual({
        style: "{}",
      })
    })

    it("объект с одним свойством", () => {
      const attrs = parseAttributes('style=${{color: "red"}}')
      expect(attrs).toEqual({
        style: '{ color: "red" }',
      })
    })

    it("объект с template literals", () => {
      const attrs = parseAttributes("style=${{backgroundImage: `url(${imageUrl})`, color: `#${colorHex}`}}")
      expect(attrs).toEqual({
        style: "{ backgroundImage: `url(${imageUrl})`, color: `#${colorHex}` }",
      })
    })
  })

  describe("различные элементы", () => {
    it("стили для button", () => {
      const attrs = parseAttributes('style=${{backgroundColor: "blue", color: "white", padding: "10px"}}')
      expect(attrs).toEqual({
        style: '{ backgroundColor: "blue", color: "white", padding: "10px" }',
      })
    })

    it("стили для input", () => {
      const attrs = parseAttributes('style=${{border: "1px solid gray", borderRadius: "4px", padding: "8px"}}')
      expect(attrs).toEqual({
        style: '{ border: "1px solid gray", borderRadius: "4px", padding: "8px" }',
      })
    })

    it("стили для img", () => {
      const attrs = parseAttributes('style=${{width: "100px", height: "100px", objectFit: "cover"}}')
      expect(attrs).toEqual({
        style: '{ width: "100px", height: "100px", objectFit: "cover" }',
      })
    })

    it("стили для span", () => {
      const attrs = parseAttributes('style=${{fontSize: "14px", fontWeight: "bold", color: "red"}}')
      expect(attrs).toEqual({
        style: '{ fontSize: "14px", fontWeight: "bold", color: "red" }',
      })
    })
  })
})
