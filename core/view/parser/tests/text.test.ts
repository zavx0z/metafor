import { describe, it, expect } from "bun:test"
import { extractMainHtmlBlock, extractHtmlElements } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"

describe("text", () => {
  describe("пустой элемент без текста", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html }) => html`
        <div>
          <p></p>
        </div>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              tag: "p",
              type: "el",
              text: "<p>",
            },
          ],
        },
      ])
    })
  })

  describe("динамический текст в map где значением является строка элемент массива", () => {
    const mainHtml = extractMainHtmlBlock<{ list: string[] }>(
      ({ html, context }) => html`
        <ul>
          ${context.list.map((name) => html`<li>${name}</li>`)}
        </ul>
      `
    )

    const elements = extractHtmlElements(mainHtml)
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
  })

  it("динамический текст с разными именами переменных элемента массива", () => {
    const mainHtml = extractMainHtmlBlock<any, { list: { name: string; family: string }[] }>(
      ({ html, context }) => html`
        <div>
          <p>static</p>
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            tag: "p",
            type: "el",
            text: "<p>",
            child: [
              {
                type: "text",
                text: "static",
              },
            ],
          },
        ],
      },
    ])
  })

  it("смешанный текст - статический + динамический (с одной переменной)", () => {
    const mainHtml = extractMainHtmlBlock<{ name: string }>(
      ({ html, context }) => html`
        <div>
          <p>Hello, ${context.name}!</p>
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            tag: "p",
            type: "el",
            text: "<p>",
            child: [
              {
                type: "text",
                text: "Hello, ${context.name}!",
              },
            ],
          },
        ],
      },
    ])
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: "/context/name",
                expr: "Hello, ${0}!",
              },
            ],
          },
        ],
      },
    ])
  })
  it("смешанный текст - статический + динамический (с несколькими переменными)", () => {
    const mainHtml = extractMainHtmlBlock<{ family: string; name: string }>(
      ({ html, context }) => html`
        <div>
          <p>Hello, ${context.family} ${context.name}!</p>
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            tag: "p",
            type: "el",
            text: "<p>",
            child: [
              {
                type: "text",
                text: "Hello, ${context.family} ${context.name}!",
              },
            ],
          },
        ],
      },
    ])
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: ["/context/family", "/context/name"],
                expr: "Hello, ${0} ${1}!",
              },
            ],
          },
        ],
      },
    ])
  })
  it("условие в тексте", () => {
    const mainHtml = extractMainHtmlBlock<{ show: boolean; name: string }>(
      ({ html, context }) => html`
        <div>
          <p>${context.show ? "Visible" : "Hidden"}</p>
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    expect(elements).toEqual([
      { text: "<div>", index: 9, name: "div", kind: "open" },
      { text: "<p>", index: 25, name: "p", kind: "open" },
      { text: '${context.show ? "Visible" : "Hidden"}', index: 28, name: "", kind: "text" },
      { text: "</p>", index: 66, name: "p", kind: "close" },
      { text: "</div>", index: 79, name: "div", kind: "close" },
    ])

    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            tag: "p",
            type: "el",
            text: "<p>",
            child: [
              {
                type: "text",
                text: '${context.show ? "Visible" : "Hidden"}',
              },
            ],
          },
        ],
      },
    ])
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: "/context/show",
                expr: '${0 ? "Visible" : "Hidden"}',
              },
            ],
          },
        ],
      },
    ])
  })
  it("map в рядом с текстом, рядом с динамическим текстом из map выше уровня", () => {
    const mainHtml = extractMainHtmlBlock<any, { list: { title: string; nested: string[] }[] }>(
      ({ html, core }) => html`
        <ul>
          ${core.list.map(({ title, nested }) => html` <li>${title} ${nested.map((n) => html`<em>${n}</em>`)}</li> `)}
        </ul>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    expect(elements).toEqual([
      { text: "<ul>", index: 9, name: "ul", kind: "open" },
      { text: "<li>", index: 69, name: "li", kind: "open" },
      { text: "${title} ", index: 73, name: "", kind: "text" },
      { text: "<em>", index: 107, name: "em", kind: "open" },
      { text: "${n}", index: 111, name: "", kind: "text" },
      { text: "</em>", index: 115, name: "em", kind: "close" },
      { text: "</li>", index: 123, name: "li", kind: "close" },
      { text: "</ul>", index: 141, name: "ul", kind: "close" },
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
    const data = enrichWithData(hierarchy)
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
  it("динамический текст в условии", () => {
    const mainHtml = extractMainHtmlBlock<{ show: boolean; name: string }>(
      ({ html, context }) => html`
        <div>${context.show ? html`<p>Visible: ${context.name}</p>` : html`<p>Hidden</p>`}</div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            type: "cond",
            text: "context.show",
            true: {
              tag: "p",
              type: "el",
              text: "<p>",
              child: [
                {
                  type: "text",
                  text: "Visible: ${context.name}",
                },
              ],
            },
            false: {
              tag: "p",
              type: "el",
              text: "<p>",
              child: [
                {
                  type: "text",
                  text: "Hidden",
                },
              ],
            },
          },
        ],
      },
    ])
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            type: "cond",
            data: "/context/show",
            true: {
              tag: "p",
              type: "el",
              child: [
                {
                  type: "text",
                  data: "/context/name",
                  expr: "Visible: ${0}",
                },
              ],
            },
            false: {
              tag: "p",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "Hidden",
                },
              ],
            },
          },
        ],
      },
    ])
  })

  it("статический текст в элементе на одном уровне с динамическим текстом", () => {
    const mainHtml = extractMainHtmlBlock(({ html, context }) => html`<div><b>Hello, </b>${context.name}</div>`)
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            tag: "b",
            type: "el",
            text: "<b>",
            child: [
              {
                type: "text",
                text: "Hello, ",
              },
            ],
          },
          {
            type: "text",
            text: "${context.name}",
          },
        ],
      },
    ])
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            tag: "b",
            type: "el",
            child: [
              {
                type: "text",
                value: "Hello, ",
              },
            ],
          },
          {
            type: "text",
            data: "/context/name",
          },
        ],
      },
    ])
  })

  it("динамический текст со статическим текстом в элементе на одном уровне", () => {
    const mainHtml = extractMainHtmlBlock(({ html, context }) => html`<div>${context.name}<b>-hello</b></div>`)
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            type: "text",
            text: "${context.name}",
          },
          {
            tag: "b",
            type: "el",
            text: "<b>",
            child: [
              {
                type: "text",
                text: "-hello",
              },
            ],
          },
        ],
      },
    ])
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            type: "text",
            data: "/context/name",
          },
          {
            tag: "b",
            type: "el",
            child: [
              {
                type: "text",
                value: "-hello",
              },
            ],
          },
        ],
      },
    ])
  })

  it("динамические тексты вокруг статического текста", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html, context }) => html`<div>${context.family} <b>-hello</b>${context.name}</div>`
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            type: "text",
            text: "${context.family} ",
          },
          {
            tag: "b",
            type: "el",
            text: "<b>",
            child: [
              {
                type: "text",
                text: "-hello",
              },
            ],
          },
          {
            type: "text",
            text: "${context.name}",
          },
        ],
      },
    ])
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            type: "text",
            data: "/context/family",
            expr: "${0}",
          },
          {
            tag: "b",
            type: "el",
            child: [
              {
                type: "text",
                value: "-hello",
              },
            ],
          },
          {
            type: "text",
            data: "/context/name",
          },
        ],
      },
    ])
  })

  it("динамический текст в map с доступом по ключу в элементе массива, на разных уровнях", () => {
    const mainHtml = extractMainHtmlBlock<any, { users: { name: string; role: string }[] }>(
      ({ html, core }) => html`
        <ul>
          ${core.users.map((user) => html` <li><strong>${user.name}</strong> - ${user.role}</li> `)}
        </ul>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "ul",
        type: "el",
        text: "<ul>",
        child: [
          {
            type: "map",
            text: "core.users.map((user)`",
            child: [
              {
                tag: "li",
                type: "el",
                text: "<li>",
                child: [
                  {
                    tag: "strong",
                    type: "el",
                    text: "<strong>",
                    child: [
                      {
                        type: "text",
                        text: "${user.name}",
                      },
                    ],
                  },
                  {
                    type: "text",
                    text: " - ${user.role}",
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "ul",
        type: "el",
        child: [
          {
            type: "map",
            data: "/core/users",
            child: [
              {
                tag: "li",
                type: "el",
                child: [
                  {
                    tag: "strong",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        data: "[item]/name",
                      },
                    ],
                  },
                  {
                    type: "text",
                    data: "[item]/role",
                    expr: "- ${0}",
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
  })

  it("обрабатывает выражения в ${}", () => {
    const mainHtml = extractMainHtmlBlock<{ list: string[] }>(
      ({ html, context }) => html`
        <div>
          <p>${context.list.map((item) => item.toUpperCase())}</p>
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: "/context/list",
                expr: "${0}.map((item) => item.toUpperCase())",
              },
            ],
          },
        ],
      },
    ])
  })

  it("обрабатывает выражения с точками в ${} к вложенным элементам ядра", () => {
    const mainHtml = extractMainHtmlBlock<any, { user: { name: string } }>(
      ({ html, core }) => html`
        <div>
          <p>${core.user.name}</p>
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    const data = enrichWithData(hierarchy)
    expect(data).toEqual([
      {
        tag: "div",
        type: "el",
        child: [
          {
            tag: "p",
            type: "el",
            child: [
              {
                type: "text",
                data: "/core/user/name",
              },
            ],
          },
        ],
      },
    ])
  })
})
