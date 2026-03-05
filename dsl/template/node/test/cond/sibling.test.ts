import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../../index"

describe("условия соседствующие", () => {
  describe("условие соседствующее с условием на верхнем уровне", () => {
    type Context = {
      flag1: boolean
      flag2: boolean
    }
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ flag1: boolean; flag2: boolean }, {}>(
        ({ html, fields }) => html`
          ${fields.flag1
            ? html`<div class="conditional1">Content 1</div>`
            : html`<div class="fallback1">No content 1</div>`}
          ${fields.flag2
            ? html`<div class="conditional2">Content 2</div>`
            : html`<div class="fallback2">No content 2</div>`}
        `
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          type: "cond",
          data: "/fields/flag1",
          child: [
            {
              tag: "div",
              type: "el",
              string: {
                class: "conditional1",
              },
              child: [
                {
                  type: "text",
                  value: "Content 1",
                },
              ],
            },
            {
              tag: "div",
              type: "el",
              string: {
                class: "fallback1",
              },
              child: [
                {
                  type: "text",
                  value: "No content 1",
                },
              ],
            },
          ],
        },
        {
          type: "cond",
          data: "/fields/flag2",
          child: [
            {
              tag: "div",
              type: "el",
              string: {
                class: "conditional2",
              },
              child: [
                {
                  type: "text",
                  value: "Content 2",
                },
              ],
            },
            {
              tag: "div",
              type: "el",
              string: {
                class: "fallback2",
              },
              child: [
                {
                  type: "text",
                  value: "No content 2",
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("условие соседствующее с условием внутри элемента", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ flag1: boolean; flag2: boolean }, {}>(
        ({ html, fields }) => html`
          <div class="container">
            ${fields.flag1
              ? html`<div class="conditional1">Content 1</div>`
              : html`<div class="fallback1">No content 1</div>`}
            ${fields.flag2
              ? html`<div class="conditional2">Content 2</div>`
              : html`<div class="fallback2">No content 2</div>`}
          </div>
        `
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: "container",
          },
          child: [
            {
              type: "cond",
              data: "/fields/flag1",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "conditional1",
                  },
                  child: [
                    {
                      type: "text",
                      value: "Content 1",
                    },
                  ],
                },
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "fallback1",
                  },
                  child: [
                    {
                      type: "text",
                      value: "No content 1",
                    },
                  ],
                },
              ],
            },
            {
              type: "cond",
              data: "/fields/flag2",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "conditional2",
                  },
                  child: [
                    {
                      type: "text",
                      value: "Content 2",
                    },
                  ],
                },
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "fallback2",
                  },
                  child: [
                    {
                      type: "text",
                      value: "No content 2",
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

  describe("условие соседствующее с условием на глубоком уровне вложенности", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ flag1: boolean; flag2: boolean; flag3: boolean }, {}>(
        ({ html, fields }) => html`
          <div class="level1">
            <div class="level2">
              <div class="level3">
                ${fields.flag1
                  ? html`<div class="conditional1">Content 1</div>`
                  : html`<div class="fallback1">No content 1</div>`}
                ${fields.flag2
                  ? html`<div class="conditional2">Content 2</div>`
                  : html`<div class="fallback2">No content 2</div>`}
                ${fields.flag3
                  ? html`<div class="conditional3">Content 3</div>`
                  : html`<div class="fallback3">No content 3</div>`}
              </div>
            </div>
          </div>
        `
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: "level1",
          },
          child: [
            {
              tag: "div",
              type: "el",
              string: {
                class: "level2",
              },
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "level3",
                  },
                  child: [
                    {
                      type: "cond",
                      data: "/fields/flag1",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "conditional1",
                          },
                          child: [
                            {
                              type: "text",
                              value: "Content 1",
                            },
                          ],
                        },
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "fallback1",
                          },
                          child: [
                            {
                              type: "text",
                              value: "No content 1",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      type: "cond",
                      data: "/fields/flag2",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "conditional2",
                          },
                          child: [
                            {
                              type: "text",
                              value: "Content 2",
                            },
                          ],
                        },
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "fallback2",
                          },
                          child: [
                            {
                              type: "text",
                              value: "No content 2",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      type: "cond",
                      data: "/fields/flag3",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "conditional3",
                          },
                          child: [
                            {
                              type: "text",
                              value: "Content 3",
                            },
                          ],
                        },
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "fallback3",
                          },
                          child: [
                            {
                              type: "text",
                              value: "No content 3",
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
