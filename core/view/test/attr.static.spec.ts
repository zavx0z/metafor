import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"

describe("статические атрибуты", () => {
  const html = String.raw
  describe("простые статические атрибуты", () => {
    describe("один статический атрибут", () => {
      const view = new View({
        render: ({ html }) => html`<div class="container">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "один статический атрибут").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: "container",
            },
            child: [
              {
                type: "text",
                value: "Content",
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "один статический атрибут").toMatchStringHTML(html`
          <div class="container">Content</div>
        `)
      })
    })

    describe("несколько статических атрибутов", () => {
      const view = new View({
        render: ({ html }) => html`<button type="submit" class="btn" disabled>Submit</button>`,
      })
      it("парсинг", () => {
        expect(view.schema, "несколько статических атрибутов").toEqual([
          {
            tag: "button",
            type: "el",
            attrs: {
              type: "submit",
              class: "btn",
              disabled: "",
            },
            child: [
              {
                type: "text",
                value: "Submit",
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "несколько статических атрибутов").toMatchStringHTML(html`
          <button type="submit" class="btn" disabled>Submit</button>
        `)
      })
    })

    describe("атрибуты с дефисами", () => {
      const view = new View({
        render: ({ html }) => html`<div data-test-id="test" aria-label="description">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "атрибуты с дефисами").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              "data-test-id": "test",
              "aria-label": "description",
            },
            child: [
              {
                type: "text",
                value: "Content",
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "атрибуты с дефисами").toMatchStringHTML(html`
          <div data-test-id="test" aria-label="description">Content</div>
        `)
      })
    })
  })

  describe("самозакрывающиеся теги", () => {
    describe("input с атрибутами", () => {
      const view = new View({
        render: ({ html }) => html`<input type="text" placeholder="Enter name" required />`,
      })
      it("парсинг", () => {
        expect(view.schema, "input с атрибутами").toEqual([
          {
            tag: "input",
            type: "el",
            attrs: {
              type: "text",
              placeholder: "Enter name",
              required: "",
            },
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "input с атрибутами").toMatchStringHTML(html`
          <input type="text" placeholder="Enter name" required />
        `)
      })
    })

    describe("img с атрибутами", () => {
      const view = new View({
        render: ({ html }) => html`<img src="image.jpg" alt="Description" loading />`,
      })
      it("парсинг", () => {
        expect(view.schema, "img с атрибутами").toEqual([
          {
            tag: "img",
            type: "el",
            attrs: {
              src: "image.jpg",
              alt: "Description",
              loading: "",
            },
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "img с атрибутами").toMatchStringHTML(html`
          <img src="image.jpg" alt="Description" loading />
        `)
      })
    })

    describe("meta с атрибутами", () => {
      const view = new View({
        render: ({ html }) => html`<meta charset="utf-8" name="viewport" content="width=device-width" />`,
      })
      it("парсинг", () => {
        expect(view.schema, "meta с атрибутами").toEqual([
          {
            tag: "meta",
            type: "el",
            attrs: {
              charset: "utf-8",
              name: "viewport",
              content: "width=device-width",
            },
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "meta с атрибутами").toMatchStringHTML(html`
          <meta charset="utf-8" name="viewport" content="width=device-width" />
        `)
      })
    })
  })

  describe("вложенные элементы", () => {
    describe("вложенные элементы с атрибутами", () => {
      const view = new View({
        render: ({ html }) => html`
          <form class="form" method="post">
            <input type="text" name="username" required />
            <button type="submit" class="btn">Submit</button>
          </form>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "вложенные элементы с атрибутами").toEqual([
          {
            tag: "form",
            type: "el",
            attrs: {
              class: "form",
              method: "post",
            },
            child: [
              {
                tag: "input",
                type: "el",
                attrs: {
                  type: "text",
                  name: "username",
                  required: "",
                },
              },
              {
                tag: "button",
                type: "el",
                attrs: {
                  type: "submit",
                  class: "btn",
                },
                child: [
                  {
                    type: "text",
                    value: "Submit",
                  },
                ],
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "вложенные элементы с атрибутами").toMatchStringHTML(html`
          <form class="form" method="post">
            <input type="text" name="username" required />
            <button type="submit" class="btn">Submit</button>
          </form>
        `)
      })
    })

    describe("сложная структура с атрибутами", () => {
      const view = new View({
        render: ({ html }) => html`
          <div class="container">
            <header class="header">
              <h1 class="title">Title</h1>
            </header>
            <main class="main">
              <section class="section">
                <article class="article">
                  <h2 class="subtitle">Subtitle</h2>
                  <p class="text">Content</p>
                </article>
              </section>
            </main>
            <footer class="footer">
              <p class="copyright">Copyright</p>
            </footer>
          </div>
        `,
      })
      it("парсинг", () => {
        expect(view.schema, "сложная структура с атрибутами").toEqual([
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
                attrs: {
                  class: "header",
                },
                child: [
                  {
                    tag: "h1",
                    type: "el",
                    attrs: {
                      class: "title",
                    },
                    child: [
                      {
                        type: "text",
                        value: "Title",
                      },
                    ],
                  },
                ],
              },
              {
                tag: "main",
                type: "el",
                attrs: {
                  class: "main",
                },
                child: [
                  {
                    tag: "section",
                    type: "el",
                    attrs: {
                      class: "section",
                    },
                    child: [
                      {
                        tag: "article",
                        type: "el",
                        attrs: {
                          class: "article",
                        },
                        child: [
                          {
                            tag: "h2",
                            type: "el",
                            attrs: {
                              class: "subtitle",
                            },
                            child: [
                              {
                                type: "text",
                                value: "Subtitle",
                              },
                            ],
                          },
                          {
                            tag: "p",
                            type: "el",
                            attrs: {
                              class: "text",
                            },
                            child: [
                              {
                                type: "text",
                                value: "Content",
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                tag: "footer",
                type: "el",
                attrs: {
                  class: "footer",
                },
                child: [
                  {
                    tag: "p",
                    type: "el",
                    attrs: {
                      class: "copyright",
                    },
                    child: [
                      {
                        type: "text",
                        value: "Copyright",
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
        view.render({ container: element })
        expect(element.innerHTML, "сложная структура с атрибутами").toMatchStringHTML(html`
          <div class="container">
            <header class="header">
              <h1 class="title">Title</h1>
            </header>
            <main class="main">
              <section class="section">
                <article class="article">
                  <h2 class="subtitle">Subtitle</h2>
                  <p class="text">Content</p>
                </article>
              </section>
            </main>
            <footer class="footer">
              <p class="copyright">Copyright</p>
            </footer>
          </div>
        `)
      })
    })
  })

  describe("edge cases", () => {
    describe("пустые атрибуты", () => {
      const view = new View({
        render: ({ html }) => html`<div class="" id="">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "пустые атрибуты").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: "",
              id: "",
            },
            child: [
              {
                type: "text",
                value: "Content",
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "пустые атрибуты").toMatchStringHTML(html` <div class="" id="">Content</div> `)
      })
    })

    describe("атрибуты с пробелами", () => {
      const view = new View({
        render: ({ html }) => html`<div class="  spaced  " title="  title  ">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "атрибуты с пробелами").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              class: "  spaced  ",
              title: "  title  ",
            },
            child: [
              {
                type: "text",
                value: "Content",
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "атрибуты с пробелами").toMatchStringHTML(html`
          <div class="  spaced  " title="  title  ">Content</div>
        `)
      })
    })

    describe("атрибуты с специальными символами", () => {
      const view = new View({
        render: ({ html }) => html`<div data-value='"quoted"' title="'single' &amp; &quot;double&quot;">Content</div>`,
      })
      it("парсинг", () => {
        expect(view.schema, "атрибуты с специальными символами").toEqual([
          {
            tag: "div",
            type: "el",
            attrs: {
              "data-value": "&quot;quoted&quot;",
              title: "'single' &amp; &quot;double&quot;",
            },
            child: [
              {
                type: "text",
                value: "Content",
              },
            ],
          },
        ])
      })
      it("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML, "атрибуты с специальными символами").toMatchStringHTML(html`
          <div data-value='"quoted"' title="'single' &amp; &quot;double&quot;">Content</div>
        `)
      })
    })
  })
})
