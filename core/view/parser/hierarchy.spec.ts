import { describe, expect, it } from "bun:test"
import { extractHtmlElements, extractMainHtmlBlock } from "./splitter"
import { makeHierarchy } from "./hierarchy"

describe("hierarchy", () => {
  it("map в элементе вложенный в map", () => {
    const mainHtml = extractMainHtmlBlock<any, { list: { title: string; nested: string[] }[] }>(
      ({ html, core }) => html`
        <ul>
          ${core.list.map(
            ({ title, nested }) => html`
              <li>
                <p>${title}</p>
                ${nested.map((n) => html`<em>${n}</em>`)}
              </li>
            `
          )}
        </ul>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "ul",
        type: "el",
        text: "<ul>",
        child: [
          {
            type: "map",
            text: "core.list.map(({ title, nested })`",
            child: [
              {
                tag: "li",
                type: "el",
                text: "<li>",
                child: [
                  {
                    tag: "p",
                    type: "el",
                    text: "<p>",
                    child: [
                      {
                        type: "text",
                        text: "${title}",
                      },
                    ],
                  },
                  {
                    type: "map",
                    text: "nested.map((n)`",
                    child: [
                      {
                        tag: "em",
                        type: "el",
                        text: "<em>",
                        child: [
                          {
                            type: "text",
                            text: "${n}",
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
  it("map в условии", () => {
    const mainHtml = extractMainHtmlBlock<{ flag: boolean }, { list: { title: string; nested: string[] }[] }>(
      ({ html, core, context }) => html`
        ${context.flag
          ? html`<ul>
              ${core.list.map(({ title, nested }) => html`<li>${title} ${nested.map((n) => html`<em>${n}</em>`)}</li>`)}
            </ul>`
          : html`<div>x</div>`}
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        type: "cond",
        text: "context.flag",
        true: {
          tag: "ul",
          type: "el",
          text: "<ul>",
          child: [
            {
              type: "map",
              text: "core.list.map(({ title, nested })`",
              child: [
                {
                  tag: "li",
                  type: "el",
                  text: "<li>",
                  child: [
                    {
                      type: "text",
                      text: "${title} ",
                    },
                    {
                      type: "map",
                      text: "nested.map((n)`",
                      child: [
                        {
                          tag: "em",
                          type: "el",
                          text: "<em>",
                          child: [
                            {
                              type: "text",
                              text: "${n}",
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
        false: {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              type: "text",
              text: "x",
            },
          ],
        },
      },
    ])
  })

  it("условие с простым текстом", () => {
    const mainHtml = extractMainHtmlBlock<{ flag: boolean }, {}>(
      ({ html, context }) => html` ${context.flag ? html`<div>Show</div>` : html`<span>Hide</span>`} `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        type: "cond",
        text: "context.flag",
        true: {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              type: "text",
              text: "Show",
            },
          ],
        },
        false: {
          tag: "span",
          type: "el",
          text: "<span>",
          child: [
            {
              type: "text",
              text: "Hide",
            },
          ],
        },
      },
    ])
  })

  it("map с простыми элементами", () => {
    const mainHtml = extractMainHtmlBlock<any, { items: string[] }>(
      ({ html, core }) => html`
        <ul>
          ${core.items.map((item) => html`<li>${item}</li>`)}
        </ul>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "ul",
        type: "el",
        text: "<ul>",
        child: [
          {
            type: "map",
            text: "core.items.map((item)`",
            child: [
              {
                tag: "li",
                type: "el",
                text: "<li>",
                child: [
                  {
                    type: "text",
                    text: "${item}",
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
  })

  it("условие внутри map", () => {
    const mainHtml = extractMainHtmlBlock<{ showDetails: boolean }, { users: { name: string; admin: boolean }[] }>(
      ({ html, core, context }) => html`
        <div>
          ${core.users.map(
            (user) => html`
              <div>
                <span>${user.name}</span>
                ${user.admin ? html`<strong>Admin</strong>` : html`<em>User</em>`}
              </div>
            `
          )}
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            type: "map",
            text: "core.users.map((user)`",
            child: [
              {
                tag: "div",
                type: "el",
                text: "<div>",
                child: [
                  {
                    tag: "span",
                    type: "el",
                    text: "<span>",
                    child: [
                      {
                        type: "text",
                        text: "${user.name}",
                      },
                    ],
                  },
                  {
                    type: "cond",
                    text: "user.admin",
                    true: {
                      tag: "strong",
                      type: "el",
                      text: "<strong>",
                      child: [
                        {
                          type: "text",
                          text: "Admin",
                        },
                      ],
                    },
                    false: {
                      tag: "em",
                      type: "el",
                      text: "<em>",
                      child: [
                        {
                          type: "text",
                          text: "User",
                        },
                      ],
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

  it("условие с текстом", () => {
    const mainHtml = extractMainHtmlBlock<{ isLoggedIn: boolean }, {}>(
      ({ html, context }) => html`
        ${context.isLoggedIn ? html`<div>Welcome back!</div>` : html`<div>Please login</div>`}
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        type: "cond",
        text: "context.isLoggedIn",
        true: {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              type: "text",
              text: "Welcome back!",
            },
          ],
        },
        false: {
          tag: "div",
          type: "el",
          text: "<div>",
          child: [
            {
              type: "text",
              text: "Please login",
            },
          ],
        },
      },
    ])
  })

  it("map с вложенными объектами", () => {
    const mainHtml = extractMainHtmlBlock<any, { posts: { title: string; author: { name: string; email: string } }[] }>(
      ({ html, core }) => html`
        <div>
          ${core.posts.map(
            (post) => html`
              <article>
                <h1>${post.title}</h1>
                <p>Author: ${post.author.name} (${post.author.email})</p>
              </article>
            `
          )}
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            type: "map",
            text: "core.posts.map((post)`",
            child: [
              {
                tag: "article",
                type: "el",
                text: "<article>",
                child: [
                  {
                    tag: "h1",
                    type: "el",
                    text: "<h1>",
                    child: [
                      {
                        type: "text",
                        text: "${post.title}",
                      },
                    ],
                  },
                  {
                    tag: "p",
                    type: "el",
                    text: "<p>",
                    child: [
                      {
                        type: "text",
                        text: "Author: ${post.author.name} (${post.author.email})",
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

  it("пустые элементы", () => {
    const mainHtml = extractMainHtmlBlock<any, {}>(
      ({ html }) => html`
        <div></div>
        <span></span>
        <p>Text</p>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
      },
      {
        tag: "span",
        type: "el",
        text: "<span>",
      },
      {
        tag: "p",
        type: "el",
        text: "<p>",
        child: [
          {
            type: "text",
            text: "Text",
          },
        ],
      },
    ])
  })

  it("сложная вложенность map", () => {
    const mainHtml = extractMainHtmlBlock<
      any,
      { categories: { name: string; products: { title: string; variants: string[] }[] }[] }
    >(
      ({ html, core }) => html`
        <div>
          ${core.categories.map(
            (category) => html`
              <section>
                <h2>${category.name}</h2>
                ${category.products.map(
                  (product) => html`
                    <article>
                      <h3>${product.title}</h3>
                      ${product.variants.map((variant) => html`<span>${variant}</span>`)}
                    </article>
                  `
                )}
              </section>
            `
          )}
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            type: "map",
            text: "core.categories.map((category)`",
            child: [
              {
                tag: "section",
                type: "el",
                text: "<section>",
                child: [
                  {
                    child: [
                      {
                        text: "${category.name}",
                        type: "text",
                      },
                    ],
                    tag: "h2",
                    text: "<h2>",
                    type: "el",
                  },
                  {
                    type: "map",
                    text: "category.products.map((product)`",
                    child: [
                      {
                        tag: "article",
                        type: "el",
                        text: "<article>",
                        child: [
                          {
                            tag: "h3",
                            type: "el",
                            text: "<h3>",
                            child: [
                              {
                                type: "text",
                                text: "${product.title}",
                              },
                            ],
                          },
                          {
                            type: "map",
                            text: "product.variants.map((variant)`",
                            child: [
                              {
                                tag: "span",
                                type: "el",
                                text: "<span>",
                                child: [
                                  {
                                    type: "text",
                                    text: "${variant}",
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

  it("meta-элементы", () => {
    const mainHtml = extractMainHtmlBlock<any, { tag: string }>(
      ({ html, core }) => html`
        <div>
          <meta-hash></meta-hash>
          <meta-hash />
          <meta-${core.tag}></meta-${core.tag}>
          <meta-${core.tag} />
        </div>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    expect(hierarchy).toEqual([
      {
        tag: "div",
        type: "el",
        text: "<div>",
        child: [
          {
            tag: "meta-hash",
            type: "meta",
            text: "<meta-hash>",
          },
          {
            tag: "meta-hash",
            type: "meta",
            text: "<meta-hash />",
          },
          {
            tag: "meta-${core.tag}",
            type: "meta",
            text: "<meta-${core.tag}>",
          },
          {
            tag: "meta-${core.tag}",
            type: "meta",
            text: "<meta-${core.tag} />",
          },
        ],
      },
    ])
  })
})
