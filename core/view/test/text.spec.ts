import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

describe("текстовые узлы", () => {
  const html = String.raw

  describe("статический текст без интерполяций", () => {
    const view = new View({
      render: ({ html }) => html`<div>Static text content</div>`,
    })
    it("парсинг", () => {
      expect(view.schema, "статический текст").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: "Static text content",
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ container: element })
      expect(element.innerHTML).toMatchStringHTML(html`<div>Static text content</div>`)
    })
  })

  describe("ключ контекста", () => {
    const ctx = new Context((t) => ({
      framework: t.string.required("MetaFor"),
    }))
    const { context, schema } = ctx
    const view = new View<typeof schema>({
      render: ({ html, context }) => html`<span>${context.framework}</span>`,
    })
    it("парсинг", () => {
      expect(view.schema, "src - контекст и ключ объекта в контексте").toEqual([
        {
          tag: "span",
          type: "el",
          child: [
            {
              type: "text",
              data: "/context/framework",
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ context, container: element })
      expect(element.innerHTML).toMatchStringHTML(html`<span>${context.framework}</span>`)
    })
  })

  describe("вложенный объект ядра", () => {
    const core = { profile: { info: { title: "Admin" } } } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`<b>${core.profile.info.title}</b>`,
    })
    it("парсинг", () => {
      expect(view.schema, "src - ядро и ключ объекта в ядре, key - составной ключ вложенного объекта").toEqual([
        {
          tag: "b",
          type: "el",
          child: [
            {
              type: "text",
              data: "/core/profile/info/title",
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, container: element })
      expect(element.innerHTML).toMatchStringHTML(html`<b>${core.profile.info.title}</b>`)
    })
  })

  describe("ключ объекта в массиве контекста", () => {
    const ctx = new Context((t) => ({
      ids: t.array.required([1, 2, 3]),
    }))
    const { context, schema } = ctx
    const view = new View<typeof schema>({
      render: ({ html, context }) => html`
        <ul>
          ${context.ids.map((id) => html`<li>${id}</li>`)}
        </ul>
      `,
    })
    it("парсинг", () => {
      expect(view.schema, "src - контекст и ключ массива, key - не указан (значения массива примитивные)").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/context/ids",
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
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ context, container: element })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li>${context.ids[0]}</li>
          <li>${context.ids[1]}</li>
          <li>${context.ids[2]}</li>
        </ul>
      `)
    })
  })

  describe("ключ объекта в массиве ядра", () => {
    const core = {
      users: [
        { name: "John", email: "john@example.com" },
        { name: "Jane", email: "jane@example.com" },
      ],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.users.map((user) => html`<li>${user.name}</li>`)}
        </ul>
      `,
    })
    it("парсинг", () => {
      expect(view.schema, "src - ядро и ключ массива в ядре, key - ключ объекта внутри массива").toEqual([
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
                      type: "text",
                      data: "[item]/name",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, container: element })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li>${core.users[0].name}</li>
          <li>${core.users[1].name}</li>
        </ul>
      `)
    })
  })

  describe("составной ключ объекта ядра с шаблонной строкой", () => {
    const core = { framework: { name: "MetaFor" } } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`<span>Best framework - ${core.framework.name}</span>`,
    })
    it("парсинг", () => {
              expect(
          view.schema,
          "src - ядро и ключ объекта в ядре, key - составной ключ объекта, result - шаблонная строка"
        ).toEqual([
          {
            tag: "span",
            type: "el",
            child: [
              {
                type: "text",
                data: "/core/framework/name",
                expr: "Best framework - ${[0]}",
              },
            ],
          },
        ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, container: element })
      expect(element.innerHTML).toMatchStringHTML(html`<span>Best framework - ${core.framework.name}</span>`)
    })
  })

  describe("множественные значения в шаблоне", () => {
    const state = "loading" as const
    const core = { one: 1, two: 2 } as const
    const view = new View<any, typeof core, typeof state>({
      render: ({ html, state, core }) => html`<span>In state: ${state} in core: ${core.one} ${core.two}</span>`,
    })
    it("парсинг", () => {
      expect(view.schema, "шаблон с множественными значениями в тексте").toEqual([
        {
          tag: "span",
          type: "el",
          child: [
            {
              type: "text",
              data: ["/state", "/core/one", "/core/two"],
              expr: "In state: ${[0]} in core: ${[1]} ${[2]}",
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ state, core, container: element })
      expect(element.innerHTML).toMatchStringHTML(html`
        <span>In state: ${state} in core: ${core.one} ${core.two}</span>
      `)
    })
  })

  describe("ключ объекта в массиве ядра", () => {
    const core = {
      users: [
        { name: "John", email: "john@example.com" },
        { name: "Jane", email: "jane@example.com" },
      ],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.users.map((it) => html` <li>${it.name}</li> `)}
        </ul>
      `,
    })
    it("парсинг", () => {
      expect(view.schema, "src - ядро и ключ массива в ядре, key - ключ объекта внутри массива").toEqual([
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
                      type: "text",
                      data: "[item]/name",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, container: element })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li>${core.users[0].name}</li>
          <li>${core.users[1].name}</li>
        </ul>
      `)
    })
  })

  describe("составной ключ объекта в массиве ядра", () => {
    const core = {
      list: [{ profile: { title: "Admin" } }, { profile: { title: "User" } }],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.list.map((it) => html`<li>${it.profile.title}</li>`)}
        </ul>
      `,
    })
    it("парсинг", () => {
      expect(view.schema, "src - ядро и ключ массива в ядре, key - составной ключ объекта внутри массива").toEqual([
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
                      data: "[item]/profile/title",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, container: element })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li>${core.list[0].profile.title}</li>
          <li>${core.list[1].profile.title}</li>
        </ul>
      `)
    })
  })

  describe("ключ состояния", () => {
    const state = "loading" as const
    const view = new View<any, any, typeof state>({
      render: ({ html, state }) => html`<span>${state}</span>`,
    })
    it("парсинг", () => {
      expect(view.schema, "src - состояние без ключа").toEqual([
        {
          tag: "span",
          type: "el",
          child: [
            {
              type: "text",
              data: "/state",
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ state, container: element })
      expect(element.innerHTML).toMatchStringHTML(html`<span>${state}</span>`)
    })
  })
})
