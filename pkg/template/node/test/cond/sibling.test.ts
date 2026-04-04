import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index.ts"

describe("условия соседствующие", () => {
  describe("условие соседствующее с условием на верхнем уровне", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ flag1: { type: "boolean" }; flag2: { type: "boolean" } }, {}>(
        ({ html, value }) => html`
          ${value.flag1
            ? html`<div class="conditional1">Content 1</div>`
            : html`<div class="fallback1">No content 1</div>`}
          ${value.flag2
            ? html`<div class="conditional2">Content 2</div>`
            : html`<div class="fallback2">No content 2</div>`}
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          type: "cond",
          data: "/value/flag1",
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
          data: "/value/flag2",
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
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ flag1: { type: "boolean" }; flag2: { type: "boolean" } }, {}>(
        ({ html, value }) => html`
          <div class="container">
            ${value.flag1
              ? html`<div class="conditional1">Content 1</div>`
              : html`<div class="fallback1">No content 1</div>`}
            ${value.flag2
              ? html`<div class="conditional2">Content 2</div>`
              : html`<div class="fallback2">No content 2</div>`}
          </div>
        `,
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
              data: "/value/flag1",
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
              data: "/value/flag2",
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
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ flag1: { type: "boolean" }; flag2: { type: "boolean" }; flag3: { type: "boolean" } }, {}>(
        ({ html, value }) => html`
          <div class="level1">
            <div class="level2">
              <div class="level3">
                ${value.flag1
                  ? html`<div class="conditional1">Content 1</div>`
                  : html`<div class="fallback1">No content 1</div>`}
                ${value.flag2
                  ? html`<div class="conditional2">Content 2</div>`
                  : html`<div class="fallback2">No content 2</div>`}
                ${value.flag3
                  ? html`<div class="conditional3">Content 3</div>`
                  : html`<div class="fallback3">No content 3</div>`}
              </div>
            </div>
          </div>
        `,
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
                      data: "/value/flag1",
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
                      data: "/value/flag2",
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
                      data: "/value/flag3",
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
