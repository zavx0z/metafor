import { describe, it, expect } from "bun:test"
import { extractHtmlElements, extractMainHtmlBlock } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"
import { extractAttributes } from "../attributes"

describe("mixed", () => {
  describe("map + условия", () => {
    const mainHtml = extractMainHtmlBlock<{ list: string[] }>(
      ({ html, context }) => html`
        <ul>
          ${context.list.map(
            (_, i) => html` <li>${i % 2 ? html` <em>${"A"}</em> ` : html` <strong>${"B"}</strong>`}</li> `
          )}
        </ul>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<ul>", index: 9, name: "ul", kind: "open" },
        { text: "<li>", index: 59, name: "li", kind: "open" },
        { text: "<em>", index: 79, name: "em", kind: "open" },
        { text: '${"A"}', index: 83, name: "", kind: "text" },
        { text: "</em>", index: 89, name: "em", kind: "close" },
        { text: "<strong>", index: 105, name: "strong", kind: "open" },
        { text: '${"B"}', index: 113, name: "", kind: "text" },
        { text: "</strong>", index: 119, name: "strong", kind: "close" },
        { text: "</li>", index: 130, name: "li", kind: "close" },
        { text: "</ul>", index: 148, name: "ul", kind: "close" },
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
              type: "map",
              text: "context.list.map((_, i)`",
              child: [
                {
                  tag: "li",
                  type: "el",
                  text: "<li>",
                  child: [
                    {
                      type: "cond",
                      text: "i % 2",
                      true: {
                        tag: "em",
                        type: "el",
                        text: "<em>",
                        child: [
                          {
                            type: "text",
                            text: '${"A"}',
                          },
                        ],
                      },
                      false: {
                        tag: "strong",
                        type: "el",
                        text: "<strong>",
                        child: [
                          {
                            type: "text",
                            text: '${"B"}',
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
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
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/context/list",
              child: [
                {
                  tag: "li",
                  type: "el",
                  child: [
                    {
                      type: "cond",
                      data: "[index]",
                      expr: "${0} % 2",
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
                        tag: "strong",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            value: "B",
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
  })

  it("операторы сравнения — без тегов", () => {
    const mainHtml = extractMainHtmlBlock<{ a: number; b: number; c: number; d: number }>(
      ({ html, context }) => html`${context.a < context.b && context.c > context.d ? "1" : "0"}`
    )
    const elements = extractHtmlElements(mainHtml)
    expect(elements).toEqual([
      { index: 0, kind: "text", name: "", text: '${context.a < context.b && context.c > context.d ? "1" : "0"}' },
    ])
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        type: "text",
        text: '${context.a < context.b && context.c > context.d ? "1" : "0"}',
      },
    ])
    const enrichedHierarchy = enrichWithData(hierarchy)
    expect(enrichedHierarchy).toEqual([
      {
        type: "text",
        data: ["/context/a", "/context/b", "/context/c", "/context/d"],
        expr: '${0 < 1 && 2 > 3 ? "1" : "0"}',
      },
    ])
  })
})
