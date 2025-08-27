import { describe, it, expect } from "bun:test"
import { extractHtmlElements, extractMainHtmlBlock } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { extractAttributes } from "../attributes"
import { enrichWithData } from "../data"

describe("basic", () => {
  describe("простая пара тегов", () => {
    const mainHtml = extractMainHtmlBlock(({ html }) => html`<div></div>`)

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<div>", index: 0, name: "div", kind: "open" },
        { text: "</div>", index: 5, name: "div", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: "<div>",
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    it("attributes", () => {
      expect(attributes).toEqual([
        {
          tag: "div",
          type: "el",
        },
      ])
    })

    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
        },
      ])
    })
  })

  describe("вложенность и соседние узлы", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html }) => html`
        <ul>
          <li>a</li>
          <li>b</li>
        </ul>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<ul>", index: 9, name: "ul", kind: "open" },
        { text: "<li>", index: 24, name: "li", kind: "open" },
        { text: "a", index: 28, name: "", kind: "text" },
        { text: "</li>", index: 29, name: "li", kind: "close" },
        { text: "<li>", index: 45, name: "li", kind: "open" },
        { text: "b", index: 49, name: "", kind: "text" },
        { text: "</li>", index: 50, name: "li", kind: "close" },
        { text: "</ul>", index: 64, name: "ul", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "ul",
          type: "el",
          text: "<ul>",
          child: [
            {
              tag: "li",
              type: "el",
              text: "<li>",
              child: [
                {
                  type: "text",
                  text: "a",
                },
              ],
            },
            {
              tag: "li",
              type: "el",
              text: "<li>",
              child: [
                {
                  type: "text",
                  text: "b",
                },
              ],
            },
          ],
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    it("attributes", () => {
      expect(attributes).toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              child: [
                {
                  type: "text",
                  text: "a",
                },
              ],
            },
            {
              tag: "li",
              type: "el",
              child: [
                {
                  type: "text",
                  text: "b",
                },
              ],
            },
          ],
        },
      ])
    })

    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "a",
                },
              ],
            },
            {
              tag: "li",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "b",
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("void и self", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html }) => html`
        <div>
          <br />
          <img src="x" />
          <input disabled />
        </div>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<div>", index: 9, name: "div", kind: "open" },
        { text: "<br />", index: 25, name: "br", kind: "self" },
        { text: '<img src="x" />', index: 42, name: "img", kind: "self" },
        { text: "<input disabled />", index: 68, name: "input", kind: "self" },
        { text: "</div>", index: 95, name: "div", kind: "close" },
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
              tag: "br",
              type: "el",
              text: "<br />",
            },
            {
              tag: "img",
              type: "el",
              text: '<img src="x" />',
            },
            {
              tag: "input",
              type: "el",
              text: "<input disabled />",
            },
          ],
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    it("attributes", () => {
      expect(attributes).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "br",
              type: "el",
            },
            {
              tag: "img",
              type: "el",
              string: {
                src: {
                  type: "static",
                  value: "x",
                },
              },
            },
            {
              tag: "input",
              type: "el",
              boolean: {
                disabled: {
                  type: "static",
                  value: true,
                },
              },
            },
          ],
        },
      ])
    })

    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "br",
              type: "el",
            },
            {
              tag: "img",
              type: "el",
              string: {
                src: "x",
              },
            },
            {
              tag: "input",
              type: "el",
              boolean: {
                disabled: true,
              },
            },
          ],
        },
      ])
    })
  })
})
