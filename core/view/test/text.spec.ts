import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context, type ExtractValues } from "../../context/index.ts"
const html = String.raw

describe("текстовые узлы", () => {
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

  describe("прямая интерполяция по ключу из context (key: string)", () => {
    const ctx = new Context((t) => ({ framework: t.string.required("MetaFor") }))
    const { context, schema } = ctx
    const view = new View<typeof schema, string>({
      render: ({ html, context }) => html`<span>${context.framework}</span>`,
    })
    it("парсинг", () => {
      expect(view.schema, "context.user.name парсится с key в точечной нотации").toEqual([
        {
          tag: "span",
          type: "el",
          child: [
            {
              type: "text",
              value: {
                src: "context",
                key: "framework",
              },
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

  describe("прямая интерполяция по составному ключу из core (key: string с точками)", () => {
    const view = new View({ render: ({ html, core }) => html`<b>${core.profile.info.title}</b>` })
    it("парсинг", () => {
      expect(view.schema, "core.profile.info.title парсится с key в точечной нотации").toEqual([
        {
          tag: "b",
          type: "el",
          child: [{ type: "text", value: { src: "core", key: "profile.info.title" } }],
        },
      ])
    })
    it("рендер", () => {
      const el = document.createElement("div")
      view.render({
        state: "",
        context: {},
        core: { profile: { info: { title: "Admin" } } },
        update: (() => {}) as any,
        element: el,
      })
      expect(el.innerHTML, "core.profile.info.title подставляется").toMatchStringHTML(html`<b>Admin</b>`)
    })
  })

  describe("значение по пути (src: string[]) внутри массива без key — примитивный item", () => {
    const { context, schema } = new Context((t) => ({ ids: t.array.required([1, 2]) }))
    const view = new View<typeof schema>({
      render: ({ html, context }) =>
        html`<ul>
          ${context.ids.map((id) => html`<li>${id}</li>`)}
        </ul>`,
    })
    it("парсинг", () => {
      expect(view.schema, "элемент li помечается item, текст = { src: ['context','ids'] }").toEqual([
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
      ])
    })
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ context, element })
      expect(element.innerHTML, "каждый li получает текущее примитивное значение id").toMatchStringHTML(html`
        <ul>
          <li>1</li>
          <li>2</li>
        </ul>
      `)
    })
  })

  describe("значение по пути (src: string[]) внутри массива с key: string — свойство item", () => {
    
    const view = new View({
      render: ({ html, context }) =>
        html`<ul>
          ${context.users.map((u: { name: string }) => html`<li>${u.name}</li>`)}
        </ul>`,
    })
    it("парсинг", () => {
      expect(view.schema, "текст = { src: ['context','users'], key: 'name' }").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              item: { src: "context", key: "users" },
              child: [{ type: "text", value: { src: ["context", "users"], key: "name" } }],
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const el = document.createElement("div")
      view.render({
        state: "",
        context: { users: [{ name: "A" }, { name: "B" }] },
        core: {},
        update: (() => {}) as any,
        element: el,
      })
      expect(el.innerHTML, "каждый li получает свойство name текущего элемента").toMatchStringHTML(
        html`<ul>
          <li>A</li>
          <li>B</li>
        </ul>`
      )
    })
  })

  describe("значение по пути (src: string[]) внутри массива с key: string[] — составной путь в item", () => {
    const view = new View({
      render: ({ html, context }) =>
        html`<ul>
          ${context.list.map((x: { profile: { title: string } }) => html`<li>${x.profile.title}</li>`)}
        </ul>`,
    })
    it("парсинг", () => {
      expect(view.schema, "текст = { src: ['context','list'], key: 'profile.title' }").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              item: { src: "context", key: "list" },
              child: [{ type: "text", value: { src: ["context", "list"], key: "profile.title" } }],
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const el = document.createElement("div")
      view.render({
        state: "",
        context: { list: [{ profile: { title: "T1" } }, { profile: { title: "T2" } }] },
        core: {},
        update: (() => {}) as any,
        element: el,
      })
      expect(el.innerHTML, "поддерживается составной key для item").toMatchStringHTML(
        html`<ul>
          <li>T1</li>
          <li>T2</li>
        </ul>`
      )
    })
  })

  describe("смешанный вариант с result: шаблон отрабатывает", () => {
    const view = new View({ render: ({ html, context }) => html`<i>${context.user.name}</i>` })
    it("парсинг", () => {
      expect(view.schema, "одна интерполяция без окружения парсится без result").toEqual([
        {
          tag: "i",
          type: "el",
          child: [{ type: "text", value: { src: "context", key: "user.name" } }],
        },
      ])
    })
    it("рендер", () => {
      const el = document.createElement("div")
      view.render({ state: "", context: { user: { name: "Kate" } }, core: {}, update: (() => {}) as any, element: el })
      expect(el.innerHTML, "шаблонная строка вычисляется и подставляется").toMatchStringHTML(html`<i>Kate</i>`)
    })
  })

  describe('текст внутри массива: src="item", key: string', () => {
    const view = new View({
      render: ({ html, context }) =>
        html`<ul>
          ${context.items.map((it: { name: string }) => html`<li>${it.name}</li>`)}
        </ul>`,
    })
    it("парсинг", () => {
      expect(view.schema, "текст = { src: ['context','items'], key: 'name' }").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              item: { src: "context", key: "items" },
              child: [{ type: "text", value: { src: ["context", "items"], key: "name" } }],
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const el = document.createElement("div")
      view.render({
        state: "",
        context: { items: [{ name: "N1" }, { name: "N2" }] },
        core: {},
        update: (() => {}) as any,
        element: el,
      })
      expect(el.innerHTML, "используется текущее значение свойства name из item").toMatchStringHTML(
        html`<ul>
          <li>N1</li>
          <li>N2</li>
        </ul>`
      )
    })
  })

  describe('текст внутри массива: src="item", key: string[] (составной путь)', () => {
    const view = new View({
      render: ({ html, context }) =>
        html`<ul>
          ${context.items.map((it: { profile: { title: string } }) => html`<li>${it.profile.title}</li>`)}
        </ul>`,
    })
    it("парсинг", () => {
      expect(view.schema, "текст = { src: ['context','items'], key: 'profile.title' }").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              item: { src: "context", key: "items" },
              child: [{ type: "text", value: { src: ["context", "items"], key: "profile.title" } }],
            },
          ],
        },
      ])
    })
    it("рендер", () => {
      const el = document.createElement("div")
      view.render({
        state: "",
        context: { items: [{ profile: { title: "T1" } }, { profile: { title: "T2" } }] },
        core: {},
        update: (() => {}) as any,
        element: el,
      })
      expect(el.innerHTML, "поддерживается составной путь внутри item").toMatchStringHTML(
        html`<ul>
          <li>T1</li>
          <li>T2</li>
        </ul>`
      )
    })
  })
})
