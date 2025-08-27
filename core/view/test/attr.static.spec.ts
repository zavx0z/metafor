import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"

describe("статические атрибуты", () => {
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
            string: {
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`<div class="container">Content</div>`)
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
            string: {
              class: "btn",
              type: "submit",
            },
            boolean: {
              disabled: true,
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`<button type="submit" class="btn" disabled>Submit</button>`)
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
            string: {
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`<div data-test-id="test" aria-label="description">Content</div>`)
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
            string: {
              type: "text",
              placeholder: "Enter name",
            },
            boolean: {
              required: true,
            },
          },
        ])
      })
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`<input type="text" placeholder="Enter name" required />`)
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
            string: {
              src: "image.jpg",
              alt: "Description",
            },
            boolean: {
              loading: true,
            },
          },
        ])
      })
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`<img src="image.jpg" alt="Description" loading />`)
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
            string: {
              charset: "utf-8",
              name: "viewport",
              content: "width=device-width",
            },
          },
        ])
      })
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`<meta charset="utf-8" name="viewport" content="width=device-width" />`)
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
            string: {
              class: "form",
              method: "post",
            },
            child: [
              {
                tag: "input",
                type: "el",
                string: {
                  type: "text",
                  name: "username",
                },
                boolean: {
                  required: true,
                },
              },
              {
                tag: "button",
                type: "el",
                string: {
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`
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
            string: {
              class: "container",
            },
            child: [
              {
                tag: "header",
                type: "el",
                string: {
                  class: "header",
                },
                child: [
                  {
                    tag: "h1",
                    type: "el",
                    string: {
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
                string: {
                  class: "main",
                },
                child: [
                  {
                    tag: "section",
                    type: "el",
                    string: {
                      class: "section",
                    },
                    child: [
                      {
                        tag: "article",
                        type: "el",
                        string: {
                          class: "article",
                        },
                        child: [
                          {
                            tag: "h2",
                            type: "el",
                            string: {
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
                            string: {
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
                string: {
                  class: "footer",
                },
                child: [
                  {
                    tag: "p",
                    type: "el",
                    string: {
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`
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
            string: {
              id: "",
            },
            array: {
              class: [],
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`<div class="" id="">Content</div>`)
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
            string: {
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`<div class="  spaced  " title="  title  ">Content</div>`)
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
            string: {
              "data-value": '"quoted"',
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
      it.skip("рендер", () => {
        const element = document.createElement("div")
        view.render({ container: element })
        expect(element.innerHTML).toMatchStringHTML(`<div data-value='"quoted"' title="'single' &amp; &quot;double&quot;">Content</div>`)
      })
    })
  })
})
