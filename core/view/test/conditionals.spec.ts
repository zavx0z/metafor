import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
const html = String.raw
describe("условные блоки", () => {
  describe("тернарный оператор", () => {
    describe("тернарий и && в атрибутах + сложные классы и enum после массива", () => {
      const view = new View({
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
              ${context.list.map((item: string) => html`<li>${item}</li>`)}
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
            attrs: {
              class: { src: "context", key: "className" },
              id: { src: "context", key: "id" },
              "data-text": { src: "context", key: "text" },
            },
            child: [
              {
                tag: "img",
                type: "el",
                attrs: {
                  class: { src: "context", key: "className", result: "image ${context.className}-image" },
                  src: "test.jpg",
                  visible: {
                    src: "context",
                    key: "visible",
                    trueValue: "visible",
                    falseValue: "hidden",
                    type: "conditional",
                  },
                  alt: { src: "context", key: "text" },
                },
              },
              { tag: "br", type: "el" },
              {
                tag: "button",
                type: "el",
                attrs: {
                  class: {
                    src: "context",
                    key: "className",
                    result: "button-${context.className} ${context.className}-button",
                  },
                  disabled: {
                    src: "context",
                    key: "disabled",
                    trueValue: "disabled",
                    falseValue: undefined,
                    type: "conditional",
                  },
                },
                child: [{ type: "text", value: { src: "context", key: "text" } }],
              },
              {
                tag: "ul",
                type: "el",
                child: [
                  {
                    tag: "li",
                    type: "el",
                    item: { src: "context", key: "list" },
                    child: [{ type: "text", value: { src: ["context", "list"] } }],
                  },
                ],
              },
              {
                tag: "div",
                type: "el",
                attrs: { class: "enum" },
                child: [{ type: "text", value: "enum element div" }],
                cond: { src: "context", key: "enum", eq: "div" },
              },
              {
                tag: "span",
                type: "el",
                attrs: { class: "enum" },
                child: [{ type: "text", value: "enum element span" }],
                cond: { src: "context", key: "enum", eq: "span" },
              },
              {
                tag: "p",
                type: "el",
                attrs: { class: "enum" },
                child: [{ type: "text", value: "enum element p" }],
                cond: { src: "context", key: "enum", eq: "p" },
              },
            ],
          },
        ]))
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            className: "test",
            list: ["1", "2", "3"],
            id: "test",
            text: "test",
          },
        })
        expect(element.innerHTML).toMatchStringHTML(
          html`<div class="test" id="test" data-text="test">
            <img class="image test-image" src="test.jpg" visible="hidden" alt="test" /><br />
            <button class="button-test test-button" disabled="">test</button>
            <ul>
              <li>1</li>
              <li>2</li>
              <li>3</li>
            </ul>
          </div>`
        )
      })
    })
    describe("простой тернарный оператор с context", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<div>${context.isVisible ? html`<span>Visible</span>` : html`<span>Hidden</span>`}</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "простой тернарный оператор с context").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "span",
                type: "el",
                cond: {
                  src: "context",
                  key: "isVisible",
                  eq: true,
                },
                child: [
                  {
                    type: "text",
                    value: "Visible",
                  },
                ],
              },
              {
                tag: "span",
                type: "el",
                cond: {
                  src: "context",
                  key: "isVisible",
                  eq: false,
                },
                child: [
                  {
                    type: "text",
                    value: "Hidden",
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            isVisible: true,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`<div><span>Visible</span></div>`)
      })
    })
    describe("простой тернарный оператор с context с оберткой и соседними элементами", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<div>
            <span>1</span>
            <div>2</div>
            ${context.isVisible ? html`<span>Visible</span>` : html`<span>Hidden</span>`}<span>3</span>
          </div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "простой тернарный оператор с context с оберткой и соседними элементами").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "span",
                type: "el",
                child: [{ type: "text", value: "1" }],
              },
              {
                tag: "div",
                type: "el",
                child: [{ type: "text", value: "2" }],
              },
              {
                tag: "span",
                type: "el",
                cond: {
                  src: "context",
                  key: "isVisible",
                  eq: true,
                },
                child: [
                  {
                    type: "text",
                    value: "Visible",
                  },
                ],
              },
              {
                tag: "span",
                type: "el",
                cond: {
                  src: "context",
                  key: "isVisible",
                  eq: false,
                },
                child: [
                  {
                    type: "text",
                    value: "Hidden",
                  },
                ],
              },
              {
                tag: "span",
                type: "el",
                child: [{ type: "text", value: "3" }],
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            isVisible: true,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(
          html`<div>
            <span>1</span>
            <div>2</div>
            <span>Visible</span><span>3</span>
          </div>`
        )
      })
    })
    describe("простой тернарный оператор с context без обертки", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<div></div>
            ${context.isVisible ? html`<span>Visible</span>` : html`<span>Hidden</span>`}`,
      })
      it("парсинг", () => {
        expect(view.schema, "простой тернарный оператор с context без обертки").toEqual([
          {
            tag: "div",
            type: "el",
          },
          {
            tag: "span",
            type: "el",
            cond: {
              src: "context",
              key: "isVisible",
              eq: true,
            },
            child: [
              {
                type: "text",
                value: "Visible",
              },
            ],
          },
          {
            tag: "span",
            type: "el",
            cond: {
              src: "context",
              key: "isVisible",
              eq: false,
            },
            child: [
              {
                type: "text",
                value: "Hidden",
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            isVisible: true,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(
          html`<div></div>
            <span>Visible</span>`
        )
      })
    })
    describe("тернарный оператор с core", () => {
      const view = new View({
        render: ({ html, core }) =>
          html`<div>${core.showMenu ? html`<nav>Menu</nav>` : html`<div>No menu</div>`}</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "тернарный оператор с core").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "nav",
                type: "el",
                cond: {
                  src: "core",
                  key: "showMenu",
                  eq: true,
                },
                child: [
                  {
                    type: "text",
                    value: "Menu",
                  },
                ],
              },
              {
                tag: "div",
                type: "el",
                cond: {
                  src: "core",
                  key: "showMenu",
                  eq: false,
                },
                child: [
                  {
                    type: "text",
                    value: "No menu",
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {
            showMenu: true,
          },
          update: () => ({}),
          state: "",
          element,
          context: {},
        })
        expect(element.innerHTML).toMatchStringHTML(html`<div><nav>Menu</nav></div>`)
      })
    })

    describe("сравнение с определенным значением", () => {
      const view = new View({
        render: ({ html, context }) => html`<main>
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
                tag: "section",
                type: "el",
                cond: {
                  src: "context",
                  key: "userRole",
                  eq: "admin",
                },
                attrs: {
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
                cond: {
                  src: "context",
                  key: "userRole",
                  notEq: "admin",
                },
                attrs: {
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
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            userRole: "admin",
          },
        })
        expect(element.innerHTML).toMatchStringHTML(
          html`<main>
            <section class="admin-panel"><h2>Admin Panel</h2></section>
          </main>`
        )
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
                tag: "span",
                type: "el",
                cond: { src: "context", key: "a", gt: { src: "core", key: "b" } as any },
                child: [{ type: "text", value: "A>B" }],
              },
              {
                tag: "span",
                type: "el",
                cond: { src: "context", key: "a", lte: { src: "core", key: "b" } as any },
                child: [{ type: "text", value: "B>=A" }],
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {
            b: 5,
          },
          update: () => ({}),
          state: "",
          element,
          context: {
            a: 10,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`<div></div>`)
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
                tag: "p",
                type: "el",
                cond: { src: "core", key: "b", lte: { src: "context", key: "a" } as any },
                child: [{ type: "text", value: "ok" }],
              },
              {
                tag: "p",
                type: "el",
                cond: { src: "core", key: "b", gt: { src: "context", key: "a" } as any },
                child: [{ type: "text", value: "no" }],
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {
            b: 5,
          },
          update: () => ({}),
          state: "",
          element,
          context: {
            a: 3,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`<section></section>`)
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
              tag: "h1",
              type: "el",
              cond: { src: "context", key: "role", eq: { src: "core", key: "requiredRole" } as any },
              child: [{ type: "text", value: "match" }],
            },
            {
              tag: "h1",
              type: "el",
              cond: { src: "context", key: "role", notEq: { src: "core", key: "requiredRole" } as any },
              child: [{ type: "text", value: "mismatch" }],
            },
          ],
        },
      ])
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {
            requiredRole: "admin",
          },
          update: () => ({}),
          state: "",
          element,
          context: {
            role: "admin",
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`<div><h1>match</h1></div>`)
      })
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
                cond: {
                  src: "context",
                  key: "isLoggedIn",
                  eq: true,
                },
                attrs: {
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
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            isLoggedIn: true,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`<div><span class="user">Welcome!</span></div>`)
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
                cond: {
                  src: "context",
                  key: "userName",
                  eq: null, // fallback когда userName пустой
                },
                attrs: {
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
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            userName: null,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`<div><span class="guest">Guest</span></div>`)
      })
    })
  })

  describe("условия в массивах", () => {
    describe("условный рендеринг элементов массива", () => {
      const view = new View({
        render: ({ html, context }) => html`<ul>
          ${context.items.map(
            (item: { isVisible: boolean; name: string }) => html`
              <li>${item.isVisible ? html`<span>${item.name}</span>` : html`<span class="hidden">Hidden</span>`}</li>
            `
          )}
        </ul> `,
      })
      it("парсинг", () => {
        expect(view.schema, "условный рендеринг элементов массива").toEqual([
          {
            tag: "ul",
            type: "el",
            child: [
              {
                tag: "li",
                type: "el",
                child: [
                  {
                    tag: "span",
                    type: "el",
                    cond: {
                      src: "item",
                      key: "isVisible",
                      eq: true,
                    },
                    child: [
                      {
                        type: "text",
                        value: {
                          src: "item",
                          key: "name",
                        },
                      },
                    ],
                  },
                  {
                    tag: "span",
                    type: "el",
                    cond: {
                      src: "item",
                      key: "isVisible",
                      eq: false,
                    },
                    attrs: {
                      class: "hidden",
                    },
                    child: [
                      {
                        type: "text",
                        value: "Hidden",
                      },
                    ],
                  },
                ],
                item: {
                  src: "context",
                  key: "items",
                },
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            items: [
              { isVisible: true, name: "Item 1" },
              { isVisible: false, name: "Item 2" },
            ],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(
          html`<ul>
            <li><span>Item 1</span></li>
            <li><span class="hidden">Hidden</span></li>
          </ul>`
        )
      })
    })

    describe("условие только с одной ветвью в массиве", () => {
      const view = new View({
        render: ({ html, context }) => html`<div>
          ${context.notifications.map(
            (notification: { message: string; hasAction: boolean }) => html`
              <div class="notification">
                <p>${notification.message}</p>
                ${notification.hasAction && html`<button>Action</button>`}
              </div>
            `
          )}
        </div> `,
      })
      it("парсинг", () => {
        expect(view.schema, "условие только с одной ветвью в массиве").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "div",
                type: "el",
                attrs: {
                  class: "notification",
                },
                child: [
                  {
                    tag: "p",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: {
                          src: ["context", "notifications"],
                          key: "message",
                        },
                      },
                    ],
                  },
                  {
                    tag: "button",
                    type: "el",
                    cond: {
                      src: "item",
                      key: "hasAction",
                      eq: true,
                    },
                    child: [
                      {
                        type: "text",
                        value: "Action",
                      },
                    ],
                  },
                ],
                item: {
                  src: "context",
                  key: "notifications",
                },
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            notifications: [
              { message: "Hello", hasAction: true },
              { message: "World", hasAction: false },
            ],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(
          html`<div>
            <div class="notification">
              <p></p>
              <button>Action</button>
            </div>
            <div class="notification"><p></p></div>
          </div>`
        )
      })
    })

    describe("map затем тернарный оператор как сосед", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<div>
            ${context.items.map((item: { name: string }) => html`<span>${item.name}</span>`)}${context.flag
              ? html`<p>Yes</p>`
              : html`<p>No</p>`}
          </div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "map затем тернарный оператор как сосед").toEqual([
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
                    value: { src: ["context", "items"], key: "name" },
                  },
                ],
                item: { src: "context", key: "items" },
              },
              {
                tag: "p",
                type: "el",
                cond: { src: "context", key: "flag", eq: true },
                child: [{ type: "text", value: "Yes" }],
              },
              {
                tag: "p",
                type: "el",
                cond: { src: "context", key: "flag", eq: false },
                child: [{ type: "text", value: "No" }],
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            items: [{ name: "Item 1" }, { name: "Item 2" }],
            flag: true,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(
          html`<div>
            <span></span><span></span>
            <p>Yes</p>
          </div>`
        )
      })
    })
  })
  describe("edge cases условий", () => {
    describe("пустые условные блоки", () => {
      const view = new View({
        render: ({ html, context }) => html`<div>${context.showEmpty ? html`` : html`<span>Not empty</span>`}</div>`,
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
                cond: {
                  src: "context",
                  key: "showEmpty",
                  eq: false,
                },
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
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            showEmpty: false,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`<div><span>Not empty</span></div>`)
      })
    })

    describe("вложенные условия", () => {
      const view = new View({
        render: ({ html, context }) => html`<div>
          ${context.hasPermission
            ? html`
                <div>
                  ${context.isAdmin
                    ? html`<button class="admin">Admin Action</button>`
                    : html`<button class="user">User Action</button>`}
                </div>
              `
            : html`<div class="no-access">Access Denied</div>`}
        </div> `,
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
                cond: {
                  src: "context",
                  key: "hasPermission",
                  eq: true,
                },
                child: [
                  {
                    tag: "button",
                    type: "el",
                    cond: {
                      src: "context",
                      key: "isAdmin",
                      eq: true,
                    },
                    attrs: {
                      class: "admin",
                    },
                    child: [
                      {
                        type: "text",
                        value: "Admin Action",
                      },
                    ],
                  },
                  {
                    tag: "button",
                    type: "el",
                    cond: {
                      src: "context",
                      key: "isAdmin",
                      eq: false,
                    },
                    attrs: {
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
              {
                tag: "div",
                type: "el",
                cond: {
                  src: "context",
                  key: "hasPermission",
                  eq: false,
                },
                attrs: {
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
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          core: {},
          update: () => ({}),
          state: "",
          element,
          context: {
            hasPermission: true,
            isAdmin: true,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(
          html`<div>
            <div><button class="admin">Admin Action</button></div>
          </div>`
        )
      })
    })
  })
})
