import { describe, it, expect, beforeAll } from "bun:test"
import { parse } from "../../../index.ts"
import type { NodeType } from "@metafor/types/template/node/index"

describe("логические операторы в map", () => {
  describe("простой логический оператор в map", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{}, { users: Array<{ name: string; hasAvatar: boolean }> }>(
        ({ html, mass }) => html`
          <div>
            ${mass.users.map(
              (user) => html`
                <div class="user">
                  ${user.hasAvatar && html`<img src="/avatar/${user.name}.jpg" alt="${user.name}" />`}
                  <span>${user.name}</span>
                </div>
              `,
            )}
          </div>
        `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/users",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "user",
                  },
                  child: [
                    {
                      type: "log",
                      data: "[item]/hasAvatar",
                      child: [
                        {
                          tag: "img",
                          type: "el",
                          string: {
                            src: {
                              data: "[item]/name",
                              expr: "/avatar/${_[0]}.jpg",
                            },
                            alt: {
                              data: "[item]/name",
                            },
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
  })

  describe("логический оператор с вложенными элементами в map", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{}, { posts: Array<{ title: string; author: { name: string; isVerified: boolean } }> }>(
        ({ html, mass }) => html`
          <div>
            ${mass.posts.map(
              (post) => html`
                <article class="post">
                  <h2>${post.title}</h2>
                  ${post.author.isVerified &&
                  html`
                    <div class="author-verified">
                      <span class="verified-badge">VERIFIED</span>
                      <span>${post.author.name}</span>
                    </div>
                  `}
                </article>
              `,
            )}
          </div>
        `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/posts",
              child: [
                {
                  tag: "article",
                  type: "el",
                  string: {
                    class: "post",
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
                    {
                      type: "log",
                      data: "[item]/author/isVerified",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "author-verified",
                          },
                          child: [
                            {
                              tag: "span",
                              type: "el",
                              string: {
                                class: "verified-badge",
                              },
                              child: [
                                {
                                  type: "text",
                                  value: "VERIFIED",
                                },
                              ],
                            },
                            {
                              tag: "span",
                              type: "el",
                              child: [
                                {
                                  type: "text",
                                  data: "[item]/author/name",
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

  describe("логический оператор с самозакрывающимся тегом в map", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{}, { items: Array<{ name: string; isNew: boolean }> }>(
        ({ html, mass }) => html`
          <ul>
            ${mass.items.map(
              (item) => html`
                <li class="item">
                  ${item.isNew && html`<span class="new-badge">NEW</span>`}
                  <span>${item.name}</span>
                </li>
              `,
            )}
          </ul>
        `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/items",
              child: [
                {
                  tag: "li",
                  type: "el",
                  string: {
                    class: "item",
                  },
                  child: [
                    {
                      type: "log",
                      data: "[item]/isNew",
                      child: [
                        {
                          tag: "span",
                          type: "el",
                          string: {
                            class: "new-badge",
                          },
                          child: [
                            {
                              type: "text",
                              value: "NEW",
                            },
                          ],
                        },
                      ],
                    },
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
      ])
    })
  })

  describe("сложный логический оператор в map", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<
        { showDetails: { type: "boolean" } },
        { products: Array<{ name: string; price: number; inStock: boolean }> }
      >(
        ({ html, mass, value }) => html`
          <div>
            ${mass.products.map(
              (product) => html`
                <div class="product">
                  <h3>${product.name}</h3>
                  <p class="price">$${product.price}</p>
                  ${product.inStock &&
                  value.showDetails &&
                  html`
                    <div class="product-details">
                      <span class="stock-status">In Stock</span>
                      <button class="add-to-cart">Add to Cart</button>
                    </div>
                  `}
                </div>
              `,
            )}
          </div>
        `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/products",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "product",
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
                      string: {
                        class: "price",
                      },
                      child: [
                        {
                          type: "text",
                          data: "[item]/price",
                          expr: "$${_[0]}",
                        },
                      ],
                    },
                    {
                      type: "log",
                      data: ["[item]/inStock", "[item]/value/showDetails"],
                      expr: "_[0] && _[1]",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "product-details",
                          },
                          child: [
                            {
                              tag: "span",
                              type: "el",
                              string: {
                                class: "stock-status",
                              },
                              child: [
                                {
                                  type: "text",
                                  value: "In Stock",
                                },
                              ],
                            },
                            {
                              tag: "button",
                              type: "el",
                              string: {
                                class: "add-to-cart",
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
              ],
            },
          ],
        },
      ])
    })
  })

  describe("логический оператор с простым условием в map", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{}, { notifications: Array<{ message: string; isImportant: boolean }> }>(
        ({ html, mass }) => html`
          <div>
            ${mass.notifications.map(
              (notification) => html`
                <div class="notification">
                  ${notification.isImportant && html`<span class="important">!</span>`}
                  <span class="message">${notification.message}</span>
                </div>
              `,
            )}
          </div>
        `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/notifications",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "notification",
                  },
                  child: [
                    {
                      type: "log",
                      data: "[item]/isImportant",
                      child: [
                        {
                          tag: "span",
                          type: "el",
                          string: {
                            class: "important",
                          },
                          child: [
                            {
                              type: "text",
                              value: "!",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      tag: "span",
                      type: "el",
                      string: {
                        class: "message",
                      },
                      child: [
                        {
                          type: "text",
                          data: "[item]/message",
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

  describe("логический оператор с вложенным map", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<
        {},
        { categories: Array<{ name: string; hasSubcategories: boolean; subcategories: Array<{ name: string }> }> }
      >(
        ({ html, mass }) => html`
          <div>
            ${mass.categories.map(
              (category) => html`
                <div class="category">
                  <h2>${category.name}</h2>
                  ${category.hasSubcategories &&
                  html`
                    <ul class="subcategories">
                      ${category.subcategories.map((sub) => html` <li>${sub.name}</li> `)}
                    </ul>
                  `}
                </div>
              `,
            )}
          </div>
        `,
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/categories",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "category",
                  },
                  child: [
                    {
                      tag: "h2",
                      type: "el",
                      child: [
                        {
                          type: "text",
                          data: "[item]/name",
                        },
                      ],
                    },
                    {
                      type: "log",
                      data: "[item]/hasSubcategories",
                      child: [
                        {
                          tag: "ul",
                          type: "el",
                          string: {
                            class: "subcategories",
                          },
                          child: [
                            {
                              type: "map",
                              data: "[item]/subcategories",
                              child: [
                                {
                                  tag: "li",
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
              ],
            },
          ],
        },
      ])
    })
  })
})
