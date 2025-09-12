import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "@zavx0z/context"

describe("условные блоки", () => {
  const html = String.raw

  describe("тернарный оператор", () => {
    describe("тернарий и && в атрибутах + сложные классы и enum после массива", () => {
      const { context, schema } = new Context((t) => ({
        className: t.string.required("className"),
        id: t.string.required("id"),
        text: t.string.required("text"),
        visible: t.boolean.required(true),
        disabled: t.boolean.required(true),
        list: t.array.required(["item1", "item2"]),
        enum: t.enum("div", "span", "p").required("div"),
      }))
      const view = new View<typeof schema>({
        render: ({ html, context }) => html`
          <div class=${context.className} id="${context.id}" data-text="${context.text}">
            <img
              class="image ${context.className}-image"
              src="test.jpg"
              ${context.visible ? "visible" : "hidden"}
              alt="${context.text}" />
            <br />
            <button class="button-${context.className} ${context.className}-button" ${context.disabled && "disabled"}>
              ${context.text}
            </button>
            <ul>
              ${context.list.map((item) => html`<li>${item}</li>`)}
            </ul>
            ${context.enum === "div"
              ? html`<div class="enum">enum element div</div>`
              : context.enum === "span"
                ? html`<span class="enum">enum element span</span>`
                : context.enum === "p" && html`<p class="enum">enum element p</p>`}
          </div>
        `,
      })
      it("парсинг", () =>
        expect(view.schema, "тернарий и && в атрибутах + сложные классы и enum после массива").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "img",
                type: "el",
                string: {
                  src: "test.jpg",
                  alt: {
                    data: "/context/text",
                  },
                },
                array: {
                  class: [
                    "image",
                    {
                      data: "/context/className",
                      expr: "${[0]}-image",
                    },
                  ],
                },
                boolean: {
                  visible: {
                    data: "/context/visible",
                  },
                  hidden: {
                    data: "/context/visible",
                    expr: "!${[0]}",
                  },
                },
              },
              {
                tag: "br",
                type: "el",
              },
              {
                tag: "button",
                type: "el",
                child: [
                  {
                    type: "text",
                    data: "/context/text",
                  },
                ],
                array: {
                  class: [
                    {
                      data: "/context/className",
                      expr: "button-${[0]}",
                    },
                    {
                      data: "/context/className",
                      expr: "${[0]}-button",
                    },
                  ],
                },
                boolean: {
                  disabled: {
                    data: "/context/disabled",
                  },
                },
              },
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
              {
                type: "cond",
                data: ["/context/enum", "/div"],
                expr: '${[0]} === "${[1]}"',
                child: [
                  {
                    tag: "div",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "enum element div",
                      },
                    ],
                    string: {
                      class: "enum",
                    },
                  },
                  {
                    type: "cond",
                    data: ["/context/enum", "/span"],
                    expr: '${[0]} === "${[1]}"',
                    child: [
                      {
                        tag: "span",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            value: "enum element span",
                          },
                        ],
                        string: {
                          class: "enum",
                        },
                      },
                      {
                        tag: "p",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            value: "enum element p",
                          },
                        ],
                        string: {
                          class: "enum",
                        },
                      },
                    ],
                  },
                ],
              },
            ],
            string: {
              class: {
                data: "/context/className",
              },
              id: {
                data: "/context/id",
              },
              "data-text": {
                data: "/context/text",
              },
            },
          },
        ]))
      it("рендер", () => {
        const container = document.createElement("div")
        view.render({ container, context })
        expect(container.innerHTML).toMatchStringHTML(html`
          <div class="${context.className}" id="${context.id}" data-text="${context.text}">
            <img class="image ${context.className}-image" visible src="test.jpg" alt="${context.text}" />
            <br />
            <button class="button-${context.className} ${context.className}-button" disabled>${context.text}</button>
            <ul>
              <li>item1</li>
              <li>item2</li>
            </ul>
          </div>
        `)
      })
    })

    describe("простой тернарный оператор с context", () => {
      const { context, update } = new Context((t) => ({ isActive: t.boolean.required(true) }))
      const view = new View({
        render: ({ html, context }) => html`
          <div>${context.isActive ? html`<span>Active</span>` : html`<span>Inactive</span>`}</div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "простой тернарный оператор с context").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "cond",
                data: "/context/isActive",
                child: [
                  {
                    tag: "span",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "Active",
                      },
                    ],
                  },
                  {
                    tag: "span",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "Inactive",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер true", () => {
        const container = document.createElement("div")
        update({ isActive: true })
        view.render({ container, context })
        expect(container.innerHTML, "рендер при условии true").toMatchStringHTML(html`<div><span>Active</span></div>`)
      })
      it("рендер false", () => {
        const container = document.createElement("div")
        update({ isActive: false })
        view.render({ container, context })
        expect(container.innerHTML, "рендер при условии false").toMatchStringHTML(
          html`<div><span>Inactive</span></div>`
        )
      })
    })

    describe("простой тернарный оператор с context с оберткой и соседними элементами", () => {
      const { context, update } = new Context((t) => ({ isActive: t.boolean.required(true) }))
      const view = new View({
        render: ({ html, context }) => html`
          <div>
            <header>Header</header>
            ${context.isActive ? html`<span>Active</span>` : html`<span>Inactive</span>`}
            <footer>Footer</footer>
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "простой тернарный оператор с context с оберткой и соседними элементами").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "header",
                type: "el",
                child: [
                  {
                    type: "text",
                    value: "Header",
                  },
                ],
              },
              {
                type: "cond",
                data: "/context/isActive",
                child: [
                  {
                    tag: "span",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "Active",
                      },
                    ],
                  },
                  {
                    tag: "span",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "Inactive",
                      },
                    ],
                  },
                ],
              },
              {
                tag: "footer",
                type: "el",
                child: [
                  {
                    type: "text",
                    value: "Footer",
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер true", () => {
        const container = document.createElement("div")
        update({ isActive: true })
        view.render({ container, context })
        expect(container.innerHTML, "рендер при условии true").toMatchStringHTML(html`
          <div>
            <header>Header</header>
            <span>Active</span>
            <footer>Footer</footer>
          </div>
        `)
      })
      it("рендер false", () => {
        const container = document.createElement("div")
        update({ isActive: false })
        view.render({ container, context })
        expect(container.innerHTML, "рендер при условии false").toMatchStringHTML(html`
          <div>
            <header>Header</header>
            <span>Inactive</span>
            <footer>Footer</footer>
          </div>
        `)
      })
    })

    describe("простой тернарный оператор с context без обертки", () => {
      const { context, update } = new Context((t) => ({ isActive: t.boolean.required(true) }))
      const view = new View({
        render: ({ html, context }) =>
          html`${context.isActive ? html`<span>Active</span>` : html`<span>Inactive</span>`}`,
      })
      it("парсинг", () => {
        expect(view.schema, "простой тернарный оператор с context без обертки").toEqual([
          {
            type: "cond",
            data: "/context/isActive",
            child: [
              {
                tag: "span",
                type: "el",
                child: [
                  {
                    type: "text",
                    value: "Active",
                  },
                ],
              },
              {
                tag: "span",
                type: "el",
                child: [
                  {
                    type: "text",
                    value: "Inactive",
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер true", () => {
        const container = document.createElement("div")
        update({ isActive: true })
        view.render({ container, context })
        expect(container.innerHTML, "рендер при условии true").toMatchStringHTML(html`<span>Active</span>`)
      })
      it("рендер false", () => {
        const container = document.createElement("div")
        update({ isActive: false })
        view.render({ container, context })
        expect(container.innerHTML, "рендер при условии false").toMatchStringHTML(html`<span>Inactive</span>`)
      })
    })

    describe("тернарный оператор с core", () => {
      const core = { requiredRole: "admin" }
      const { context, update } = new Context((t) => ({ userRole: t.string.required("user") }))
      const view = new View({
        render: ({ html, context, core }) =>
          html`<div>${context.userRole === core.requiredRole ? html`<h1>match</h1>` : html`<h1>mismatch</h1>`}</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "тернарный оператор с core").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "cond",
                data: ["/context/userRole", "/core/requiredRole"],
                expr: "${[0]} === ${[1]}",
                child: [
                  {
                    tag: "h1",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "match",
                      },
                    ],
                  },
                  {
                    tag: "h1",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "mismatch",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер match", () => {
        const container = document.createElement("div")
        update({ userRole: "admin" })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер при совпадении ролей").toMatchStringHTML(html`<div><h1>match</h1></div>`)
      })
      it("рендер mismatch", () => {
        const container = document.createElement("div")
        update({ userRole: "user" })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер при несовпадении ролей").toMatchStringHTML(
          html`<div><h1>mismatch</h1></div>`
        )
      })
    })

    describe("сравнение с определенным значением", () => {
      const { context, update } = new Context((t) => ({ userRole: t.string.required("user") }))
      const view = new View({
        render: ({ html, context }) =>
          html` <main>
            ${context.userRole === "admin"
              ? html`
                  <section class="admin-panel">
                    <h2>Admin Panel</h2>
                  </section>
                `
              : html`
                  <section class="user-panel">
                    <h2>User Panel</h2>
                  </section>
                `}
          </main>`,
      })
      it("парсинг", () => {
        expect(view.schema, "сравнение с определенным значением").toEqual([
          {
            tag: "main",
            type: "el",
            child: [
              {
                type: "cond",
                data: ["/context/userRole", "/admin"],
                expr: '${[0]} === "${[1]}"',
                child: [
                  {
                    tag: "section",
                    type: "el",
                    string: {
                      class: "admin-panel",
                    },
                    child: [
                      {
                        tag: "h2",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            value: "Admin Panel",
                          },
                        ],
                      },
                    ],
                  },
                  {
                    tag: "section",
                    type: "el",
                    string: {
                      class: "user-panel",
                    },
                    child: [
                      {
                        tag: "h2",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            value: "User Panel",
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
      it("рендер admin", () => {
        const container = document.createElement("div")
        update({ userRole: "admin" })
        view.render({ container, context })
        expect(container.innerHTML, "рендер для админа").toMatchStringHTML(html`
          <main>
            <section class="admin-panel">
              <h2>Admin Panel</h2>
            </section>
          </main>
        `)
      })
      it("рендер user", () => {
        const container = document.createElement("div")
        update({ userRole: "user" })
        view.render({ container, context })
        expect(container.innerHTML, "рендер для пользователя").toMatchStringHTML(html`
          <main>
            <section class="user-panel">
              <h2>User Panel</h2>
            </section>
          </main>
        `)
      })
    })

    describe("сравнение context и core (>)", () => {
      const core = { b: 5 }
      const { context, update, schema } = new Context((t) => ({ a: t.number.required(10) }))
      const view = new View<typeof schema>({
        render: ({ html, context, core }) =>
          html`<div>${context.a > core.b ? html`<span>A>B</span>` : html`<span>B>=A</span>`}</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "сравнение context и core (>)").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "cond",
                data: ["/context/a", "/core/b"],
                expr: "${[0]} > ${[1]}",
                child: [
                  {
                    tag: "span",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "A>B",
                      },
                    ],
                  },
                  {
                    tag: "span",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "B>=A",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер A>B", () => {
        const container = document.createElement("div")
        update({ a: 10 })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер когда A больше B").toMatchStringHTML(html`<div><span>A>B</span></div>`)
      })
      it("рендер B>=A", () => {
        const container = document.createElement("div")
        update({ a: 3 })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер когда B больше или равно A").toMatchStringHTML(
          html`<div><span>B>=A</span></div>`
        )
      })
    })

    describe("сравнение core и context (<=)", () => {
      const core = { b: 5 }
      const { context, update, schema } = new Context((t) => ({ a: t.number.required(10) }))
      const view = new View<typeof schema>({
        render: ({ html, core, context }) =>
          html`<section>${core.b <= context.a ? html`<p>ok</p>` : html`<p>no</p>`}</section>`,
      })
      it("парсинг", () => {
        expect(view.schema, "сравнение core и context (<=)").toEqual([
          {
            tag: "section",
            type: "el",
            child: [
              {
                type: "cond",
                data: ["/core/b", "/context/a"],
                expr: "${[0]} <= ${[1]}",
                child: [
                  {
                    tag: "p",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "ok",
                      },
                    ],
                  },
                  {
                    tag: "p",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "no",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер ok", () => {
        const container = document.createElement("div")
        update({ a: 10 })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер когда условие выполняется").toMatchStringHTML(
          html`<section><p>ok</p></section>`
        )
      })
      it("рендер no", () => {
        const container = document.createElement("div")
        update({ a: 3 })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер когда условие не выполняется").toMatchStringHTML(
          html`<section><p>no</p></section>`
        )
      })
    })

    it("строковое сравнение между полями (===, !==)", () => {
      const core = { requiredRole: "admin" }
      const { context, update } = new Context((t) => ({ role: t.string.required("user") }))
      const view = new View({
        render: ({ html, context, core }) =>
          html`<div>${context.role === core.requiredRole ? html`<h1>match</h1>` : html`<h1>mismatch</h1>`}</div>`,
      })
      expect(view.schema, "строковое сравнение между полями (===, !==)").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: ["/context/role", "/core/requiredRole"],
              expr: "${[0]} === ${[1]}",
              child: [
                {
                  tag: "h1",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "match",
                    },
                  ],
                },
                {
                  tag: "h1",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "mismatch",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ])
      it("рендер match", () => {
        const container = document.createElement("div")
        update({ role: "admin" })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер при совпадении ролей").toMatchStringHTML(html`<div><h1>match</h1></div>`)
      })
      it("рендер mismatch", () => {
        const container = document.createElement("div")
        update({ role: "user" })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер при несовпадении ролей").toMatchStringHTML(
          html`<div><h1>mismatch</h1></div>`
        )
      })
    })
  })

  describe("логические операторы", () => {
    describe("оператор && (логическое И)", () => {
      const { context, update } = new Context((t) => ({ isLoggedIn: t.boolean.required(true) }))
      const view = new View({
        render: ({ html, context }) =>
          html`<div>${context.isLoggedIn && html`<span class="user">Welcome!</span>`}</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "оператор && (логическое И)").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "log",
                data: "/context/isLoggedIn",
                child: [
                  {
                    tag: "span",
                    type: "el",
                    string: {
                      class: "user",
                    },
                    child: [
                      {
                        type: "text",
                        value: "Welcome!",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер true", () => {
        const container = document.createElement("div")
        update({ isLoggedIn: true })
        view.render({ container, context })
        expect(container.innerHTML, "рендер при логическом И true").toMatchStringHTML(
          html`<div><span class="user">Welcome!</span></div>`
        )
      })
      it("рендер false", () => {
        const container = document.createElement("div")
        update({ isLoggedIn: false })
        view.render({ container, context })
        expect(container.innerHTML, "рендер при логическом И false").toMatchStringHTML(html`<div></div>`)
      })
    })

    describe("оператор || с fallback", () => {
      const { context, update } = new Context((t) => ({ userName: t.string.required("") }))
      const view = new View({
        render: ({ html, context }) => html`<div>${context.userName || html`<span class="guest">Guest</span>`}</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "оператор || с fallback").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "span",
                type: "el",
                string: {
                  class: "guest",
                },
                child: [
                  {
                    type: "text",
                    value: "Guest",
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер с именем", () => {
        const container = document.createElement("div")
        update({ userName: "John" })
        view.render({ container, context })
        expect(container.innerHTML, "рендер когда есть имя пользователя").toMatchStringHTML(html`<div>John</div>`)
      })
      it("рендер fallback", () => {
        const container = document.createElement("div")
        update({ userName: "" })
        view.render({ container, context })
        expect(container.innerHTML, "рендер fallback для гостя").toMatchStringHTML(
          html`<div><span class="guest">Guest</span></div>`
        )
      })
    })
  })

  describe("условия в массивах", () => {
    describe("условный рендеринг элементов массива", () => {
      const core = {
        items: [
          { name: "Item 1", isActive: true },
          { name: "Item 2", isActive: false },
          { name: "Item 3", isActive: true },
        ],
      }
      const { context, update } = new Context((t) => ({
        itemNames: t.array.required(["Item 1", "Item 2", "Item 3"]),
      }))
      const view = new View({
        render: ({ html, context, core }) =>
          html`<div>
            ${core.items.map((item: { name: string; isActive: boolean }) =>
              item.isActive
                ? html`<span class="active">${item.name}</span>`
                : html`<span class="inactive">${item.name}</span>`
            )}
          </div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "условный рендеринг элементов массива").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "map",
                data: "/core/items",
                child: [
                  {
                    type: "cond",
                    data: "[item]/isActive",
                    child: [
                      {
                        tag: "span",
                        type: "el",
                        string: {
                          class: "active",
                        },
                        child: [
                          {
                            type: "text",
                            data: "[item]/name",
                          },
                        ],
                      },
                      {
                        tag: "span",
                        type: "el",
                        string: {
                          class: "inactive",
                        },
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
            ],
          },
        ])
      })
      it("рендер", () => {
        const container = document.createElement("div")
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер условных элементов массива").toMatchStringHTML(html`
          <div>
            <span class="active">Item 1</span>
            <span class="inactive">Item 2</span>
            <span class="active">Item 3</span>
          </div>
        `)
      })
    })

    describe("условие только с одной ветвью в массиве", () => {
      const core = {
        notifications: [
          { message: "Notification 1", hasAction: true },
          { message: "Notification 2", hasAction: false },
          { message: "Notification 3", hasAction: true },
        ],
      }
      const { context, update } = new Context((t) => ({
        notificationCount: t.number.required(3),
      }))
      const view = new View({
        render: ({ html, context, core }) => html`
          <div>
            ${core.notifications.map(
              (item: { message: string; hasAction: boolean }) => html`
                <div class="notification">
                  <p>${item.message}</p>
                  ${item.hasAction && html`<button>Action</button>`}
                </div>
              `
            )}
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "условие только с одной ветвью в массиве").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "map",
                data: "/core/notifications",
                child: [
                  {
                    tag: "div",
                    type: "el",
                    string: {
                      class: "notification",
                    },
                    child: [
                      {
                        tag: "p",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            data: "[item]/message",
                          },
                        ],
                      },
                      {
                        type: "log",
                        data: "[item]/hasAction",
                        child: [
                          {
                            tag: "button",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                value: "Action",
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
      it("рендер", () => {
        const container = document.createElement("div")
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер уведомлений с условными кнопками").toMatchStringHTML(html`
          <div>
            <div class="notification">
              <p>Notification 1</p>
              <button>Action</button>
            </div>
            <div class="notification">
              <p>Notification 2</p>
            </div>
            <div class="notification">
              <p>Notification 3</p>
              <button>Action</button>
            </div>
          </div>
        `)
      })
    })

    describe("map затем тернарный оператор как сосед", () => {
      const core = {
        items: [{ name: "Item 1" }, { name: "Item 2" }],
      }
      const { context, update } = new Context((t) => ({
        flag: t.boolean.required(true),
      }))
      const view = new View({
        render: ({ html, context, core }) => html`
          <div>
            ${core.items.map((item: { name: string }) => html`<span>${item.name}</span>`)}
            ${context.flag ? html`<p>Yes</p>` : html`<p>No</p>`}
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "map затем тернарный оператор как сосед").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "map",
                data: "/core/items",
                child: [
                  {
                    tag: "span",
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
              {
                type: "cond",
                data: "/context/flag",
                child: [
                  {
                    tag: "p",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "Yes",
                      },
                    ],
                  },
                  {
                    tag: "p",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "No",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер true", () => {
        const container = document.createElement("div")
        update({ flag: true })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер при флаге true").toMatchStringHTML(html`
          <div>
            <span>Item 1</span>
            <span>Item 2</span>
            <p>Yes</p>
          </div>
        `)
      })
      it("рендер false", () => {
        const container = document.createElement("div")
        update({ flag: false })
        view.render({ container, context, core })
        expect(container.innerHTML, "рендер при флаге false").toMatchStringHTML(html`
          <div>
            <span>Item 1</span>
            <span>Item 2</span>
            <p>No</p>
          </div>
        `)
      })
    })
  })

  describe("edge cases условий", () => {
    describe("пустые условные блоки", () => {
      const { context, update } = new Context((t) => ({ showEmpty: t.boolean.required(false) }))
      const view = new View({
        render: ({ html, context }) => html` <div>${context.showEmpty && html`<span>Not empty</span>`}</div> `,
      })
      it("парсинг", () => {
        expect(view.schema, "пустые условные блоки").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "log",
                data: "/context/showEmpty",
                child: [
                  {
                    tag: "span",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: "Not empty",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер showEmpty true", () => {
        const container = document.createElement("div")
        update({ showEmpty: true })
        view.render({ container, context })
        expect(container.innerHTML, "рендер пустого блока").toMatchStringHTML(html`<div><span>Not empty</span></div>`)
      })
      it("рендер showEmpty false", () => {
        const container = document.createElement("div")
        update({ showEmpty: false })
        view.render({ container, context })
        expect(container.innerHTML, "рендер непустого блока").toMatchStringHTML(html`<div></div>`)
      })
    })

    describe("вложенные условия", () => {
      const { context, update } = new Context((t) => ({
        hasPermission: t.boolean.required(true),
        isAdmin: t.boolean.required(true),
      }))
      const view = new View({
        render: ({ html, context }) => html`
          <div>
            ${context.hasPermission
              ? context.isAdmin
                ? html`
                    <div>
                      <button class="admin">Admin Action</button>
                    </div>
                  `
                : html`
                    <div>
                      <button class="user">User Action</button>
                    </div>
                  `
              : html`<div class="no-access">Access Denied</div>`}
          </div>
        `,
      })
      it("парсинг", () => {
        console.log(view.schema)
        expect(view.schema, "вложенные условия").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "cond",
                data: "/context/hasPermission",
                child: [
                  {
                    type: "cond",
                    data: "/context/isAdmin",
                    child: [
                      {
                        tag: "div",
                        type: "el",
                        child: [
                          {
                            tag: "button",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                value: "Admin Action",
                              },
                            ],
                            string: {
                              class: "admin",
                            },
                          },
                        ],
                      },
                      {
                        tag: "div",
                        type: "el",
                        child: [
                          {
                            tag: "button",
                            type: "el",
                            child: [
                              {
                                type: "text",
                                value: "User Action",
                              },
                            ],
                            string: {
                              class: "user",
                            },
                          },
                        ],
                      },
                    ],
                  },
                  {
                    tag: "div",
                    type: "el",
                    string: {
                      class: "no-access",
                    },
                    child: [
                      {
                        type: "text",
                        value: "Access Denied",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер admin", () => {
        const container = document.createElement("div")
        update({ hasPermission: true, isAdmin: true })
        view.render({ container, context })
        expect(container.innerHTML, "рендер для админа").toMatchStringHTML(html`
          <div>
            <div>
              <button class="admin">Admin Action</button>
            </div>
          </div>
        `)
      })
      it("рендер user", () => {
        const container = document.createElement("div")
        update({ hasPermission: true, isAdmin: false })
        view.render({ container, context })
        expect(container.innerHTML, "рендер для пользователя").toMatchStringHTML(html`
          <div>
            <div>
              <button class="user">User Action</button>
            </div>
          </div>
        `)
      })
      it("рендер no access", () => {
        const container = document.createElement("div")
        update({ hasPermission: false, isAdmin: false })
        view.render({ container, context })
        expect(container.innerHTML, "рендер без доступа").toMatchStringHTML(html`
          <div>
            <div class="no-access">Access Denied</div>
          </div>
        `)
      })
    })
  })
})
