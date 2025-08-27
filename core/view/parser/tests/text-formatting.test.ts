import { describe, it, expect } from "bun:test"
import { extractMainHtmlBlock, extractHtmlElements } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"

describe("text-formatting", () => {
  describe("форматирует текст по стандартам HTML (схлопывание пробельных символов)", () => {
    const mainHtml = extractMainHtmlBlock<any, { name: string; title: string }>(
      ({ html, context }) => html`
        <div>
          <p>Hello World</p>
          <span> ${context.name} - ${context.title} </span>
          <div>Welcome to our site!</div>
          <p>${context.name} is ${context.title}</p>
        </div>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    const data = enrichWithData(hierarchy)

    it("p1 element tag", () => {
      const divElement = data[0] as any
      const p1Element = divElement?.child?.[0] as any
      expect(p1Element).toHaveProperty("tag", "p")
    })

    it("p1 text type", () => {
      const divElement = data[0] as any
      const p1Element = divElement?.child?.[0] as any
      const p1Text = p1Element?.child?.[0] as any
      expect(p1Text).toHaveProperty("type", "text")
    })

    it("p1 text value", () => {
      const divElement = data[0] as any
      const p1Element = divElement?.child?.[0] as any
      const p1Text = p1Element?.child?.[0] as any
      expect(p1Text?.value).toBe("Hello World")
    })

    it("span element tag", () => {
      const divElement = data[0] as any
      const spanElement = divElement?.child?.[1] as any
      expect(spanElement).toHaveProperty("tag", "span")
    })

    it("span text type", () => {
      const divElement = data[0] as any
      const spanElement = divElement?.child?.[1] as any
      const spanText = spanElement?.child?.[0] as any
      expect(spanText).toHaveProperty("type", "text")
    })

    it("span text expr", () => {
      const divElement = data[0] as any
      const spanElement = divElement?.child?.[1] as any
      const spanText = spanElement?.child?.[0] as any
      expect(spanText?.expr).toBe("${0} - ${1}")
    })

    it("div2 element tag", () => {
      const divElement = data[0] as any
      const divElement2 = divElement?.child?.[2] as any
      expect(divElement2).toHaveProperty("tag", "div")
    })

    it("div2 text type", () => {
      const divElement = data[0] as any
      const divElement2 = divElement?.child?.[2] as any
      const divText = divElement2?.child?.[0] as any
      expect(divText).toHaveProperty("type", "text")
    })

    it("div2 text value", () => {
      const divElement = data[0] as any
      const divElement2 = divElement?.child?.[2] as any
      const divText = divElement2?.child?.[0] as any
      expect(divText?.value).toBe("Welcome to our site!")
    })

    it("p2 element tag", () => {
      const divElement = data[0] as any
      const p2Element = divElement?.child?.[3] as any
      expect(p2Element).toHaveProperty("tag", "p")
    })

    it("p2 text type", () => {
      const divElement = data[0] as any
      const p2Element = divElement?.child?.[3] as any
      const p2Text = p2Element?.child?.[0] as any
      expect(p2Text).toHaveProperty("type", "text")
    })

    it("p2 text expr", () => {
      const divElement = data[0] as any
      const p2Element = divElement?.child?.[3] as any
      const p2Text = p2Element?.child?.[0] as any
      expect(p2Text?.expr).toBe("${0} is ${1}")
    })
  })
})
