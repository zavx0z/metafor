import { describe, it, expect, beforeAll } from "bun:test"
import { parse } from "../../../index.ts"
import type { NodeType } from "@metafor/types/template/node/index"

describe("map с условиями", () => {
  describe("map соседствующий с map в условии на верхнем уровне", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<
        {
          flag: { type: "boolean" }
        },
        {
          list1: { title: string }[]
          list2: { title: string }[]
        }
      >(
        ({ html, value, mass }) => html`
          ${mass.list1.map(({ title }) => html`<div class="item1">${title}</div>`)}
          ${value.flag
            ? html`<div class="conditional">
                ${mass.list2.map(({ title }) => html`<div class="item2">${title}</div>`)}
              </div>`
            : html`<div class="fallback">No items</div>`}
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
              string: {
                class: "item1",
              },
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
          type: "cond",
          data: "/value/flag",
          child: [
            {
              tag: "div",
              type: "el",
              string: {
                class: "conditional",
              },
              child: [
                {
                  type: "map",
                  data: "/mass/list2",
                  child: [
                    {
                      tag: "div",
                      type: "el",
                      string: {
                        class: "item2",
                      },
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
            {
              tag: "div",
              type: "el",
              string: {
                class: "fallback",
              },
              child: [
                {
                  type: "text",
                  value: "No items",
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("map соседствующий с map в условии внутри элемента", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<
        {
          flag: { type: "boolean" }
        },
        {
          list1: { title: string }[]
          list2: { title: string }[]
        }
      >(
        ({ html, value, mass }) => html`
          <div class="container">
            ${mass.list1.map(({ title }) => html`<div class="item1">${title}</div>`)}
            ${value.flag
              ? html`<div class="conditional">
                  ${mass.list2.map(({ title }) => html`<div class="item2">${title}</div>`)}
                </div>`
              : html`<div class="fallback">No items</div>`}
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
              type: "cond",
              data: "/value/flag",
              child: [
                {
                  tag: "div",
                  type: "el",
                  child: [
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
                  ],
                  string: {
                    class: "conditional",
                  },
                },
                {
                  tag: "div",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "No items",
                    },
                  ],
                  string: {
                    class: "fallback",
                  },
                },
              ],
            },
          ],
          string: {
            class: "container",
          },
        },
      ])
    })
  })

  describe("map соседствующий с map в условии на глубоком уровне вложенности", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<
        {
          flag: { type: "boolean" }
          deepFlag: { type: "boolean" }
        },
        {
          list1: { title: string }[]
          list2: { title: string }[]
          list3: { title: string }[]
        }
      >(
        ({ html, value, mass }) => html`
          <div class="level1">
            <div class="level2">
              <div class="level3">
                ${mass.list1.map(({ title }) => html`<div class="item1">${title}</div>`)}
                ${value.flag
                  ? html`<div class="conditional">
                      ${mass.list2.map(({ title }) => html`<div class="item2">${title}</div>`)}
                      ${value.deepFlag
                        ? html`<div class="deep-conditional">
                            ${mass.list3.map(({ title }) => html`<div class="item3">${title}</div>`)}
                          </div>`
                        : html`<div class="deep-fallback">No deep items</div>`}
                    </div>`
                  : html`<div class="fallback">No items</div>`}
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
                      type: "cond",
                      data: "/value/flag",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          child: [
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
                              type: "cond",
                              data: "/value/deepFlag",
                              child: [
                                {
                                  tag: "div",
                                  type: "el",
                                  child: [
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
                                    class: "deep-conditional",
                                  },
                                },
                                {
                                  tag: "div",
                                  type: "el",
                                  child: [
                                    {
                                      type: "text",
                                      value: "No deep items",
                                    },
                                  ],
                                  string: {
                                    class: "deep-fallback",
                                  },
                                },
                              ],
                            },
                          ],
                          string: {
                            class: "conditional",
                          },
                        },
                        {
                          tag: "div",
                          type: "el",
                          child: [
                            {
                              type: "text",
                              value: "No items",
                            },
                          ],
                          string: {
                            class: "fallback",
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

  describe("map внутри condition", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ show: { type: "boolean" } }, { items: string[] }>(
        ({ html, mass, value }) => html`
          <div>
            ${value.show
              ? html` ${mass.items.map((item) => html`<div class="true-${item}"></div>`)}`
              : html` ${mass.items.map((item) => html`<div class="false-${item}"></div>`)}`}
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
              type: "cond",
              data: "/value/show",
              child: [
                {
                  type: "map",
                  data: "/mass/items",
                  child: [
                    {
                      tag: "div",
                      type: "el",
                      string: {
                        class: {
                          data: "[item]",
                          expr: "true-${_[0]}",
                        },
                      },
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
                        class: {
                          data: "[item]",
                          expr: "false-${_[0]}",
                        },
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
  })
})
