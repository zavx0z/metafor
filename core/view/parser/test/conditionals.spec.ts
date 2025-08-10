import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../index.ts"
import type { Schema } from "../index.ts"

describe("Template Parser - условные блоки", () => {
  describe("тернарный оператор", () => {
    it("простой тернарный оператор с context", () => {
      const result = parseTemplate(
        `<div>\${context.isVisible ? html\`<span>Visible</span>\` : html\`<span>Hidden</span>\`}</div>`
      )
      const expected: Schema = [
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
      ]
      expect(result, "простой тернарный оператор с context").toEqual(expected)
    })
    it("простой тернарный оператор с context с оберткой и соседними элементами", () => {
      const result = parseTemplate(
        `<div><span>1</span><div>2</div>\${context.isVisible ? html\`<span>Visible</span>\` : html\`<span>Hidden</span>\`}<span>3</span></div>`
      )
      const expected: Schema = [
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
      ]
      expect(result, "простой тернарный оператор с context с оберткой и соседними элементами").toEqual(expected)
    })
    it("простой тернарный оператор с context без обертки", () => {
      const result = parseTemplate(
        `<div></div>
        \${context.isVisible ? html\`<span>Visible</span>\` : html\`<span>Hidden</span>\`}`
      )
      const expected: Schema = [
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
      ]
      expect(result, "простой тернарный оператор с context без обертки").toEqual(expected)
    })
    it("тернарный оператор с core", () => {
      const result = parseTemplate(
        `<div>\${core.showMenu ? html\`<nav>Menu</nav>\` : html\`<div>No menu</div>\`}</div>`
      )
      const expected: Schema = [
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
      ]
      expect(result, "тернарный оператор с core").toEqual(expected)
    })

    it("сравнение с определенным значением", () => {
      const result = parseTemplate(`
        <main>
          \${context.userRole === "admin" ? html\`
            <section class="admin-panel">
              <h2>Admin Panel</h2>
            </section>
          \` : html\`
            <section class="user-panel">
              <h2>User Panel</h2>
            </section>
          \`}
        </main>
      `)
      const expected: Schema = [
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
      ]
      expect(result, "сравнение с определенным значением").toEqual(expected)
    })

    it("сравнение context и core (>)", () => {
      const result = parseTemplate(`
        <div>
          ${"${context.a > core.b ? html`<span>A>B</span>` : html`<span>B>=A</span>`}"}
        </div>
      `)
      const expected: Schema = [
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
      ]
      expect(result, "сравнение context и core (>)").toEqual(expected)
    })

    it("сравнение core и context (<=)", () => {
      const result = parseTemplate(`
        <section>
          ${"${core.b <= context.a ? html`<p>ok</p>` : html`<p>no</p>`}"}
        </section>
      `)
      const expected: Schema = [
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
      ]
      expect(result, "сравнение core и context (<=)").toEqual(expected)
    })

    it("строковое сравнение между полями (===, !==)", () => {
      const result = parseTemplate(`
        <div>
          ${"${context.role === core.requiredRole ? html`<h1>match</h1>` : html`<h1>mismatch</h1>`}"}
        </div>
      `)
      const expected: Schema = [
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
      ]
      expect(result, "строковое сравнение между полями (===, !==)").toEqual(expected)
    })
  })

  describe("логические операторы", () => {
    it("оператор && (логическое И)", () => {
      const result = parseTemplate(`<div>\${context.isLoggedIn && html\`<span class="user">Welcome!</span>\`}</div>`)
      const expected: Schema = [
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
      ]
      expect(result, "оператор && (логическое И)").toEqual(expected)
    })

    it("оператор || с fallback", () => {
      const result = parseTemplate(`<div>\${context.userName || html\`<span class="guest">Guest</span>\`}</div>`)
      const expected: Schema = [
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
      ]
      expect(result, "оператор || с fallback").toEqual(expected)
    })
  })

  describe("условия в массивах", () => {
    it("условный рендеринг элементов массива", () => {
      const result = parseTemplate(`
        <ul>
          \${context.items.map((item) => html\`
            <li>
              \${item.isVisible ? html\`<span>\${item.name}</span>\` : html\`<span class="hidden">Hidden</span>\`}
            </li>
          \`)}
        </ul>
      `)
      const expected: Schema = [
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
      ]
      expect(result, "условный рендеринг элементов массива").toEqual(expected)
    })

    it("условие только с одной ветвью в массиве", () => {
      const result = parseTemplate(`
        <div>
          \${context.notifications.map((notification) => html\`
            <div class="notification">
              <p>\${notification.message}</p>
              \${notification.hasAction && html\`<button>Action</button>\`}
            </div>
          \`)}
        </div>
      `)
      const expected: Schema = [
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
                        src: "item",
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
      ]
      expect(result, "условие только с одной ветвью в массиве").toEqual(expected)
    })

    it("map затем тернарный оператор как сосед", () => {
      const tpl = [
        "<div>",
        "${context.items.map((item) => html`<span>${item.name}</span>`)}",
        "${context.flag ? html`<p>Yes</p>` : html`<p>No</p>`}",
        "</div>",
      ].join("\n")
      const result = parseTemplate(tpl)
      const expected: Schema = [
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
                  value: { src: "item", key: "name" },
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
      ]
      expect(result, "map затем тернарный оператор как сосед").toEqual(expected)
    })
  })

  describe("edge cases условий", () => {
    it("пустые условные блоки", () => {
      const result = parseTemplate(`<div>\${context.showEmpty ? html\`\` : html\`<span>Not empty</span>\`}</div>`)
      const expected: Schema = [
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
      ]
      expect(result, "пустые условные блоки").toEqual(expected)
    })

    it("вложенные условия", () => {
      const result = parseTemplate(`
        <div>
          \${context.hasPermission ? html\`
            <div>
              \${context.isAdmin ? html\`<button class="admin">Admin Action</button>\` : html\`<button class="user">User Action</button>\`}
            </div>
          \` : html\`<div class="no-access">Access Denied</div>\`}
        </div>
      `)
      const expected: Schema = [
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
      ]
      expect(result, "вложенные условия").toEqual(expected)
    })
  })
})
