import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index"

describe("map соседствующие", () => {
  describe("map соседствующий с map на верхнем уровне", () => {
    type Core = {
      list1: { title: string }[]
      list2: { title: string }[]
    }
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<any, Core>(
        ({ html, mass }) => html`
          ${mass.list1.map(({ title }) => html` <div>${title}</div> `)}
          ${mass.list2.map(({ title }) => html` <div>${title}</div> `)}
        `,
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          type: "map",
          data: "/mass/list1",
          child: [
            {
              tag: "div",
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
        {
          type: "map",
          data: "/mass/list2",
          child: [
            {
              tag: "div",
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
      ])
    })
  })

  describe("map соседствующий с map внутри элемента", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<
        {
          categories: { type: "array"; required: true; default: [] }
        },
        {
          items: {
            categoryId: number
            title: string
          }[]
        }
      >(
        ({ html, value, mass }) => html`
          <div class="dashboard">
            ${value.categories.map((cat) => html`<span class="category">${cat}</span>`)}
            ${mass.items.map(
              (item) => html`
                <div class="item" data-category="${item.categoryId}">
                  <h4>${item.title}</h4>
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
          string: {
            class: "dashboard",
          },
          child: [
            {
              type: "map",
              data: "/value/categories",
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
                      data: "[item]",
                    },
                  ],
                },
              ],
            },
            {
              type: "map",
              data: "/mass/items",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "item",
                    "data-category": {
                      data: "[item]/categoryId",
                    },
                  },
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
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("map соседствующий с map на глубоком уровне вложенности", () => {
    type Core = {
      list1: { title: string }[]
      list2: { title: string }[]
      list3: { title: string }[]
    }
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<{}, { list1: { title: string }[]; list2: { title: string }[]; list3: { title: string }[] }>(
        ({ html, mass }) => html`
          <div class="level1">
            <div class="level2">
              <div class="level3">
                ${mass.list1.map(({ title }) => html`<div class="item1">${title}</div>`)}
                ${mass.list2.map(({ title }) => html`<div class="item2">${title}</div>`)}
                ${mass.list3.map(({ title }) => html`<div class="item3">${title}</div>`)}
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
          child: [
            {
              tag: "div",
              type: "el",
              child: [
                {
                  tag: "div",
                  type: "el",
                  child: [
                    {
                      type: "map",
                      data: "/mass/list1",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              data: "[item]/title",
                            },
                          ],
                          string: {
                            class: "item1",
                          },
                        },
                      ],
                    },
                    {
                      type: "map",
                      data: "/mass/list2",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              data: "[item]/title",
                            },
                          ],
                          string: {
                            class: "item2",
                          },
                        },
                      ],
                    },
                    {
                      type: "map",
                      data: "/mass/list3",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              data: "[item]/title",
                            },
                          ],
                          string: {
                            class: "item3",
                          },
                        },
                      ],
                    },
                  ],
                  string: {
                    class: "level3",
                  },
                },
              ],
              string: {
                class: "level2",
              },
            },
          ],
          string: {
            class: "level1",
          },
        },
      ])
    })
  })
})
