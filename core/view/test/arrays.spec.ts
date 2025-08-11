import { describe, it, expect } from "bun:test"
import { parseTemplate } from "../parser/index.ts"
import type { Schema } from "../parser/index.ts"

describe("массивы", () => {
  describe("массивы из context", () => {
    describe("простой массив с одним элементом", () => {
      const result = parseTemplate(`<ul>
        \${context.ids.map((id) => html\`<li>\${id}</li>\`)}
      </ul>`)

      const expected: Schema = [
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
      ]

      it("парсинг", () => {
        expect(result, "простой массив из контекста").toEqual(expected)
      })
      it("рендер", () => {})
    })
    describe("простой массив с одним элементом вложенный в другой элемент", () => {
      const result = parseTemplate(`<div><ul>
        \${context.ids.map((id) => html\`<li>\${id}</li>\`)}
      </ul></div>`)

      const expected: Schema = [
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
          ],
        },
      ]

      it("парсинг", () => {
        expect(result, "простой массив из контекста").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("массив с множественными свойствами", () => {
      const result = parseTemplate(`<div>
        \${context.users.map((user) => html\`<div class="user">
          <h3>\${user.name}</h3>
          <p>\${user.email}</p>
          <span>\${user.role}</span>
        </div>\`)}
      </div>`)

      const expected: Schema = [
        {
          tag: "div",
          type: "el",

          child: [
            {
              tag: "div",
              type: "el",
              item: {
                src: "context",
                key: "users",
              },
              attrs: {
                class: "user",
              },
              child: [
                {
                  tag: "h3",
                  type: "el",

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
                  tag: "p",
                  type: "el",

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
                {
                  tag: "span",
                  type: "el",

                  child: [
                    {
                      type: "text",
                      value: {
                        src: ["context", "users"],
                        key: "role",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]

      it("парсинг", () => {
        expect(result, "массив с множественными свойствами").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("массив с динамическими атрибутами", () => {
      const result = parseTemplate(`<section>
        \${context.items.map((item) => html\`<article data-id="\${item.id}" class="item-\${item.type}">
          <h2>\${item.title}</h2>
        </article>\`)}
      </section>`)

      const expected: Schema = [
        {
          tag: "section",
          type: "el",

          child: [
            {
              tag: "article",
              type: "el",
              item: {
                src: "context",
                key: "items",
              },
              attrs: {
                "data-id": {
                  src: ["context", "items"],
                  key: "id",
                },
                class: {
                  src: ["context", "items"],
                  key: "type",
                  result: "item-${VALUE}",
                },
              },
              child: [
                {
                  tag: "h2",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: {
                        src: ["context", "items"],
                        key: "title",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]

      it("парсинг", () => {
        expect(result, "массив с динамическими атрибутами").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("массивы из core", () => {
    describe("простой массив из core", () => {
      const result = parseTemplate(`<nav>
        \${core.menuItems.map((item) => html\`<a href="\${item.url}">\${item.label}</a>\`)}
      </nav>`)

      const expected: Schema = [
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
      ]

      it("парсинг", () => {
        expect(result, "простой массив из core").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("сложная структура из core", () => {
      const result = parseTemplate(`<main class="products">
        \${core.products.map((product) => html\`<div class="product-card" data-product-id="\${product.id}">
          <img src="\${product.image}" alt="\${product.name}" />
          <h3 class="product-title">\${product.name}</h3>
          <p class="product-price">\$\${product.price}</p>
          <button class="add-to-cart" data-id="\${product.id}">Add to Cart</button>
        </div>\`)}
      </main>`)

      const expected: Schema = [
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
      ]

      it("парсинг", () => {
        expect(result, "сложная структура из core").toEqual(expected)
      })
      it("рендер", () => {})
    })
  })

  describe("смешанный контент с массивами", () => {
    describe("массив между статическими элементами", () => {
      const result = parseTemplate(`<div class="container">
        <header>
          <h1>User List</h1>
        </header>
        \${context.users.map((user) => html\`<div class="user-item">
          <span class="name">\${user.name}</span>
          <span class="email">\${user.email}</span>
        </div>\`)}
        <footer>
          <p>Total users: \${context.totalCount}</p>
        </footer>
      </div>`)

      const expected: Schema = [
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
                        src: "context",
                        key: "totalCount",
                        result: "Total users: ${context.totalCount}",
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]

      it("парсинг", () => {
        expect(result, "массив между статическими элементами").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("множественные массивы в одном шаблоне - оба массива парсятся как соседние элементы", () => {
      const result = parseTemplate(`<div class="dashboard">
        \${context.categories.map((cat) => html\`<span class="category">\${cat.name}</span>\`)}
        \${core.items.map((item) => html\`<div class="item" data-category="\${item.categoryId}">
          <h4>\${item.title}</h4>
        </div>\`)}
      </div>`)

      const expected: Schema = [
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
      ]

      it("парсинг", () => {
        expect(result, "множественные массивы в одном шаблоне - оба массива парсятся как соседние элементы").toEqual(
          expected
        )
      })
      it("рендер", () => {})
    })
  })

  describe("edge cases массивов", () => {
    describe("пустой элемент в массиве", () => {
      const result = parseTemplate(`<ul>
        \${context.items.map((item) => html\`<li></li>\`)}
      </ul>`)

      const expected: Schema = [
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
      ]

      it("парсинг", () => {
        expect(result, "пустой элемент в массиве").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("самозакрывающиеся теги в массиве", () => {
      const result = parseTemplate(`<div class="images">
        \${core.images.map((img) => html\`<img src="\${img.url}" alt="\${img.alt}" />\`)}
      </div>`)

      const expected: Schema = [
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
      ]

      it("парсинг", () => {
        expect(result, "самозакрывающиеся теги в массиве").toEqual(expected)
      })
      it("рендер", () => {})
    })

    describe("только текст в элементе массива", () => {
      const result = parseTemplate(`<ol>
        \${context.steps.map((step) => html\`<li>\${step}</li>\`)}
      </ol>`)

      const expected: Schema = [
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
      ]

      it("парсинг", () => {
        expect(result, "только текст в элементе массива").toEqual(expected)
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
    const result = parseTemplate(`<ul>
      \${core.items.map((item) => html\`<li>\${item.children.map((child) => html\`<span>\${child}</span>\`)}</li>\`)}
    </ul>`)

    const expected: Schema = [
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
    ]
    it("парсинг", () => {
      expect(result, "массив вложенный в массив").toEqual(expected)
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
    const result = parseTemplate(`<ul>
      \
      \${core.items.map((item) => html\`<li>
        \${item.children.map((child) => html\`<div>
          \${child.tags.map((tag) => html\`<span>\${tag}</span>\`)}
        </div>\`)}
      </li>\`)}
    </ul>`)

    const expected: Schema = [
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
    ]

    it("парсинг", () => {
      expect(result, "массив в массиве в массиве (3 уровня)").toEqual(expected)
    })
    it("рендер", () => {})
  })
})
