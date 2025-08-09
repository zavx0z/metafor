import { describe, it, expect } from "bun:test"
import { View } from "../../index"

describe("HTML Parser", () => {
  it("простой HTML элемент", () => {
    const view = new View({
      render: ({ html }) => html`<div>Hello, world!</div>`,
    })
    expect(view.schema, "простой div с текстом").toEqual([
      {
        tag: "div",
        type: "el",
        attrs: {},
        children: [
          {
            type: "text",
            value: "Hello, world!",
          },
        ],
      },
    ])
  })

  it("элемент с атрибутами", () => {
    const view = new View({
      render: ({ html }) => html`<div class="container" id="main">Content</div>`,
    })
    expect(view.schema, "div с атрибутами").toEqual([
      {
        tag: "div",
        type: "el",
        attrs: {
          class: "container",
          id: "main",
        },
        children: [
          {
            type: "text",
            value: "Content",
          },
        ],
      },
    ])
  })

  it("вложенные элементы", () => {
    const view = new View({
      render: ({ html }) => html`<div>
        <h1>Title</h1>
        <p>Description</p>
      </div>`,
    })
    expect(view.schema, "вложенные элементы").toEqual([
      {
        tag: "div",
        type: "el",
        attrs: {},
        children: [
          {
            tag: "h1",
            type: "el",
            attrs: {},
            children: [
              {
                type: "text",
                value: "Title",
              },
            ],
          },
          {
            tag: "p",
            type: "el",
            attrs: {},
            children: [
              {
                type: "text",
                value: "Description",
              },
            ],
          },
        ],
      },
    ])
  })

  it("несколько корневых элементов", () => {
    const view = new View({
      render: ({ html }) =>
        html`<header>Header</header>
          <main>Main</main>`,
    })
    expect(view.schema, "несколько корневых элементов").toEqual([
      {
        tag: "header",
        type: "el",
        attrs: {},
        children: [
          {
            type: "text",
            value: "Header",
          },
        ],
      },
      {
        tag: "main",
        type: "el",
        attrs: {},
        children: [
          {
            type: "text",
            value: "Main",
          },
        ],
      },
    ])
  })

  it("элемент с простой интерполяцией", () => {
    const view = new View({
      render: ({ html, context }) => html`<div>${context.name}</div>`,
    })
    expect(view.schema, "простая интерполяция").toEqual([
      {
        tag: "div",
        type: "el",
        attrs: {},
        children: [
          {
            type: "text",
            value: { source: "item" },
          },
        ],
      },
    ])
  })

  it("контекстные данные - array", () => {
    const view = new View({
      render: ({ html, context }) =>
        html`<ul>
          ${context.ids.map((id: any) => html`<li>${id}</li>`)}
        </ul>`,
    })
    expect(view.schema, "массив из контекста").toEqual([
      {
        tag: "ul",
        type: "el",
        attrs: {},
        children: [
          {
            tag: "li",
            type: "el",
            item: {
              src: "context",
              key: "ids",
            },
            attrs: {},
            children: [
              {
                type: "text",
                value: { source: "item" },
              },
            ],
          },
        ],
      },
    ])
  })

  it("сложный массив с атрибутами", () => {
    const view = new View({
      render: ({ html, context }) =>
        html`<div class="list">
          ${context.users.map(
            (user: any) => html`<div class="user-card" data-id="${user.id}">
              <h3>${user.name}</h3>
              <p>${user.email}</p>
            </div>`
          )}
        </div>`,
    })
    expect(view.schema, "сложный массив пользователей").toEqual([
      {
        tag: "div",
        type: "el",
        attrs: {
          class: "list",
        },
        children: [
          {
            tag: "div",
            type: "el",
            item: {
              src: "context",
              key: "users",
            },
            attrs: {
              class: "user-card",
              "data-id": "SIMPLE_PLACEHOLDER",
            },
            children: [
              {
                tag: "h3",
                type: "el",
                attrs: {},
                children: [
                  {
                    type: "text",
                    value: { source: "item" },
                  },
                ],
              },
              {
                tag: "p",
                type: "el",
                attrs: {},
                children: [
                  {
                    type: "text",
                    value: { source: "item" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ])
  })

  it("самозакрывающиеся теги", () => {
    const view = new View({
      render: ({ html }) => html`<div><img src="image.jpg" alt="Image" /><br /></div>`,
    })
    expect(view.schema, "самозакрывающиеся теги").toEqual([
      {
        tag: "div",
        type: "el",
        attrs: {},
        children: [
          {
            tag: "img",
            type: "el",
            attrs: {
              src: "image.jpg",
              alt: "Image",
            },
          },
          {
            tag: "br",
            type: "el",
            attrs: {},
          },
        ],
      },
    ])
  })

  it("смешанный контент", () => {
    const view = new View({
      render: ({ html, context }) =>
        html`<div>
          <h1>User List</h1>
          ${context.users.map((user: any) => html`<span>${user.name}</span>`)}
          <footer>Total: ${context.total}</footer>
        </div>`,
    })
    expect(view.schema, "смешанный контент с массивом и интерполяциями").toEqual([
      {
        tag: "div",
        type: "el",
        attrs: {},
        children: [
          {
            tag: "h1",
            type: "el",
            attrs: {},
            children: [
              {
                type: "text",
                value: "User List",
              },
            ],
          },
          {
            tag: "span",
            type: "el",
            item: {
              src: "context",
              key: "users",
            },
            attrs: {},
            children: [
              {
                type: "text",
                value: { source: "item" },
              },
            ],
          },
          {
            tag: "footer",
            type: "el",
            attrs: {},
            children: [
              {
                type: "text",
                value: "Total:",
              },
              {
                type: "text",
                value: { source: "item" },
              },
            ],
          },
        ],
      },
    ])
  })

  it("пустые элементы", () => {
    const view = new View({
      render: ({ html }) =>
        html`<div></div>
          <span></span>`,
    })
    expect(view.schema, "пустые элементы").toEqual([
      {
        tag: "div",
        type: "el",
        attrs: {},
      },
      {
        tag: "span",
        type: "el",
        attrs: {},
      },
    ])
  })
})
