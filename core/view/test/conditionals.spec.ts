import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

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
                : context.enum === "p"
                  ? html`<p class="enum">enum element p</p>`
                  : null}
          </div>
        `,
      })
      it("парсинг", () =>
        expect(view.schema, "тернарий и && в атрибутах + сложные классы и enum после массива").toEqual([
          {
            tag: "div",
            type: "el",
            string: {
              class: { data: "/context/className" },
              id: { data: "/context/id" },
              "data-text": { data: "/context/text" },
            },
            child: [
              {
                tag: "img",
                type: "el",
                array: {
                  class: [{ value: "image" }, { data: "/context/className", expr: "${[0]}-image" }],
                },
                boolean: {
                  hidden: {
                    data: "/context/visible",
                    expr: "!${[0]}",
                  },
                  visible: {
                    data: "/context/visible",
                  },
                },
                string: {
                  alt: { data: "/context/text" },
                  src: "test.jpg",
                },
              },
              { tag: "br", type: "el" },
              {
                tag: "button",
                type: "el",
                array: {
                  class: [
                    { data: "/context/className", expr: "button-${[0]}" },
                    { data: "/context/className", expr: "${[0]}-button" },
                  ],
                },
                boolean: { disabled: { data: "/context/disabled" } },
                child: [{ type: "text", data: "/context/text" }],
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
                        child: [{ type: "text", data: "[item]" }],
                      },
                    ],
                  },
                ],
              },
              {
                tag: "div",
                type: "el",
                string: {
                  class: "enum",
                },
                child: [
                  {
                    type: "text",
                    value: "enum element div",
                  },
                ],
              },
              {
                type: "cond",
                data: ["/context/enum", "/div"],
                expr: '${[0]} === "${[1]}"',
                true: {
                  tag: "span",
                  type: "el",
                  string: {
                    class: "enum",
                  },
                  child: [
                    {
                      type: "text",
                      value: "enum element span",
                    },
                  ],
                },
                false: {
                  tag: "p",
                  type: "el",
                  string: {
                    class: "enum",
                  },
                  child: [
                    {
                      type: "text",
                      value: "enum element p",
                    },
                  ],
                },
              },
            ],
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
            <div class="enum">enum element div</div>
          </div>
        `)
      })
    })

    describe("простой тернарный оператор с context", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<div>${context.isActive ? html`<span>Active</span>` : html`<span>Inactive</span>`}</div>`,
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
                true: {
                  tag: "span",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "Active",
                    },
                  ],
                },
                false: {
                  tag: "span",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "Inactive",
                    },
                  ],
                },
              },
            ],
          },
        ])
      })
    })

    describe("простой тернарный оператор с context с оберткой и соседними элементами", () => {
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
                type: "cond",
                data: "/context/isActive",
                true: {
                  tag: "span",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "Inactive",
                    },
                  ],
                },
                false: {
                  tag: "footer",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "Footer",
                    },
                  ],
                },
              },
            ],
          },
        ])
      })
    })

    describe("простой тернарный оператор с context без обертки", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`${context.isActive ? html`<span>Active</span>` : html`<span>Inactive</span>`}`,
      })
      it("парсинг", () => {
        expect(view.schema, "простой тернарный оператор с context без обертки").toEqual([
          {
            type: "cond",
            data: "/context/isActive",
            true: {
              tag: "span",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "Active",
                },
              ],
            },
            false: {
              tag: "span",
              type: "el",
              child: [
                {
                  type: "text",
                  value: "Inactive",
                },
              ],
            },
          },
        ])
      })
    })

    describe("тернарный оператор с core", () => {
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
                true: {
                  tag: "h1",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "match",
                    },
                  ],
                },
                false: {
                  tag: "h1",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "mismatch",
                    },
                  ],
                },
              },
            ],
          },
        ])
      })
    })

    describe("сравнение с определенным значением", () => {
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
                true: {
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
                false: {
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
              },
            ],
          },
        ])
      })
    })

    describe("сравнение context и core (>)", () => {
      const view = new View({
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
                true: {
                  tag: "span",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "A>B",
                    },
                  ],
                },
                false: {
                  tag: "span",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "B>=A",
                    },
                  ],
                },
              },
            ],
          },
        ])
      })
    })

    describe("сравнение core и context (<=)", () => {
      const view = new View({
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
                true: {
                  tag: "p",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "ok",
                    },
                  ],
                },
                false: {
                  tag: "p",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "no",
                    },
                  ],
                },
              },
            ],
          },
        ])
      })
    })

    it("строковое сравнение между полями (===, !==)", () => {
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
              true: {
                tag: "h1",
                type: "el",
                child: [
                  {
                    type: "text",
                    value: "match",
                  },
                ],
              },
              false: {
                tag: "h1",
                type: "el",
                child: [
                  {
                    type: "text",
                    value: "mismatch",
                  },
                ],
              },
            },
          ],
        },
      ])
    })
  })

  describe("логические операторы", () => {
    describe("оператор && (логическое И)", () => {
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
        ])
      })
    })

    describe("оператор || с fallback", () => {
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
    })
  })

  describe("условия в массивах", () => {
    describe("условный рендеринг элементов массива", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<div>
            ${context.items.map((item: { name: string; isActive: boolean }) =>
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
                data: "/context/items",
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
        ])
      })
    })

    describe("условие только с одной ветвью в массиве", () => {
      const view = new View({
        render: ({ html, context }) => html`
          <div>
            ${context.notifications.map(
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
                data: "/context/notifications",
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
        ])
      })
    })

    describe("map затем тернарный оператор как сосед", () => {
      const view = new View({
        render: ({ html, context }) => html`
          <div>
            ${context.items.map((item: { name: string }) => html`<span>${item.name}</span>`)}
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
                data: "/context/items",
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
    })
  })

  describe("edge cases условий", () => {
    describe("пустые условные блоки", () => {
      const view = new View({
        render: ({ html, context }) => html` <div>${context.showEmpty ? html`` : html`<span>Not empty</span>`}</div> `,
      })
      it("парсинг", () => {
        expect(view.schema, "пустые условные блоки").toEqual([
          {
            tag: "div",
            type: "el",
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
        ])
      })
    })

    describe("вложенные условия", () => {
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
        expect(view.schema, "вложенные условия").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "div",
                type: "el",
                child: [
                  {
                    tag: "button",
                    type: "el",
                    string: {
                      class: "admin",
                    },
                    child: [
                      {
                        type: "text",
                        value: "Admin Action",
                      },
                    ],
                  },
                ],
              },
              {
                type: "cond",
                data: "/context/hasPermission",
                true: {
                  tag: "div",
                  type: "el",
                  child: [
                    {
                      tag: "button",
                      type: "el",
                      string: {
                        class: "user",
                      },
                      child: [
                        {
                          type: "text",
                          value: "User Action",
                        },
                      ],
                    },
                  ],
                },
                false: {
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
              },
            ],
          },
        ])
      })
    })
  })
})
