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
              tag: "li",
              type: "el",
              item: {
                src: "core",
                key: "items",
              },
              attrs: {
                class: {
                  template: "item-${0}",
                  items: [{ src: ["core", "items"], key: "type" }],
                },
                title: {
                  src: ["core", "items"],
                  key: "name",
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
        { id: "G2", items: [{ id: 3, label: "C" }] },
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
              tag: "section",
              type: "el",
              item: {
                src: "core",
                key: "groups",
              },
              child: [
                {
                  tag: "span",
                  type: "el",
                  item: {
                    src: ["core", "groups"],
                    key: "items",
                  },
                  attrs: {
                    class: {
                      template: "g-${0} i-${1}",
                      items: [
                        { src: ["core", "groups"], key: "id" },
                        { src: ["core", "groups", "items"], key: "id" },
                      ],
                    },
                  },
                  child: [
                    {
                      type: "text",
                      value: {
                        key: "label",
                        src: ["core", "groups", "items"],
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
    it("рендер", () => {
      const element = document.createElement("div")
      view.render({ container: element, core })
      expect(element.innerHTML).toMatchStringHTML(
        html`<div>
          <section>
            <span class="g-${core.groups[0].id} i-${core.groups[0].items[0].id}">${core.groups[0].items[0].label}</span>
            <span class="g-${core.groups[0].id} i-${core.groups[0].items[1].id}">${core.groups[0].items[1].label}</span>
          </section>
          <section>
            <span class="g-${core.groups[1].id} i-${core.groups[1].items[0].id}">${core.groups[1].items[0].label}</span>
          </section>
        </div>`
      )
    })
  })

  describe("трёхуровневый массив (core.a[].b[].c[])", () => {
    const core = { a: [{ b: [{ c: [{ id: 1 }, { id: 2 }] }] }, { b: [{ c: [{ id: 3 }] }] }] } as const
    const view = new View<any, typeof core>({
      render: ({ html, core }) =>
        html`<div>
          ${core.a.map(
            (a) =>
              html`<section>
                ${a.b.map(
                  (b) =>
                    html`<ul>
                      ${b.c.map((x) => html`<li class="a-${core.a} b-${b.c} c-${x.id}">x</li>`)}
                    </ul>`
                )}
              </section>`
          )}
        </div>`,
    })
    // TODO: добавить методы (.length)
    it("парсинг", () => {
      expect(view.schema, "трёхуровневый массив (core.a[].b[].c[])").toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              tag: "section",
              type: "el",
              item: {
                src: "core",
                key: "a",
              },
              child: [
                {
                  tag: "ul",
                  type: "el",
                  item: {
                    src: ["core", "a"],
                    key: "b",
                  },
                  child: [
                    {
                      tag: "li",
                      type: "el",
                      item: {
                        src: ["core", "a", "b"],
                        key: "c",
                      },
                      attrs: {
                        class: {
                          items: [
                            { src: "core", key: "a" },
                            { src: ["core", "a", "b"], key: "c" },
                            { src: ["core", "a", "b", "c"], key: "id" },
                          ],
                          template: "a-${0} b-${1} c-${2}",
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
              <li class="a-${core.a} b-${core.a[0].b} c-${core.a[0].b[0].c[0].id}">x</li>
              <li class="a-${core.a} b-${core.a[0].b} c-${core.a[0].b[0].c[1].id}">x</li>
            </ul>
          </section>
          <section>
            <ul>
              <li class="a-${core.a} b-${core.a[1].b} c-${core.a[1].b[0].c[0].id}">x</li>
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
              tag: "section",
              type: "el",
              item: {
                src: "core",
                key: "list",
              },
              attrs: {
                "data-g": {
                  src: ["core", "list"],
                  key: "gid",
                },
              },
              child: [
                {
                  tag: "ul",
                  type: "el",
                  item: {
                    src: ["core", "list"],
                    key: "children",
                  },
                  child: [
                    {
                      tag: "li",
                      type: "el",
                      item: {
                        src: ["core", "list", "children"],
                        key: "items",
                      },
                      attrs: {
                        class: {
                          items: [
                            { src: ["core", "list"], key: "gid" },
                            { src: ["core", "list", "children"], key: "cid" },
                            { src: ["core", "list", "children", "items"], key: "id" },
                          ],
                          template: "g-${0} ch-${1} i-${2}",
                        },
                        title: {
                          src: ["core", "list", "children", "items"],
                          key: "name",
                        },
                      },
                      child: [
                        {
                          type: "text",
                          value: "ok",
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
              <li
                class="g-${core.list[0].gid} ch-${core.list[0].children[0].cid} i-${core.list[0].children[0].items[0]
                  .id}"
                title="${core.list[0].children[0].items[0].name}">
                ok
              </li>
            </ul>
          </section>
          <section data-g="${core.list[1].gid}">
            <ul>
              <li
                class="g-${core.list[1].gid} ch-${core.list[1].children[0].cid} i-${core.list[1].children[0].items[0]
                  .id}"
                title="${core.list[1].children[0].items[0].name}">
                ok
              </li>
              <li
                class="g-${core.list[1].gid} ch-${core.list[1].children[0].cid} i-${core.list[1].children[0].items[1]
                  .id}"
                title="${core.list[1].children[0].items[1].name}">
                ok
              </li>
            </ul>
          </section>
        </div>
      `)
    })
  })
})
