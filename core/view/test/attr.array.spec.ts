import { describe, it, expect } from "bun:test"
import { View } from "../index.ts"
const html = String.raw

describe("атрибуты в массивах - вложенность", () => {
  describe("одноуровневый массив (core.items)", () => {
    const core = {
      items: [
        { type: 1, name: "A" },
        { type: 2, name: "B" },
      ],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.items.map((item) => html`<li class="item-${item.type}" title="${item.name}">x</li>`)}
        </ul>
      `,
    })
    it("парсинг", () => {
      expect(view.schema, "одноуровневый массив (core.items)").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/core/items",
              child: [
                {
                  tag: "li",
                  type: "el",
                  string: {
                    class: {
                      data: "[item]/type",
                      expr: "item-${[0]}",
                    },
                    title: {
                      data: "[item]/name",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      value: "x",
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
      view.render({ container: element, core })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li class="item-${core.items[0].type}" title="${core.items[0].name}">x</li>
          <li class="item-${core.items[1].type}" title="${core.items[1].name}">x</li>
        </ul>
      `)
    })
  })

  describe("двухуровневый массив (core.groups[].items)", () => {
    const core = {
      groups: [
        {
          id: "G1",
          items: [
            { id: 1, label: "A" },
            { id: 2, label: "B" },
          ],
        },
        {
          id: "G2",
          items: [{ id: 3, label: "C" }],
        },
      ],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <div>
          ${core.groups.map(
            (g) => html`
              <section>${g.items.map((it) => html`<span class="g-${g.id} i-${it.id}">${it.label}</span>`)}</section>
            `
          )}
        </div>
      `,
    })
    it("парсинг", () => {
      expect(view.schema, "двухуровневый массив (core.groups[].items)").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/core/groups",
              child: [
                {
                  tag: "section",
                  type: "el",
                  child: [
                    {
                      type: "map",
                      data: "[item]/items",
                      child: [
                        {
                          tag: "span",
                          type: "el",
                          array: {
                            class: [
                              {
                                data: "../[item]/id",
                                expr: "g-${[0]}",
                              },
                              {
                                data: "[item]/id",
                                expr: "i-${[0]}",
                              },
                            ],
                          },
                          child: [
                            {
                              type: "text",
                              data: "[item]/label",
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
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ container: element, core })
      expect(element.innerHTML).toMatchStringHTML(html`
        <div>
          <section>
            <span class="g-${core.groups[0].id} i-${core.groups[0].items[0].id}">${core.groups[0].items[0].label}</span>
            <span class="g-${core.groups[0].id} i-${core.groups[0].items[1].id}">${core.groups[0].items[1].label}</span>
          </section>
          <section>
            <span class="g-${core.groups[1].id} i-${core.groups[1].items[0].id}">${core.groups[1].items[0].label}</span>
          </section>
        </div>
      `)
    })
  })

  describe("трёхуровневый массив (core.a[].b[].c[])", () => {
    const core = { a: [{ b: [{ c: [{ id: 1 }, { id: 2 }] }] }, { b: [{ c: [{ id: 3 }] }] }] } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <div>
          ${core.a.map(
            (a) => html`
              <section>
                ${a.b.map(
                  (b) => html`
                    <ul>
                      ${b.c.map((x) => html`<li class="a-${core.a} b-${b.c} c-${x.id}">x</li>`)}
                    </ul>
                  `
                )}
              </section>
            `
          )}
        </div>
      `,
    })

    it("парсинг", () => {
      expect(view.schema, "трёхуровневый массив (core.a[].b[].c[])").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/core/a",
              child: [
                {
                  tag: "section",
                  type: "el",
                  child: [
                    {
                      type: "map",
                      data: "[item]/b",
                      child: [
                        {
                          tag: "ul",
                          type: "el",
                          child: [
                            {
                              type: "map",
                              data: "[item]/c",
                              child: [
                                {
                                  tag: "li",
                                  type: "el",
                                  array: {
                                    class: [
                                      {
                                        data: "/core/a",
                                        expr: "a-${[0]}",
                                      },
                                      {
                                        data: "../[item]/c",
                                        expr: "b-${[0]}",
                                      },
                                      {
                                        data: "[item]/id",
                                        expr: "c-${[0]}",
                                      },
                                    ],
                                  },
                                  child: [
                                    {
                                      type: "text",
                                      value: "x",
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
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ container: element, core })
      expect(element.innerHTML).toMatchStringHTML(html`
        <div>
          <section>
            <ul>
              <li class="b-2 c-1">x</li>
              <li class="b-2 c-2">x</li>
            </ul>
          </section>
          <section>
            <ul>
              <li class="b-1 c-3">x</li>
            </ul>
          </section>
        </div>
      `)
    })
  })

  describe("смешанный путь: core.list[].children[].items[] с несколькими атрибутами", () => {
    const core = {
      list: [
        {
          gid: "G1",
          children: [
            {
              cid: "C1",
              items: [{ id: 1, name: "A" }],
            },
          ],
        },
        {
          gid: "G2",
          children: [
            {
              cid: "C2",
              items: [
                { id: 2, name: "B" },
                { id: 3, name: "C" },
              ],
            },
          ],
        },
      ],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <div>
          ${core.list.map(
            (listItem) => html`
              <section data-g="${listItem.gid}">
                ${listItem.children.map(
                  (childrenItem) => html`
                    <ul>
                      ${childrenItem.items.map(
                        (itemsItem) => html`
                          <li
                            class="g-${listItem.gid} ch-${childrenItem.cid} i-${itemsItem.id}"
                            title="${itemsItem.name}">
                            ok
                          </li>
                        `
                      )}
                    </ul>
                  `
                )}
              </section>
            `
          )}
        </div>
      `,
    })
    it("парсинг", () => {
      expect(view.schema, "смешанный путь: core.list[].children[].items[] с несколькими атрибутами").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "map",
              data: "/core/list",
              child: [
                {
                  tag: "section",
                  type: "el",
                  string: {
                    "data-g": {
                      data: "[item]/gid",
                    },
                  },
                  child: [
                    {
                      type: "map",
                      data: "[item]/children",
                      child: [
                        {
                          tag: "ul",
                          type: "el",
                          child: [
                            {
                              type: "map",
                              data: "[item]/items",
                              child: [
                                {
                                  tag: "li",
                                  type: "el",
                                  array: {
                                    class: [
                                      {
                                        data: "../../[item]/gid",
                                        expr: "g-${[0]}",
                                      },
                                      {
                                        data: "../[item]/cid",
                                        expr: "ch-${[0]}",
                                      },
                                      {
                                        data: "[item]/id",
                                        expr: "i-${[0]}",
                                      },
                                    ],
                                  },
                                  child: [
                                    {
                                      type: "text",
                                      value: "ok",
                                    },
                                  ],
                                  string: {
                                    title: {
                                      data: "[item]/name",
                                    },
                                  },
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
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ container: element, core })
      expect(element.innerHTML).toMatchStringHTML(html`
        <div>
          <section data-g="${core.list[0].gid}">
            <ul>
              <li class="g-G1 ch-C1 i-1" title="A">ok</li>
            </ul>
          </section>
          <section data-g="${core.list[1].gid}">
            <ul>
              <li class="g-G2 ch-C2 i-2" title="B">ok</li>
              <li class="g-G2 ch-C2 i-3" title="C">ok</li>
            </ul>
          </section>
        </div>
      `)
    })
  })

  describe("фильтрация и дедупликация токенов классов", () => {
    const core = {
      items: [
        { id: 1, active: true, hidden: false, data: null, obj: { x: 1 }, arr: [1, 2] },
        { id: 2, active: false, hidden: true, data: "", obj: {}, arr: [] },
      ],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.items.map((item) => html`
            <li class="base item-${item.id}">
              Item ${item.id}
            </li>
          `)}
        </ul>
      `,
    })

    it("рендер с базовыми классами", () => {
      const element = document.createElement("div")
      view.render({ container: element, core })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li class="base item-1">Item 1</li>
          <li class="base item-2">Item 2</li>
        </ul>
      `)
    })

    it("парсинг с array.class", () => {
      expect(view.schema, "фильтрация токенов в array.class").toEqual([
        {
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              data: "/core/items",
              child: [
                {
                  tag: "li",
                  type: "el",
                  array: {
                    class: [
                      {
                        value: "base",
                      },
                      {
                        data: "[item]/id",
                        expr: "item-${[0]}",
                      },
                    ],
                  },
                  child: [
                    {
                      type: "text",
                      data: "[item]/id",
                      expr: "Item ${[0]}",
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

  describe("поддержка индексов в путях", () => {
    const core = {
      items: [
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 3, name: "Item 3" },
      ],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.items.map((item) => html`
            <li class="item-${item.id} index-${item.id}">${item.name}</li>
          `)}
        </ul>
      `,
    })

    it("рендер с индексами", () => {
      const element = document.createElement("div")
      view.render({ container: element, core })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li class="item-1 index-1">Item 1</li>
          <li class="item-2 index-2">Item 2</li>
          <li class="item-3 index-3">Item 3</li>
        </ul>
      `)
    })
  })

  describe("многоуровневые относительные пути", () => {
    const core = {
      groups: [
        {
          id: "g1",
          items: [
            { id: 1, name: "Item 1" },
            { id: 2, name: "Item 2" },
          ],
        },
        {
          id: "g2", 
          items: [
            { id: 3, name: "Item 3" },
          ],
        },
      ],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <div>
          ${core.groups.map((group) => html`
            <section>
              ${group.items.map((item) => html`
                <span class="g-${group.id} i-${item.id}">${item.name}</span>
              `)}
            </section>
          `)}
        </div>
      `,
    })

    it("рендер с многоуровневыми относительными путями", () => {
      const element = document.createElement("div")
      view.render({ container: element, core })
      expect(element.innerHTML).toMatchStringHTML(html`
        <div>
          <section>
            <span class="g-g1 i-1">Item 1</span>
            <span class="g-g1 i-2">Item 2</span>
          </section>
          <section>
            <span class="g-g2 i-3">Item 3</span>
          </section>
        </div>
      `)
    })
  })

  describe("фильтрация мусорных токенов классов", () => {
    const core = {
      items: [
        { id: 1, active: true, hidden: false, data: null, obj: { x: 1 }, arr: [1, 2] },
        { id: 2, active: false, hidden: true, data: "", obj: {}, arr: [] },
      ],
    } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) => html`
        <ul>
          ${core.items.map((item) => html`
            <li class="base item-${item.id}">Item ${item.id}</li>
          `)}
        </ul>
      `,
    })

    it("рендер без мусорных токенов", () => {
      const element = document.createElement("div")
      view.render({ container: element, core })
      expect(element.innerHTML).toMatchStringHTML(html`
        <ul>
          <li class="base item-1">Item 1</li>
          <li class="base item-2">Item 2</li>
        </ul>
      `)
    })
  })
})
