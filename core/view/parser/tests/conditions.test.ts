import { describe, it, expect } from "bun:test"
import { extractHtmlElements, extractMainHtmlBlock } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"
import { extractAttributes } from "../attributes"

describe("conditions", () => {
  describe("тернарник с внутренними тегами", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html, context }) => html`<div>${context.cond ? html`<em>A</em>` : html`<span>b</span>`}</div>`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<div>", index: 0, name: "div", kind: "open" },
        { text: "<em>", index: 27, name: "em", kind: "open" },
        { text: "A", index: 31, name: "", kind: "text" },
        { text: "</em>", index: 32, name: "em", kind: "close" },
        { text: "<span>", index: 46, name: "span", kind: "open" },
        { text: "b", index: 52, name: "", kind: "text" },
        { text: "</span>", index: 53, name: "span", kind: "close" },
        { text: "</div>", index: 62, name: "div", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              type: "cond",
              text: "context.cond",
              true: {
                tag: "em",
                type: "el",
                text: "<em>",
                child: [{ type: "text", text: "A" }],
              },
              false: {
                tag: "span",
                type: "el",
                text: "<span>",
                child: [{ type: "text", text: "b" }],
              },
            },
          ],
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: "/context/cond",
              true: {
                tag: "em",
                type: "el",
                child: [
                  {
                    type: "text",
                    value: "A",
                  },
                ],
              },
              false: {
                tag: "span",
                type: "el",
                child: [
                  {
                    type: "text",
                    value: "b",
                  },
                ],
              },
            },
          ],
        },
      ])
    })
  })

  describe("сравнение нескольких переменных", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html, context }) => html`<div>${context.cond && context.cond2 ? html`<em>A</em>` : html`<span>b</span>`}</div>`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<div>", index: 0, name: "div", kind: "open" },
        { text: "<em>", index: 44, name: "em", kind: "open" },
        { text: "A", index: 48, name: "", kind: "text" },
        { text: "</em>", index: 49, name: "em", kind: "close" },
        { text: "<span>", index: 63, name: "span", kind: "open" },
        { text: "b", index: 69, name: "", kind: "text" },
        { text: "</span>", index: 70, name: "span", kind: "close" },
        { text: "</div>", index: 79, name: "div", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              type: "cond",
              text: "context.cond && context.cond2",
              true: {
                tag: "em",
                type: "el",
                text: "<em>",
                child: [{ type: "text", text: "A" }],
              },
              false: {
                tag: "span",
                type: "el",
                text: "<span>",
                child: [{ type: "text", text: "b" }],
              },
            },
          ],
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: ["/context/cond", "/context/cond2"],
              expr: "${0} && ${1}",
              true: {
                tag: "em",
                type: "el",
                child: [{ type: "text", value: "A" }],
              },
              false: {
                tag: "span",
                type: "el",
                child: [{ type: "text", value: "b" }],
              },
            },
          ],
        },
      ])
    })
  })

  describe("сравнение переменных на равенство", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html, context }) => html`
        <div>${context.cond === context.cond2 ? html`<em>A</em>` : html`<span>b</span>`}</div>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<div>", index: 9, name: "div", kind: "open" },
        { text: "<em>", index: 54, name: "em", kind: "open" },
        { text: "A", index: 58, name: "", kind: "text" },
        { text: "</em>", index: 59, name: "em", kind: "close" },
        { text: "<span>", index: 73, name: "span", kind: "open" },
        { text: "b", index: 79, name: "", kind: "text" },
        { text: "</span>", index: 80, name: "span", kind: "close" },
        { text: "</div>", index: 89, name: "div", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              type: "cond",
              text: "context.cond === context.cond2",
              true: {
                tag: "em",
                type: "el",
                text: "<em>",
                child: [{ type: "text", text: "A" }],
              },
              false: {
                tag: "span",
                type: "el",
                text: "<span>",
                child: [{ type: "text", text: "b" }],
              },
            },
          ],
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: ["/context/cond", "/context/cond2"],
              expr: "${0} === ${1}",
              true: {
                tag: "em",
                type: "el",
                child: [{ type: "text", value: "A" }],
              },
              false: {
                tag: "span",
                type: "el",
                child: [{ type: "text", value: "b" }],
              },
            },
          ],
        },
      ])
    })
  })

  describe("логические операторы без тегов — ничего не находится", () => {
    const html = `a < b && c > d ? "1" : "0"`

    const elements = extractHtmlElements(html)
    it("elements", () => {
      expect(elements).toEqual([{ text: 'a < b && c > d ? "1" : "0"', index: 0, name: "", kind: "text" }])
    })

    const hierarchy = makeHierarchy(html, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          type: "text",
          text: 'a < b && c > d ? "1" : "0"',
        },
      ])
    })
  })

  describe("условие вокруг self/void", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html, context }: any) => html`<div>${context.flag ? html`<br />` : html`<img src="x" />`}</div>`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<div>", index: 0, name: "div", kind: "open" },
        { text: "<br />", index: 27, name: "br", kind: "self" },
        { text: '<img src="x" />', index: 42, name: "img", kind: "self" },
        { text: "</div>", index: 59, name: "div", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              type: "cond",
              text: "context.flag",
              true: {
                tag: "br",
                type: "el",
                text: "<br />",
              },
              false: {
                tag: "img",
                type: "el",
                text: '<img src="x" />',
              },
            },
          ],
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: "/context/flag",
              true: {
                tag: "br",
                type: "el",
              },
              false: {
                tag: "img",
                type: "el",
                string: {
                  src: "x",
                },
              },
            },
          ],
        },
      ])
    })
  })
})
