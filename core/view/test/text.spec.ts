import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

describe("текстовые узлы", () => {
  const html = String.raw
  describe("статический текст без интерполяций", () => {
    const view = new View({ render: ({ html }) => html`<div>Hello</div>` })
    it("парсинг", () =>
      expect(view.schema, "статический текст парсится в текстовый узел").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "text",
              value: "Hello",
            },
          ],
        },
      ]))
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ element })
      expect(element.innerHTML, "статический текст рендерится как есть").toMatchStringHTML(html`<div>Hello</div>`)
    })
  })

  describe("ключ контекста", () => {
    const ctx = new Context((t) => ({ framework: t.string.required("MetaFor") }))
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
              value: { src: "context", key: "framework" },
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ context, element })
      expect(element.innerHTML, "context.framework подставляется").toMatchStringHTML(html`
        <span>${context.framework}</span>
      `)
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
          child: [{ type: "text", value: { src: "core", key: ["profile", "info", "title"] } }],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, element })
      expect(element.innerHTML, "core.profile.info.title подставляется").toMatchStringHTML(html`
        <b>${core.profile.info.title}</b>
      `)
    })
  })

  describe("ключ объекта в массиве контекста", () => {
    const { context, schema } = new Context((t) => ({ ids: t.array.required([1, 2]) }))
    const view = new View<typeof schema>({
      render: ({ html, context }) => html`
        <ul>
          ${context.ids.map((id) => html`<li>${id}</li>`)}
        </ul>
      `,
    })
    it("парсинг", () =>
      expect(view.schema, "src - контекст и ключ массива, key - не указан (значения массива примитивные)").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              item: { src: "context", key: "ids" },
              child: [{ type: "text", value: { src: ["context", "ids"] } }],
            },
          ],
        },
      ]))
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ context, element })
      expect(element.innerHTML, "каждый li получает текущее примитивное значение id контекста").toMatchStringHTML(html`
        <ul>
          <li>${context.ids[0]}</li>
          <li>${context.ids[1]}</li>
        </ul>
      `)
    })
  })

  describe("ключ объекта в массиве ядра", () => {
    const core = { users: [{ name: "A" }, { name: "B" }] } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) =>
        html`<ul>
          ${core.users.map((user) => html`<li>${user.name}</li>`)}
        </ul>`,
    })
    it("парсинг", () =>
      expect(view.schema, "src - ядро и ключ массива в ядре, key - ключ объекта внутри массива").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              item: { src: "core", key: "users" },
              child: [{ type: "text", value: { src: ["core", "users"], key: "name" } }],
            },
          ],
        },
      ]))
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, element })
      expect(element.innerHTML, "каждый li получает свойство name объекта из массива ядра").toMatchStringHTML(html`
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
      render: ({ html, core }) => html` <span>Лучший фреймворк - ${core.framework.name}</span> `,
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
              value: {
                src: "core",
                key: ["framework", "name"],
                result:
                  "\\u041B\\u0443\\u0447\\u0448\\u0438\\u0439 \\u0444\\u0440\\u0435\\u0439\\u043C\\u0432\\u043E\\u0440\\u043A - " +
                  "${core.framework.name}",
              },
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, element })
      expect(element.innerHTML, "шаблонная строка вычисляется и подставляется").toMatchStringHTML(html`
        <span>${Bun.escapeHTML("Лучший фреймворк - ")}${core.framework.name}</span>
      `)
    })
  })

  describe("ключ объекта в массиве ядра", () => {
    const core = { users: [{ name: "A" }, { name: "B" }] } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.users.map((it: { name: string }) => html` <li>${it.name}</li> `)}
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
              tag: "li",
              type: "el",
              item: { src: "core", key: "users" },
              child: [{ type: "text", value: { src: ["core", "users"], key: "name" } }],
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, element })
      expect(element.innerHTML, "каждый li получает свойство name объекта из массива ядра").toMatchStringHTML(html`
        <ul>
          <li>${core.users[0].name}</li>
          <li>${core.users[1].name}</li>
        </ul>
      `)
    })
  })

  describe("составной ключ объекта в массиве ядра", () => {
    const core = { list: [{ profile: { title: "T1" } }, { profile: { title: "T2" } }] } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.list.map((it: { profile: { title: string } }) => html`<li>${it.profile.title}</li>`)}
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
              tag: "li",
              type: "el",
              item: { src: "core", key: "list" },
              child: [{ type: "text", value: { src: ["core", "list"], key: ["profile", "title"] } }],
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ core, element })
      expect(element.innerHTML, "каждый li получает свойство title объекта из массива ядра").toMatchStringHTML(
        html` <ul>
          <li>${core.list[0].profile.title}</li>
          <li>${core.list[1].profile.title}</li>
        </ul>`
      )
    })
  })
})
