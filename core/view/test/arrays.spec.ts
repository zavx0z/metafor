import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

describe("массивы", () => {
  const html = String.raw
  describe("массивы из context", () => {
    const { context, schema } = new Context((t) => ({ ids: t.array.required([1, 2]) }))

    describe("простой массив с одним элементом", () => {
      const view = new View<typeof schema>({
        render: ({ html, context }) => html`
          <ul>
            ${context.ids.map((id) => html`<li>${id}</li>`)}
          </ul>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "простой массив из контекста").toEqual([
          {
            tag: "ul",
            type: "el",
            child: [
              {
                tag: "li",
                type: "el",
                item: {
                  src: "context",
                  key: "ids",
                },

                child: [
                  {
                    type: "text",
                    value: {
                      src: ["context", "ids"],
                    },
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
        expect(element.innerHTML, "простой массив из контекста").toMatchStringHTML(html`
          <ul>
            <li>${context.ids[0]}</li>
            <li>${context.ids[1]}</li>
          </ul>
        `)
      })
    })
    describe("простой массив с одним элементом вложенный в другой элемент", () => {
      const view = new View<typeof schema>({
        render: ({ html, context }) => html`
          <div>
            <ul>
              ${context.ids.map((id) => html`<li>${id}</li>`)}
            </ul>
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "простой массив из контекста").toEqual([
          {
            type: "el",
            tag: "div",
            child: [
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
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ context, container: element })
        expect(element.innerHTML, "простой массив из контекста").toMatchStringHTML(html`
          <div>
            <ul>
              <li>${context.ids[0]}</li>
              <li>${context.ids[1]}</li>
            </ul>
          </div>
        `)
      })
    })

    describe("массив с множественными свойствами", () => {
      const core = {
        users: [
          { name: "John", email: "john@example.com", role: "admin" },
          { name: "Jane", email: "jane@example.com", role: "user" },
        ],
      } as const
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`
          <div>
            ${core.users.map(
              (user) => html`
                <div class="user">
                  <h3>${user.name}</h3>
                  <p>${user.email}</p>
                  <span>${user.role}</span>
                </div>
              `
            )}
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "массив с множественными свойствами").toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                tag: "div",
                type: "el",
                item: {
                  src: "core",
                  key: "users",
                },
                attrs: { class: "user" },
                child: [
                  {
                    tag: "h3",
                    type: "el",
                    child: [{ type: "text", value: { src: ["core", "users"], key: "name" } }],
                  },
                  {
                    tag: "p",
                    type: "el",
                    child: [{ type: "text", value: { src: ["core", "users"], key: "email" } }],
                  },
                  {
                    tag: "span",
                    type: "el",
                    child: [{ type: "text", value: { src: ["core", "users"], key: "role" } }],
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
        expect(element.innerHTML, "массив с множественными свойствами").toMatchStringHTML(html`
          <div>
            <div class="user">
              <h3>${core.users[0].name}</h3>
              <p>${core.users[0].email}</p>
              <span>${core.users[0].role}</span>
            </div>
            <div class="user">
              <h3>${core.users[1].name}</h3>
              <p>${core.users[1].email}</p>
              <span>${core.users[1].role}</span>
            </div>
          </div>
        `)
      })
    })

    describe("массив с динамическими атрибутами", () => {
      const core = {
        items: [
          { id: 1, type: "item", title: "Item 1" },
          { id: 2, type: "item", title: "Item 2" },
        ],
      } as const
      const view = new View<any, typeof core>({
        render: ({ html, core }) => html`
          <section>
            ${core.items.map(
              (item) => html`
                <article data-id="${item.id}" class="item-${item.type}">
                  <h2>${item.title}</h2>
                </article>
              `
            )}
          </section>
        `,
      })

      it("парсинг", () => {
        expect(view.schema, "массив с динамическими атрибутами").toEqual([
          {
            tag: "section",
            type: "el",

            child: [
              {
                tag: "article",
                type: "el",
                item: {
                  src: "core",
                  key: "items",
                },
                attrs: {
                  "data-id": {
                    src: ["core", "items"],
                    key: "id",
                  },
                  class: {
                    items: [{ src: ["core", "items"], key: "type" }],
                    template: "item-${0}",
                  },
                },
                child: [
                  {
                    tag: "h2",
                    type: "el",
                    child: [{ type: "text", value: { src: ["core", "items"], key: "title" } }],
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
        console.log(element.innerHTML)
        expect(element.innerHTML, "массив с динамическими атрибутами").toMatchStringHTML(html`
          <section>
            <article data-id="${core.items[0].id}" class="item-${core.items[0].type}">
              <h2>${core.items[0].title}</h2>
            </article>
            <article data-id="${core.items[1].id}" class="item-${core.items[1].type}">
              <h2>${core.items[1].title}</h2>
            </article>
          </section>
        `)
      })
    })
  })

  describe("массивы из core", () => {
    describe("простой массив из core", () => {
      const view = new View({
        render: ({ html, core }) =>
          html`<nav>${core.menuItems.map((item: any) => html`<a href="${item.url}">${item.label}</a>`)}</nav>`,
      })
      it("парсинг", () => {
        expect(view.schema, "простой массив из core").toEqual([
          {
            tag: "nav",
            type: "el",
            child: [
              {
                tag: "a",
                type: "el",
                item: {
                  src: "core",
                  key: "menuItems",
                },
                attrs: {
                  href: {
                    src: ["core", "menuItems"],
                    key: "url",
                  },
                },
                child: [
                  {
                    type: "text",
                    value: {
                      src: ["core", "menuItems"],
                      key: "label",
                    },
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер", () => {})
    })

    describe("сложная структура из core", () => {
      const view = new View({
        render: ({ html, core }) =>
          html`<main class="products">
            ${core.products.map(
              (product: any) =>
                html`<div class="product-card" data-product-id="${product.id}">
                  <img src="${product.image}" alt="${product.name}" />
                  <h3 class="product-title">${product.name}</h3>
                  <p class="product-price">$${product.price}</p>
                  <button class="add-to-cart" data-id="${product.id}">Add to Cart</button>
                </div>`
            )}
          </main>`,
      })
      it("парсинг", () => {
        expect(view.schema, "сложная структура из core").toEqual([
          {
            tag: "main",
            type: "el",
            attrs: { class: "products" },
            child: [
              {
                tag: "div",
                type: "el",
                item: {
                  src: "core",
                  key: "products",
                },
                attrs: {
                  class: "product-card",
                  "data-product-id": {
                    key: "id",
                    src: ["core", "products"],
                  },
                },
                child: [
                  {
                    tag: "img",
                    type: "el",
                    attrs: {
                      src: {
                        src: ["core", "products"],
                        key: "image",
                      },
                      alt: {
                        src: ["core", "products"],
                        key: "name",
                      },
                    },
                  },
                  {
                    tag: "h3",
                    type: "el",
                    attrs: {
                      class: "product-title",
                    },
                    child: [
                      {
                        type: "text",
                        value: {
                          src: ["core", "products"],
                          key: "name",
                        },
                      },
                    ],
                  },
                  {
                    tag: "p",
                    type: "el",
                    attrs: {
                      class: "product-price",
                    },
                    child: [
                      {
                        type: "text",
                        value: "$",
                      },
                      {
                        type: "text",
                        value: {
                          src: ["core", "products"],
                          key: "price",
                        },
                      },
                    ],
                  },
                  {
                    tag: "button",
                    type: "el",
                    attrs: {
                      class: "add-to-cart",
                      "data-id": {
                        src: ["core", "products"],
                        key: "id",
                      },
                    },
                    child: [
                      {
                        type: "text",
                        value: "Add to Cart",
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер", () => {})
    })
  })

  describe("смешанный контент с массивами", () => {
    describe("массив между статическими элементами", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<div class="container">
            <header>
              <h1>User List</h1>
            </header>
            ${context.users.map(
              (user: any) =>
                html`<div class="user-item">
                  <span class="name">${user.name}</span>
                  <span class="email">${user.email}</span>
                </div>`
            )}
            <footer>
              <p>Total users: ${context.totalCount}</p>
            </footer>
          </div>`,
      })

      it("парсинг", () => {
        expect(view.schema, "массив между статическими элементами").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: "container",
            },
            child: [
              {
                tag: "header",
                type: "el",

                child: [
                  {
                    tag: "h1",
                    type: "el",

                    child: [
                      {
                        type: "text",
                        value: "User List",
                      },
                    ],
                  },
                ],
              },
              {
                tag: "div",
                type: "el",
                item: {
                  src: "context",
                  key: "users",
                },
                attrs: {
                  class: "user-item",
                },
                child: [
                  {
                    tag: "span",
                    type: "el",
                    attrs: {
                      class: "name",
                    },
                    child: [
                      {
                        type: "text",
                        value: {
                          src: ["context", "users"],
                          key: "name",
                        },
                      },
                    ],
                  },
                  {
                    tag: "span",
                    type: "el",
                    attrs: {
                      class: "email",
                    },
                    child: [
                      {
                        type: "text",
                        value: {
                          src: ["context", "users"],
                          key: "email",
                        },
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
                    tag: "p",
                    type: "el",

                    child: [
                      {
                        type: "text",
                        value: {
                          items: [
                            {
                              src: "context",
                              key: "totalCount",
                            },
                          ],
                          template: "Total users: ${0}",
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
      it("рендер", () => {})
    })

    describe("множественные массивы в одном шаблоне - оба массива парсятся как соседние элементы", () => {
      const view = new View({
        render: ({ html, context, core }) =>
          html`<div class="dashboard">
            ${context.categories.map((cat: any) => html`<span class="category">${cat.name}</span>`)}
            ${core.items.map(
              (item: any) =>
                html`<div class="item" data-category="${item.categoryId}">
                  <h4>${item.title}</h4>
                </div>`
            )}
          </div>`,
      })

      it("парсинг", () => {
        expect(
          view.schema,
          "множественные массивы в одном шаблоне - оба массива парсятся как соседние элементы"
        ).toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: "dashboard",
            },
            child: [
              {
                tag: "span",
                type: "el",
                attrs: { class: "category" },
                item: {
                  src: "context",
                  key: "categories",
                },
                child: [
                  {
                    type: "text",
                    value: {
                      src: ["context", "categories"],
                      key: "name",
                    },
                  },
                ],
              },
              {
                tag: "div",
                type: "el",
                item: {
                  src: "core",
                  key: "items",
                },
                attrs: {
                  class: "item",
                  "data-category": {
                    src: ["core", "items"],
                    key: "categoryId",
                  },
                },
                child: [
                  {
                    tag: "h4",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        value: {
                          src: ["core", "items"],
                          key: "title",
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
      it("рендер", () => {})
    })
  })

  describe("edge cases массивов", () => {
    describe("пустой элемент в массиве", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<ul>
            ${context.items.map((item: any) => html`<li></li>`)}
          </ul>`,
      })
      it("парсинг", () => {
        expect(view.schema, "пустой элемент в массиве").toEqual([
          {
            tag: "ul",
            type: "el",

            child: [
              {
                tag: "li",
                type: "el",
                item: {
                  src: "context",
                  key: "items",
                },
              },
            ],
          },
        ])
      })
      it("рендер", () => {})
    })

    describe("самозакрывающиеся теги в массиве", () => {
      const view = new View({
        render: ({ html, core }) =>
          html`<div class="images">
            ${core.images.map((img: any) => html`<img src="${img.url}" alt="${img.alt}" />`)}
          </div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "самозакрывающиеся теги в массиве").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: "images",
            },
            child: [
              {
                tag: "img",
                type: "el",
                item: {
                  src: "core",
                  key: "images",
                },
                attrs: {
                  src: {
                    src: ["core", "images"],
                    key: "url",
                  },
                  alt: {
                    src: ["core", "images"],
                    key: "alt",
                  },
                },
              },
            ],
          },
        ])
      })
      it("рендер", () => {})
    })

    describe("только текст в элементе массива", () => {
      const view = new View({
        render: ({ html, context }) =>
          html`<ol>
            ${context.steps.map((step: any) => html`<li>${step}</li>`)}
          </ol>`,
      })
      it("парсинг", () => {
        expect(view.schema, "только текст в элементе массива").toEqual([
          {
            tag: "ol",
            type: "el",
            child: [
              {
                tag: "li",
                type: "el",
                item: {
                  src: "context",
                  key: "steps",
                },

                child: [
                  {
                    type: "text",
                    value: {
                      src: ["context", "steps"],
                    },
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер", () => {})
    })
  })
  describe("массив вложенный в массив", () => {
    type Core = {
      items: {
        id: number
        children: {
          name: string
        }[]
      }[]
    }
    const view = new View({
      render: ({ html, core }) =>
        html`<ul>
          ${core.items.map(
            (item: any) => html`<li>${item.children.map((child: any) => html`<span>${child}</span>`)}</li>`
          )}
        </ul>`,
    })

    it("парсинг", () => {
      expect(view.schema, "массив вложенный в массив").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              item: {
                src: "core",
                key: "items",
              },
              child: [
                {
                  tag: "span",
                  type: "el",
                  item: {
                    src: ["core", "items"],
                    key: "children",
                  },
                  child: [
                    {
                      type: "text",
                      value: {
                        src: ["core", "items", "children"],
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
    it("рендер", () => {})
  })

  describe("массив в массиве в массиве (3 уровня)", () => {
    type Core = {
      items: {
        id: number
        children: {
          name: string
          tags: { label: string }[]
        }[]
      }[]
    }
    const view = new View({
      render: ({ html, core }) =>
        html`<ul>
          ${core.items.map(
            (item: any) =>
              html`<li>
                ${item.children.map(
                  (child: any) => html`<div>${child.tags.map((tag: any) => html`<span>${tag}</span>`)}</div>`
                )}
              </li>`
          )}
        </ul>`,
    })

    it("парсинг", () => {
      expect(view.schema, "массив в массиве в массиве (3 уровня)").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              tag: "li",
              type: "el",
              item: { src: "core", key: "items" },
              child: [
                {
                  tag: "div",
                  type: "el",
                  item: { src: ["core", "items"], key: "children" },
                  child: [
                    {
                      tag: "span",
                      type: "el",
                      item: { src: ["core", "items", "children"], key: "tags" },
                      child: [
                        {
                          type: "text",
                          value: { src: ["core", "items", "children", "tags"] },
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
    it("рендер", () => {})
  })
})
