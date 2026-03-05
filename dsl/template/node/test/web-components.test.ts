import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../index"

describe("web-components", () => {
  describe("базовые custom elements", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(({ html }) => html`<my-element></my-element>`)
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "my-element",
          type: "el",
        },
      ])
    })
  })

  describe("custom elements с атрибутами", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(({ html }) => html`<user-card name="John" age="25"></user-card>`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "user-card",
          type: "el",
          string: {
            age: "25",
            name: "John",
          },
        },
      ])
    })
  })

  describe("self-closing custom elements", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(({ html }) => html`<loading-spinner />`)
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "loading-spinner",
          type: "el",
        },
      ])
    })
  })

  describe("вложенные custom elements", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(
        ({ html }) => html`
          <app-header>
            <nav-menu>
              <menu-item>Home</menu-item>
            </nav-menu>
          </app-header>
        `
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "app-header",
          type: "el",
          child: [
            {
              tag: "nav-menu",
              type: "el",
              child: [
                {
                  tag: "menu-item",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      value: "Home",
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

  describe("custom elements с template literals в атрибутах", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ userId: string; theme: string }>(
        ({ html, fields }) => html`<user-profile id="${fields.userId}" theme="${fields.theme}"></user-profile>`
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "user-profile",
          type: "el",
          string: {
            id: {
              data: "/fields/userId",
            },
            theme: {
              data: "/fields/theme",
            },
          },
        },
      ])
    })
  })

  describe("custom elements в условиях", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<{ isAdmin: boolean }>(
        ({ html, fields }) =>
          html`${fields.isAdmin ? html`<admin-panel></admin-panel>` : html`<user-panel></user-panel>`}`
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          type: "cond",
          data: "/fields/isAdmin",
          child: [
            {
              tag: "admin-panel",
              type: "el",
            },
            {
              tag: "user-panel",
              type: "el",
            },
          ],
        },
      ])
    })
  })

  describe("custom elements в map", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse<any, { users: { id: string; name: string }[] }>(
        ({ html, mass }) => html`
          <user-list>
            ${mass.users.map((user) => html`<user-item id="${user.id}">${user.name}</user-item>`)}
          </user-list>
        `
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "user-list",
          type: "el",
          child: [
            {
              type: "map",
              data: "/mass/users",
              child: [
                {
                  tag: "user-item",
                  type: "el",
                  child: [
                    {
                      type: "text",
                      data: "[item]/name",
                    },
                  ],
                  string: {
                    id: {
                      data: "[item]/id",
                    },
                  },
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("custom elements с дефисами в разных позициях", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(
        ({ html }) => html`
          <x-component></x-component>
          <my-component></my-component>
          <component-with-dashes></component-with-dashes>
          <a-b-c-d></a-b-c-d>
        `
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        { tag: "x-component", type: "el" },
        { tag: "my-component", type: "el" },
        { tag: "component-with-dashes", type: "el" },
        { tag: "a-b-c-d", type: "el" },
      ])
    })
  })

  describe("custom elements с сложными атрибутами", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(
        ({ html }) => html`
          <data-table columns='["name", "age", "email"]' sortable="true" filterable theme="dark"></data-table>
        `
      )
    })

    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "data-table",
          type: "el",
          string: {
            columns: '["name", "age", "email"]',
            sortable: "true",
            theme: "dark",
          },
          boolean: {
            filterable: true,
          },
        },
      ])
    })
  })

  describe("custom elements с событиями", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(
        ({ html, mass }) => html`
          <modal-dialog onclose=${() => mass.close()} onopen=${() => mass.open()} data-modal-id="user-modal">
          </modal-dialog>
        `
      )
    })
    it("data", () => {
      expect(elements).toEqual([
        {
          tag: "modal-dialog",
          type: "el",
          event: {
            onclose: {
              data: "/mass/close",
              expr: "() => _[0]()",
            },
            onopen: {
              data: "/mass/open",
              expr: "() => _[0]()",
            },
          },
          string: {
            "data-modal-id": "user-modal",
          },
        },
      ])
    })
  })
})
