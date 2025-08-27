import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

describe("массивы", () => {
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
            ],
          },
        ])
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
                type: "map",
                data: "/core/users",
                child: [
                  {
                    tag: "div",
                    type: "el",
                    string: {
                      class: "user",
                    },
                    child: [
                      {
                        tag: "h3",
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
                            data: "[item]/email",
                          },
                        ],
                      },
                      {
                        tag: "span",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            data: "[item]/role",
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
                type: "map",
                data: "/core/items",
                child: [
                  {
                    tag: "article",
                    type: "el",
                    string: {
                      "data-id": {
                        data: "[item]/id",
                      },
                      class: {
                        data: "[item]/type",
                        expr: "item-${0}",
                      },
                    },
                    child: [
                      {
                        tag: "h2",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            data: "[item]/title",
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
                type: "map",
                data: "/core/menuItems",
                child: [
                  {
                    tag: "a",
                    type: "el",
                    string: {
                      href: {
                        data: "[item]/url",
                      },
                    },
                    child: [
                      {
                        type: "text",
                        data: "[item]/label",
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
            string: {
              class: "products",
            },
            child: [
              {
                type: "map",
                data: "/core/products",
                child: [
                  {
                    tag: "div",
                    type: "el",
                    string: {
                      class: "product-card",
                      "data-product-id": {
                        data: "[item]/id",
                      },
                    },
                    child: [
                      {
                        tag: "img",
                        type: "el",
                        string: {
                          src: {
                            data: "[item]/image",
                          },
                          alt: {
                            data: "[item]/name",
                          },
                        },
                      },
                      {
                        tag: "h3",
                        type: "el",
                        string: {
                          class: "product-title",
                        },
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
                        string: {
                          class: "product-price",
                        },
                        child: [
                          {
                            type: "text",
                            data: "[item]/price",
                            expr: "$${0}",
                          },
                        ],
                      },
                      {
                        tag: "button",
                        type: "el",
                        string: {
                          class: "add-to-cart",
                          "data-id": {
                            data: "[item]/id",
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
            ],
          },
        ])
      })
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
            string: {
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
                type: "map",
                data: "/context/users",
                child: [
                  {
                    tag: "div",
                    type: "el",
                    string: {
                      class: "user-item",
                    },
                    child: [
                      {
                        tag: "span",
                        type: "el",
                        string: {
                          class: "name",
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
                          class: "email",
                        },
                        child: [
                          {
                            type: "text",
                            data: "[item]/email",
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
                            data: "[item]/context/totalCount",
                            expr: "Total users: ${0}",
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
            string: {
              class: "dashboard",
            },
            child: [
              {
                type: "map",
                data: "/context/categories",
                child: [
                  {
                    tag: "span",
                    type: "el",
                    string: {
                      class: "category",
                    },
                    child: [
                      {
                        type: "text",
                        data: "[item]/name",
                      },
                    ],
                  },
                  {
                    tag: "div",
                    type: "el",
                    string: {
                      class: "item",
                      "data-category": {
                        data: "[item]/item/categoryId",
                      },
                    },
                    child: [
                      {
                        tag: "h4",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            data: "[item]/item/title",
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
                type: "map",
                data: "/context/items",
                child: [
                  {
                    tag: "li",
                    type: "el",
                  },
                ],
              },
            ],
          },
        ])
      })
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
            string: {
              class: "images",
            },
            child: [
              {
                type: "map",
                data: "/core/images",
                child: [
                  {
                    tag: "img",
                    type: "el",
                    string: {
                      src: {
                        data: "[item]/url",
                      },
                      alt: {
                        data: "[item]/alt",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ])
      })
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
                type: "map",
                data: "/context/steps",
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
              type: "map",
              data: "/core/items",
              child: [
                {
                  tag: "li",
                  type: "el",
                  child: [
                    {
                      type: "map",
                      data: "[item]/children",
                      child: [
                        {
                          tag: "span",
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
              type: "map",
              data: "/core/items",
              child: [
                {
                  tag: "li",
                  type: "el",
                  child: [
                    {
                      type: "map",
                      data: "[item]/children",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          child: [
                            {
                              type: "map",
                              data: "[item]/tags",
                              child: [
                                {
                                  tag: "span",
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
              ],
            },
          ],
        },
      ])
    })
  })
})
