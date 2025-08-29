import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

describe("Условные конструкции в атрибутах", () => {
  const html = String.raw

  describe("Тернарный оператор с числовым условием", () => {
    const { schema, context, update } = new Context((t) => ({ count: t.number.required(0) }))
    const view = new View<typeof schema>({
      render: ({ html, context }) =>
        html`<div class="${10 > context.count && context.count < 3 ? "active" : "inactive"}">Content</div>`,
    })
    it("парсинг", () => {
      expect(view.schema, "схема тернарного оператора с числом").toEqual([
        {
          tag: "div",
          type: "el",
          string: { class: { data: "/context/count", expr: '${10 > [0] && [0] < 3 ? "active" : "inactive"}' } },
          child: [{ type: "text", value: "Content" }],
        },
      ])
    })
    it("true", () => {
      const element = document.createElement("div")
      update({ count: 0 })
      view.render({ container: element, context })
      expect(element.innerHTML, "рендер при условии true").toMatchStringHTML(html`<div class="active">Content</div>`)
    })
    it("false", () => {
      const element = document.createElement("div")
      update({ count: 10 })
      view.render({ container: element, context })
      expect(element.innerHTML, "рендер при условии false").toMatchStringHTML(html`<div class="inactive">Content</div>`)
    })
  })

  describe("Тернарный оператор сравнения", () => {
    const core = { isActive: false }
    const { schema, context, update } = new Context((t) => ({ isActive: t.boolean.required(false) }))
    const view = new View<typeof schema, typeof core>({
      render: ({ html, context, core }) =>
        html`<div class="${core.isActive === context.isActive ? "active" : "inactive"}">Content</div>`,
    })
    it("парсинг", () => {
      expect(view.schema, "схема тернарного сравнения").toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: { data: ["/core/isActive", "/context/isActive"], expr: '${[0] === [1] ? "active" : "inactive"}' },
          },
          child: [{ type: "text", value: "Content" }],
        },
      ])
    })
    it("true", () => {
      const element = document.createElement("div")
      core.isActive = false
      update({ isActive: false })
      view.render({ container: element, context, core })
      expect(element.innerHTML, "рендер равенства true").toMatchStringHTML(html`<div class="active">Content</div>`)
    })
    it("false", () => {
      const element = document.createElement("div")
      core.isActive = true
      update({ isActive: false })
      view.render({ container: element, context, core })
      expect(element.innerHTML, "рендер равенства false").toMatchStringHTML(html`<div class="inactive">Content</div>`)
    })
  })

  describe("Тернарный оператор с динамическим результатом", () => {
    const core = { isActive: false }
    const { context, update } = new Context((t) => ({
      isActive: t.boolean.required(false),
      status: t.enum("waiting", "running").required("waiting"),
      item: t.string.required("any"),
    }))
    const view = new View({
      render: ({ html, context, core }) =>
        html`<div
          class="${core.isActive === context.isActive ? `${context.item}-active-${context.status}` : "inactive"}">
          Content
        </div>`,
    })
    it("парсинг", () => {
      expect(view.schema, "схема тернарного с динамическим результатом").toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: ["/core/isActive", "/context/isActive", "/context/item", "/context/status"],
              expr: '${[0] === [1] ? `${[2]}-active-${[3]}` : "inactive"}',
            },
          },
          child: [{ type: "text", value: "Content" }],
        },
      ])
    })
    it("true", () => {
      const container = document.createElement("div")
      core.isActive = false
      update({ isActive: false, item: "test", status: "waiting" })
      view.render({ container, context, core })
      expect(container.innerHTML, "рендер динамического условия true").toMatchStringHTML(
        html`<div class="test-active-waiting">Content</div>`
      )
    })
    it("false", () => {
      const container = document.createElement("div")
      core.isActive = true
      update({ isActive: false, item: "test", status: "waiting" })
      view.render({ container, context, core })
      expect(container.innerHTML, "рендер динамического условия false").toMatchStringHTML(
        html`<div class="inactive">Content</div>`
      )
    })
  })

  describe("Логическое И", () => {
    const { schema, context, update } = new Context((t) => ({ cannotEdit: t.boolean.required(true) }))
    const view = new View<typeof schema>({
      render: ({ html, context }) => html`<button ${context.cannotEdit && "disabled"}>Edit</button>`,
    })
    it("парсинг", () => {
      expect(view.schema, "схема логического И").toEqual([
        {
          tag: "button",
          type: "el",
          boolean: { disabled: { data: "/context/cannotEdit" } },
          child: [{ type: "text", value: "Edit" }],
        },
      ])
    })
    it("true", () => {
      const container = document.createElement("div")
      update({ cannotEdit: true })
      view.render({ container, context })
      expect(container.innerHTML, "рендер логического И true").toMatchStringHTML(html`<button disabled>Edit</button>`)
    })
    it("false", () => {
      const container = document.createElement("div")
      update({ cannotEdit: false })
      view.render({ container, context })
      expect(container.innerHTML, "рендер логического И false").toMatchStringHTML(html`<button>Edit</button>`)
    })
  })

  describe("Одинаковые значения в обеих ветвях", () => {
    const { schema, context, update } = new Context((t) => ({ always: t.boolean.required(false) }))
    const view = new View<typeof schema>({
      render: ({ html, context }) => html`<div class="${context.always ? "same" : "same"}">Content</div>`,
    })
    it("парсинг", () => {
      expect(view.schema, "схема одинаковых ветвей").toEqual([
        {
          tag: "div",
          type: "el",
          string: { class: { data: "/context/always", expr: '${[0] ? "same" : "same"}' } },
          child: [{ type: "text", value: "Content" }],
        },
      ])
    })
    it("true", () => {
      const container = document.createElement("div")
      update({ always: true })
      view.render({ container, context })
      expect(container.innerHTML, "рендер одинаковых ветвей true").toMatchStringHTML(
        html`<div class="same">Content</div>`
      )
    })
    it("false", () => {
      const container = document.createElement("div")
      update({ always: false })
      view.render({ container, context })
      expect(container.innerHTML, "рендер одинаковых ветвей false").toMatchStringHTML(
        html`<div class="same">Content</div>`
      )
    })
  })
})
