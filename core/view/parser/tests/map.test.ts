import { describe, it, expect } from "bun:test"
import { extractMainHtmlBlock, extractHtmlElements } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"
import { extractAttributes } from "../attributes"

describe("map", () => {
  describe("простой map", () => {
    const mainHtml = extractMainHtmlBlock<{ list: string[] }>(
      ({ html, context }) => html`
        <ul>
          ${context.list.map((name) => html`<li>${name}</li>`)}
        </ul>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<ul>", index: 9, name: "ul", kind: "open" },
        { text: "<li>", index: 58, name: "li", kind: "open" },
        { text: "${name}", index: 62, name: "", kind: "text" },
        { text: "</li>", index: 69, name: "li", kind: "close" },
        { text: "</ul>", index: 86, name: "ul", kind: "close" },
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
              text: "context.list.map((name)`",
              child: [
                {
                  tag: "li",
                  type: "el",
                  text: "<li>",
                  child: [
                    {
                      type: "text",
                      text: "${name}",
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
                      type: "text",
                      data: "[item]",
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

  describe("простой map с несколькими детьми", () => {
    const mainHtml = extractMainHtmlBlock<{ list: string[] }>(
      ({ html, context }) => html`
        <ul>
          ${context.list.map(
            (name) => html`
              <li>${name}</li>
              <br />
            `
          )}
        </ul>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<ul>", index: 9, name: "ul", kind: "open" },
        { text: "<li>", index: 73, name: "li", kind: "open" },
        { text: "${name}", index: 77, name: "", kind: "text" },
        { text: "</li>", index: 84, name: "li", kind: "close" },
        { text: "<br />", index: 104, name: "br", kind: "self" },
        { text: "</ul>", index: 135, name: "ul", kind: "close" },
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
              text: "context.list.map((name)`",
              child: [
                {
                  tag: "li",
                  type: "el",
                  text: "<li>",
                  child: [
                    {
                      type: "text",
                      text: "${name}",
                    },
                  ],
                },
                {
                  tag: "br",
                  type: "el",
                  text: "<br />",
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
                      type: "text",
                      data: "[item]",
                    },
                  ],
                },
                {
                  tag: "br",
                  type: "el",
                },
              ],
            },
          ],
        },
      ])
    })
  })

  it("map в элементе вложенный в map", () => {
    const mainHtml = extractMainHtmlBlock<any, { list: { title: string; nested: string[] }[] }>(
      ({ html, core }) => html`
        <ul>
          ${core.list.map(
            ({ title, nested }) => html`
              <li>
                <p>${title}</p>
                ${nested.map((n) => html`<em>${n}</em>`)}
              </li>
            `
          )}
        </ul>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    expect(elements).toEqual([
      { text: "<ul>", index: 9, name: "ul", kind: "open" },
      { text: "<li>", index: 83, name: "li", kind: "open" },
      { text: "<p>", index: 104, name: "p", kind: "open" },
      { text: "${title}", index: 107, name: "", kind: "text" },
      { text: "</p>", index: 115, name: "p", kind: "close" },
      { text: "<em>", index: 161, name: "em", kind: "open" },
      { text: "${n}", index: 165, name: "", kind: "text" },
      { text: "</em>", index: 169, name: "em", kind: "close" },
      { text: "</li>", index: 192, name: "li", kind: "close" },
      { text: "</ul>", index: 222, name: "ul", kind: "close" },
    ])
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "ul",
        type: "el",
        text: "<ul>",
        child: [
          {
            type: "map",
            text: "core.list.map(({ title, nested })`",
            child: [
              {
                tag: "li",
                type: "el",
                text: "<li>",
                child: [
                  {
                    tag: "p",
                    type: "el",
                    text: "<p>",
                    child: [
                      {
                        type: "text",
                        text: "${title}",
                      },
                    ],
                  },
                  {
                    type: "map",
                    text: "nested.map((n)`",
                    child: [
                      {
                        tag: "em",
                        type: "el",
                        text: "<em>",
                        child: [
                          {
                            type: "text",
                            text: "${n}",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
    expect(data).toEqual([
      {
        tag: "ul",
        type: "el",
        child: [
          {
            type: "map",
            data: "/core/list",
            child: [
              {
                tag: "li",
                type: "el",
                child: [
                  {
                    tag: "p",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        data: "[item]/title",
                      },
                    ],
                  },
                  {
                    type: "map",
                    data: "[item]/nested",
                    child: [
                      {
                        tag: "em",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            data: "[item]",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
  })

  it("map рендерит вложенные шаблоны (последовательность name/kind)", () => {
    const mainHtml = extractMainHtmlBlock<{ list: string[] }>(
      ({ html, context }) => html`
        <ul>
          ${context.list.map((_, i) => html`<li>${i % 2 ? html`<em>A</em>` : html`<strong>B</strong>`}</li>`)}
        </ul>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    expect(elements).toEqual([
      { text: "<ul>", index: 9, name: "ul", kind: "open" },
      { text: "<li>", index: 58, name: "li", kind: "open" },
      { text: "<em>", index: 77, name: "em", kind: "open" },
      { text: "A", index: 81, name: "", kind: "text" },
      { text: "</em>", index: 82, name: "em", kind: "close" },
      { text: "<strong>", index: 96, name: "strong", kind: "open" },
      { text: "B", index: 104, name: "", kind: "text" },
      { text: "</strong>", index: 105, name: "strong", kind: "close" },
      { text: "</li>", index: 116, name: "li", kind: "close" },
      { text: "</ul>", index: 133, name: "ul", kind: "close" },
    ])
    const hierarchy = makeHierarchy(mainHtml, elements)
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
                          text: "A",
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
                          text: "B",
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
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
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

  it("map в text вложенный в map", () => {
    const mainHtml = extractMainHtmlBlock<any, { list: { title: string; nested: string[] }[] }>(
      ({ html, core }) => html`
        <ul>
          ${core.list.map(({ title, nested }) => html`<li>${title} ${nested.map((n) => html`<em>${n}</em>`)}</li>`)}
        </ul>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    expect(elements).toEqual([
      { text: "<ul>", index: 9, name: "ul", kind: "open" },
      { text: "<li>", index: 68, name: "li", kind: "open" },
      { text: "${title} ", index: 72, name: "", kind: "text" },
      { text: "<em>", index: 106, name: "em", kind: "open" },
      { text: "${n}", index: 110, name: "", kind: "text" },
      { text: "</em>", index: 114, name: "em", kind: "close" },
      { text: "</li>", index: 122, name: "li", kind: "close" },
      { text: "</ul>", index: 139, name: "ul", kind: "close" },
    ])
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "ul",
        type: "el",
        text: "<ul>",
        child: [
          {
            type: "map",
            text: "core.list.map(({ title, nested })`",
            child: [
              {
                tag: "li",
                type: "el",
                text: "<li>",
                child: [
                  {
                    type: "text",
                    text: "${title} ",
                  },
                  {
                    type: "map",
                    text: "nested.map((n)`",
                    child: [
                      {
                        tag: "em",
                        type: "el",
                        text: "<em>",
                        child: [
                          {
                            type: "text",
                            text: "${n}",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
    expect(data).toEqual([
      {
        tag: "ul",
        type: "el",
        child: [
          {
            type: "map",
            data: "/core/list",
            child: [
              {
                tag: "li",
                type: "el",
                child: [
                  {
                    type: "text",
                    data: "[item]/title",
                    expr: "${0}",
                  },
                  {
                    type: "map",
                    data: "[item]/nested",
                    child: [
                      {
                        tag: "em",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            data: "[item]",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
  })
  it("map в условии", () => {
    const mainHtml = extractMainHtmlBlock<{ flag: boolean }, { list: { title: string; nested: string[] }[] }>(
      ({ html, core, context }) => html`
        ${context.flag
          ? html`<ul>
              ${core.list.map(({ title, nested }) => html`<li>${title} ${nested.map((n) => html`<em>${n}</em>`)}</li>`)}
            </ul>`
          : html`<div>x</div>`}
      `
    )
    const elements = extractHtmlElements(mainHtml)
    expect(elements).toEqual([
      { text: "<ul>", index: 31, name: "ul", kind: "open" },
      { text: "<li>", index: 94, name: "li", kind: "open" },
      { text: "${title} ", index: 98, name: "", kind: "text" },
      { text: "<em>", index: 132, name: "em", kind: "open" },
      { text: "${n}", index: 136, name: "", kind: "text" },
      { text: "</em>", index: 140, name: "em", kind: "close" },
      { text: "</li>", index: 148, name: "li", kind: "close" },
      { text: "</ul>", index: 169, name: "ul", kind: "close" },
      { text: "<div>", index: 183, name: "div", kind: "open" },
      { text: "x", index: 188, name: "", kind: "text" },
      { text: "</div>", index: 189, name: "div", kind: "close" },
    ])
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        type: "cond",
        text: "context.flag",
        true: {
          tag: "ul",
          type: "el",
          text: "<ul>",
          child: [
            {
              type: "map",
              text: "core.list.map(({ title, nested })`",
              child: [
                {
                  tag: "li",
                  type: "el",
                  text: "<li>",
                  child: [
                    {
                      type: "text",
                      text: "${title} ",
                    },
                    {
                      type: "map",
                      text: "nested.map((n)`",
                      child: [
                        {
                          tag: "em",
                          type: "el",
                          text: "<em>",
                          child: [
                            {
                              type: "text",
                              text: "${n}",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        false: {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              type: "text",
              text: "x",
            },
          ],
        },
      },
    ])
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
    expect(data).toEqual([
      {
        type: "cond",
        data: "/context/flag",
        true: {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/core/list",
              child: [
                {
                  tag: "li",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      data: "[item]/title",
                      expr: "${0}",
                    },
                    {
                      type: "map",
                      data: "[item]/nested",
                      child: [
                        {
                          tag: "em",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              data: "[item]",
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        false: {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: "x",
            },
          ],
        },
      },
    ])
  })
})
