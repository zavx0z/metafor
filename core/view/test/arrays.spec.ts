import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
import { Context } from "../../context/index.ts"

const html = String.raw

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

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element, context: { ids: [1, 2] } })
        expect(element.innerHTML).toMatchStringHTML(html`
          <ul>
            <li>1</li>
            <li>2</li>
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

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element, context: { ids: [1, 2] } })
        expect(element.innerHTML).toMatchStringHTML(html`
          <div>
            <ul>
              <li>1</li>
              <li>2</li>
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
      }
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

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          container: element,
          core: {
            users: [
              { name: "John", email: "john@example.com", role: "admin" },
              { name: "Jane", email: "jane@example.com", role: "user" },
            ],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`
          <div>
            <div class="user">
              <h3>John</h3>
              <p>john@example.com</p>
              <span>admin</span>
            </div>
            <div class="user">
              <h3>Jane</h3>
              <p>jane@example.com</p>
              <span>user</span>
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
      }
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
                        expr: "item-${[0]}",
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

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          container: element,
          core: {
            items: [
              { id: 1, type: "item", title: "Item 1" },
              { id: 2, type: "item", title: "Item 2" },
            ],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`
          <section>
            <article data-id="1" class="item-item">
              <h2>Item 1</h2>
            </article>
            <article data-id="2" class="item-item">
              <h2>Item 2</h2>
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

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          container: element,
          core: {
            menuItems: [
              { url: "/home", label: "Home" },
              { url: "/about", label: "About" },
              { url: "/contact", label: "Contact" },
            ],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`
          <nav>
            <a href="/home">Home</a>
            <a href="/about">About</a>
            <a href="/contact">Contact</a>
          </nav>
        `)
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
                            expr: "$${[0]}",
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

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          container: element,
          core: {
            products: [
              {
                id: 1,
                name: "Product 1",
                price: 29.99,
                image: "/images/product1.jpg",
              },
              {
                id: 2,
                name: "Product 2",
                price: 49.99,
                image: "/images/product2.jpg",
              },
            ],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`
          <main class="products">
            <div class="product-card" data-product-id="1">
              <img src="/images/product1.jpg" alt="Product 1" />
              <h3 class="product-title">Product 1</h3>
              <p class="product-price">$29.99</p>
              <button class="add-to-cart" data-id="1">Add to Cart</button>
            </div>
            <div class="product-card" data-product-id="2">
              <img src="/images/product2.jpg" alt="Product 2" />
              <h3 class="product-title">Product 2</h3>
              <p class="product-price">$49.99</p>
              <button class="add-to-cart" data-id="2">Add to Cart</button>
            </div>
          </main>
        `)
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
                            expr: "Total users: ${[0]}",
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
        const element = document.createElement("div")
        view.render({
          container: element,
          context: {
            users: [
              { name: "John Doe", email: "john@example.com" },
              { name: "Jane Smith", email: "jane@example.com" },
            ],
            totalCount: 2,
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`
          <div class="container">
            <header>
              <h1>User List</h1>
            </header>
            <div class="user-item">
              <span class="name">John Doe</span>
              <span class="email">john@example.com</span>
            </div>
            <footer>
              <p>Total users: undefined</p>
            </footer>
            <div class="user-item">
              <span class="name">Jane Smith</span>
              <span class="email">jane@example.com</span>
            </div>
            <footer>
              <p>Total users: undefined</p>
            </footer>
          </div>
        `)
      })
    })

    describe("множественные массивы в одном шаблоне - оба массива парсятся как соседние элементы", () => {
      const { context, schema } = new Context((t) => ({
        categories: t.array.required(["Electronics", "Books"]),
      }))
      type Core = {
        items: {
          categoryId: number
          title: string
        }[]
      }
      const view = new View<typeof schema, Core>({
        render: ({ html, context, core }) => html`
          <div class="dashboard">
            ${context.categories.map((cat) => html`<span class="category">${cat}</span>`)}
            ${core.items.map(
              (item) => html`
                <div class="item" data-category="${item.categoryId}">
                  <h4>${item.title}</h4>
                </div>
              `
            )}
          </div>
        `,
      })
      it("парсинг", () => {
        expect(
          view.schema,
          "множественные массивы в одном шаблоне - оба массива парсятся как соседние элементы"
        ).toEqual([
          {
            tag: "div",
            type: "el",
            child: [
              {
                type: "map",
                data: "/context/categories",
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
                    string: {
                      class: "category",
                    },
                  },
                ],
              },
              {
                type: "map",
                data: "/core/items",
                child: [
                  {
                    tag: "div",
                    type: "el",
                    child: [
                      {
                        tag: "h4",
                        type: "el",
                        child: [
                          {
                            type: "text",
                            data: "[item]/title",
                          },
                        ],
                      },
                    ],
                    string: {
                      class: "item",
                      "data-category": {
                        data: "[item]/categoryId",
                      },
                    },
                  },
                ],
              },
            ],
            string: {
              class: "dashboard",
            },
          },
        ])
      })

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          container: element,
          context: {
            categories: ["Electronics", "Books"],
          },
          core: {
            items: [
              { categoryId: 1, title: "Laptop" },
              { categoryId: 2, title: "Novel" },
            ],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`
          <div class="dashboard">
            <span class="category">Electronics</span>
            <span class="category">Books</span>
            <div class="item" data-category="1">
              <h4>Laptop</h4>
            </div>
            <div class="item" data-category="2">
              <h4>Novel</h4>
            </div>
          </div>
        `)
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

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          container: element,
          context: {
            items: [1, 2, 3],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`
          <ul>
            <li></li>
            <li></li>
            <li></li>
          </ul>
        `)
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

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          container: element,
          core: {
            images: [
              { url: "/images/photo1.jpg", alt: "Photo 1" },
              { url: "/images/photo2.jpg", alt: "Photo 2" },
            ],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`
          <div class="images">
            <img src="/images/photo1.jpg" alt="Photo 1" />
            <img src="/images/photo2.jpg" alt="Photo 2" />
          </div>
        `)
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

      it("рендер", () => {
        const element = document.createElement("div")
        view.render({
          container: element,
          context: {
            steps: ["Step 1", "Step 2", "Step 3"],
          },
        })
        expect(element.innerHTML).toMatchStringHTML(html`
          <ol>
            <li>Step 1</li>
            <li>Step 2</li>
            <li>Step 3</li>
          </ol>
        `)
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
    const view = new View<any, Core>({
      render: ({ html, core }) =>
        html`<ul>
          ${core.items.map(
            (item) => html` <li>${item.children.map((child) => html`<span>${child.name}</span>`)}</li> `
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
          ],
        },
      ])
    })

    it("рендер", () => {
      const element = document.createElement("div")
      view.render({
        container: element,
        core: {
          items: [
            {
              id: 1,
              children: [{ name: "Child 1" }, { name: "Child 2" }],
            },
            {
              id: 2,
              children: [{ name: "Child 3" }],
            },
          ],
        },
      })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li>
            <span>Child 1</span>
            <span>Child 2</span>
          </li>
          <li>
            <span>Child 3</span>
          </li>
        </ul>
      `)
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
    const view = new View<any, Core>({
      render: ({ html, core }) =>
        html`<ul>
          ${core.items.map(
            (item) =>
              html`<li>
                ${item.children.map(
                  (child) => html` <div>${child.tags.map((tag) => html`<span>${tag.label}</span>`)}</div>`
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
                                      data: "[item]/label",
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

    it("рендер", () => {
      const element = document.createElement("div")
      view.render({
        container: element,
        core: {
          items: [
            {
              id: 1,
              children: [
                {
                  name: "Child 1",
                  tags: [{ label: "Tag 1" }, { label: "Tag 2" }],
                },
              ],
            },
            {
              id: 2,
              children: [
                {
                  name: "Child 2",
                  tags: [{ label: "Tag 3" }],
                },
              ],
            },
          ],
        },
      })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li>
            <div>
              <span>Tag 1</span>
              <span>Tag 2</span>
            </div>
          </li>
          <li>
            <div>
              <span>Tag 3</span>
            </div>
          </li>
        </ul>
      `)
    })
  })
})
