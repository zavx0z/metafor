import { describe, it, expect } from "bun:test"
import { extractHtmlElements, extractMainHtmlBlock } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"
import { extractAttributes } from "../attributes"

describe("web-components", () => {
  describe("базовые custom elements", () => {
    const mainHtml = extractMainHtmlBlock(({ html }) => html`<my-element></my-element>`)

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: "<my-element>", index: 0, name: "my-element", kind: "open" },
        { text: "</my-element>", index: 12, name: "my-element", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "my-element",
          type: "el",
          text: "<my-element>",
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    it("attributes", () => {
      expect(attributes).toEqual([
        {
          tag: "my-element",
          type: "el",
        },
      ])
    })

    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
        {
          tag: "my-element",
          type: "el",
        },
      ])
    })
  })

  describe("custom elements с атрибутами", () => {
    const mainHtml = extractMainHtmlBlock(({ html }) => html`<user-card name="John" age="25"></user-card>`)

    const elements = extractHtmlElements(mainHtml)
    it("elements", () => {
      expect(elements).toEqual([
        { text: '<user-card name="John" age="25">', index: 0, name: "user-card", kind: "open" },
        { text: "</user-card>", index: 32, name: "user-card", kind: "close" },
      ])
    })

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () => {
      expect(hierarchy).toEqual([
        {
          tag: "user-card",
          type: "el",
          text: '<user-card name="John" age="25">',
        },
      ])
    })

    const attributes = extractAttributes(hierarchy)
    it("attributes", () => {
      expect(attributes).toEqual([
        {
          tag: "user-card",
          type: "el",
          string: {
            name: {
              type: "static",
              value: "John",
            },
            age: {
              type: "static",
              value: "25",
            },
          },
        },
      ])
    })

    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
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
    const mainHtml = extractMainHtmlBlock(({ html }) => html`<loading-spinner />`)

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        {
          text: "<loading-spinner />",
          index: 0,
          name: "loading-spinner",
          kind: "self",
        },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "loading-spinner",
          type: "el",
          text: "<loading-spinner />",
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "loading-spinner",
          type: "el",
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "loading-spinner",
          type: "el",
        },
      ]))
  })

  describe("вложенные custom elements", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html }) => html`
        <app-header>
          <nav-menu>
            <menu-item>Home</menu-item>
          </nav-menu>
        </app-header>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: "<app-header>", index: 9, name: "app-header", kind: "open" },
        { text: "<nav-menu>", index: 32, name: "nav-menu", kind: "open" },
        { text: "<menu-item>", index: 55, name: "menu-item", kind: "open" },
        { text: "Home", index: 66, name: "", kind: "text" },
        { text: "</menu-item>", index: 70, name: "menu-item", kind: "close" },
        { text: "</nav-menu>", index: 93, name: "nav-menu", kind: "close" },
        { text: "</app-header>", index: 113, name: "app-header", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "app-header",
          type: "el",
          text: "<app-header>",
          child: [
            {
              tag: "nav-menu",
              type: "el",
              text: "<nav-menu>",
              child: [
                {
                  tag: "menu-item",
                  type: "el",
                  text: "<menu-item>",
                  child: [
                    {
                      type: "text",
                      text: "Home",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
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
                      text: "Home",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
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
      ]))
  })

  describe("custom elements с template literals в атрибутах", () => {
    const mainHtml = extractMainHtmlBlock<{ userId: string; theme: string }>(
      ({ html, context }) => html`<user-profile id="${context.userId}" theme="${context.theme}"></user-profile>`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        {
          text: '<user-profile id="${context.userId}" theme="${context.theme}">',
          index: 0,
          name: "user-profile",
          kind: "open",
        },
        { text: "</user-profile>", index: 62, name: "user-profile", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "user-profile",
          type: "el",
          text: '<user-profile id="${context.userId}" theme="${context.theme}">',
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "user-profile",
          type: "el",
          string: {
            id: {
              type: "dynamic",
              value: "context.userId",
            },
            theme: {
              type: "dynamic",
              value: "context.theme",
            },
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "user-profile",
          type: "el",
          string: {
            id: {
              data: "/context/userId",
            },
            theme: {
              data: "/context/theme",
            },
          },
        },
      ]))
  })

  describe("custom elements в условиях", () => {
    const mainHtml = extractMainHtmlBlock<{ isAdmin: boolean }>(
      ({ html, context }) =>
        html`${context.isAdmin ? html`<admin-panel></admin-panel>` : html`<user-panel></user-panel>`}`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: "<admin-panel>", index: 25, name: "admin-panel", kind: "open" },
        { text: "</admin-panel>", index: 38, name: "admin-panel", kind: "close" },
        { text: "<user-panel>", index: 61, name: "user-panel", kind: "open" },
        { text: "</user-panel>", index: 73, name: "user-panel", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          type: "cond",
          text: "context.isAdmin",
          true: {
            tag: "admin-panel",
            type: "el",
            text: "<admin-panel>",
          },
          false: {
            tag: "user-panel",
            type: "el",
            text: "<user-panel>",
          },
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          type: "cond",
          text: "context.isAdmin",
          true: {
            tag: "admin-panel",
            type: "el",
          },
          false: {
            tag: "user-panel",
            type: "el",
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          type: "cond",
          data: "/context/isAdmin",
          true: {
            tag: "admin-panel",
            type: "el",
          },
          false: {
            tag: "user-panel",
            type: "el",
          },
        },
      ]))
  })

  describe("custom elements в map", () => {
    const mainHtml = extractMainHtmlBlock<any, { users: { id: string; name: string }[] }>(
      ({ html, core }) => html`
        <user-list> ${core.users.map((user) => html`<user-item id="${user.id}">${user.name}</user-item>`)} </user-list>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: "<user-list>", index: 9, name: "user-list", kind: "open" },
        { text: '<user-item id="${user.id}">', index: 53, name: "user-item", kind: "open" },
        { text: "${user.name}", index: 80, name: "", kind: "text" },
        { text: "</user-item>", index: 92, name: "user-item", kind: "close" },
        { text: "</user-list>", index: 108, name: "user-list", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "user-list",
          type: "el",
          text: "<user-list>",
          child: [
            {
              type: "map",
              text: "core.users.map((user)`",
              child: [
                {
                  tag: "user-item",
                  type: "el",
                  text: '<user-item id="${user.id}">',
                  child: [
                    {
                      type: "text",
                      text: "${user.name}",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "user-list",
          type: "el",
          child: [
            {
              type: "map",
              text: "core.users.map((user)`",
              child: [
                {
                  tag: "user-item",
                  type: "el",
                  string: {
                    id: {
                      type: "dynamic",
                      value: "user.id",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      text: "${user.name}",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "user-list",
          type: "el",
          child: [
            {
              type: "map",
              data: "/core/users",
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
      ]))
  })

  describe("custom elements с дефисами в разных позициях", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html }) => html`
        <x-component></x-component>
        <my-component></my-component>
        <component-with-dashes></component-with-dashes>
        <a-b-c-d></a-b-c-d>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: "<x-component>", index: 9, name: "x-component", kind: "open" },
        { text: "</x-component>", index: 22, name: "x-component", kind: "close" },
        { text: "<my-component>", index: 45, name: "my-component", kind: "open" },
        { text: "</my-component>", index: 59, name: "my-component", kind: "close" },
        { text: "<component-with-dashes>", index: 83, name: "component-with-dashes", kind: "open" },
        { text: "</component-with-dashes>", index: 106, name: "component-with-dashes", kind: "close" },
        { text: "<a-b-c-d>", index: 139, name: "a-b-c-d", kind: "open" },
        { text: "</a-b-c-d>", index: 148, name: "a-b-c-d", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        { tag: "x-component", type: "el", text: "<x-component>" },
        { tag: "my-component", type: "el", text: "<my-component>" },
        { tag: "component-with-dashes", type: "el", text: "<component-with-dashes>" },
        { tag: "a-b-c-d", type: "el", text: "<a-b-c-d>" },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        { tag: "x-component", type: "el" },
        { tag: "my-component", type: "el" },
        { tag: "component-with-dashes", type: "el" },
        { tag: "a-b-c-d", type: "el" },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        { tag: "x-component", type: "el" },
        { tag: "my-component", type: "el" },
        { tag: "component-with-dashes", type: "el" },
        { tag: "a-b-c-d", type: "el" },
      ]))
  })

  describe("custom elements с числами в имени", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html }) => html`
        <component-1></component-1>
        <my-component-2></my-component-2>
        <widget-3d></widget-3d>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    expect(elements).toEqual([
      { text: "<component-1>", index: 9, name: "component-1", kind: "open" },
      { text: "</component-1>", index: 22, name: "component-1", kind: "close" },
      { text: "<my-component-2>", index: 45, name: "my-component-2", kind: "open" },
      { text: "</my-component-2>", index: 61, name: "my-component-2", kind: "close" },
      { text: "<widget-3d>", index: 87, name: "widget-3d", kind: "open" },
      { text: "</widget-3d>", index: 98, name: "widget-3d", kind: "close" },
    ])
  })

  describe("custom elements с сложными атрибутами", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html }) => html`
        <data-table columns='["name", "age", "email"]' sortable="true" filterable theme="dark"></data-table>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        {
          text: '<data-table columns=\'["name", "age", "email"]\' sortable="true" filterable theme="dark">',
          index: 9,
          name: "data-table",
          kind: "open",
        },
        {
          text: "</data-table>",
          index: 96,
          name: "data-table",
          kind: "close",
        },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "data-table",
          type: "el",
          text: '<data-table columns=\'["name", "age", "email"]\' sortable="true" filterable theme="dark">',
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "data-table",
          type: "el",
          string: {
            columns: {
              type: "static",
              value: '["name", "age", "email"]',
            },
            sortable: {
              type: "static",
              value: "true",
            },
            theme: {
              type: "static",
              value: "dark",
            },
          },
          boolean: {
            filterable: {
              type: "static",
              value: true,
            },
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
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
      ]))
  })

  describe("custom elements с событиями", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html, core }) => html`
        <modal-dialog onclose=${() => core.close()} onopen=${() => core.open()} data-modal-id="user-modal">
        </modal-dialog>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        {
          text: '<modal-dialog onclose=${() => core.close()} onopen=${() => core.open()} data-modal-id="user-modal">',
          index: 9,
          name: "modal-dialog",
          kind: "open",
        },
        {
          text: "</modal-dialog>",
          index: 117,
          name: "modal-dialog",
          kind: "close",
        },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "modal-dialog",
          type: "el",
          text: '<modal-dialog onclose=${() => core.close()} onopen=${() => core.open()} data-modal-id="user-modal">',
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "modal-dialog",
          type: "el",
          event: {
            onclose: "() => core.close()",
            onopen: "() => core.open()",
          },
          string: {
            "data-modal-id": {
              type: "static",
              value: "user-modal",
            },
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          event: {
            onclose: {
              data: "/core/close",
              expr: "() => ${0}()",
            },
            onopen: {
              data: "/core/open",
              expr: "() => ${0}()",
            },
          },
          string: {
            "data-modal-id": "user-modal",
          },
          tag: "modal-dialog",
          type: "el",
        },
      ]))
  })

  describe("custom elements с shadow DOM", () => {
    const mainHtml = extractMainHtmlBlock(
      ({ html }) => html`
        <shadow-host>
          <template>
            <div class="shadow-content">
              <slot name="header"></slot>
              <slot></slot>
            </div>
          </template>
        </shadow-host>
      `
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: "<shadow-host>", index: 9, name: "shadow-host", kind: "open" },
        { text: "<template>", index: 33, name: "template", kind: "open" },
        { text: '<div class="shadow-content">', index: 56, name: "div", kind: "open" },
        { text: '<slot name="header">', index: 99, name: "slot", kind: "open" },
        { text: "</slot>", index: 119, name: "slot", kind: "close" },
        { text: "<slot>", index: 141, name: "slot", kind: "open" },
        { text: "</slot>", index: 147, name: "slot", kind: "close" },
        { text: "</div>", index: 167, name: "div", kind: "close" },
        { text: "</template>", index: 184, name: "template", kind: "close" },
        { text: "</shadow-host>", index: 204, name: "shadow-host", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "shadow-host",
          type: "el",
          text: "<shadow-host>",
          child: [
            {
              tag: "template",
              type: "el",
              text: "<template>",
              child: [
                {
                  tag: "div",
                  type: "el",
                  text: '<div class="shadow-content">',
                  child: [
                    {
                      tag: "slot",
                      type: "el",
                      text: '<slot name="header">',
                    },
                    {
                      tag: "slot",
                      type: "el",
                      text: "<slot>",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "shadow-host",
          type: "el",
          child: [
            {
              tag: "template",
              type: "el",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: {
                      type: "static",
                      value: "shadow-content",
                    },
                  },
                  child: [
                    {
                      tag: "slot",
                      type: "el",
                      string: {
                        name: {
                          type: "static",
                          value: "header",
                        },
                      },
                    },
                    {
                      tag: "slot",
                      type: "el",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "shadow-host",
          type: "el",
          child: [
            {
              tag: "template",
              type: "el",
              child: [
                {
                  tag: "div",
                  type: "el",
                  child: [
                    {
                      tag: "slot",
                      type: "el",
                      string: {
                        name: "header",
                      },
                    },
                    {
                      tag: "slot",
                      type: "el",
                    },
                  ],
                  string: {
                    class: "shadow-content",
                  },
                },
              ],
            },
          ],
        },
      ]))
  })

  describe("custom elements с булевыми атрибутами", () => {
    const mainHtml = extractMainHtmlBlock<{ isVisible: boolean; isDisabled: boolean }>(
      ({ html, context }) => html` <custom-button ${context.isDisabled && "disabled"}> Click me </custom-button> `
    )
    const elements = extractHtmlElements(mainHtml)
    const hierarchy = makeHierarchy(mainHtml, elements)
    const attributes = extractAttributes(hierarchy)
    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "custom-button",
          type: "el",
          child: [
            {
              type: "text",
              value: " Click me ",
            },
          ],
          boolean: {
            disabled: {
              data: "/context/isDisabled",
            },
          },
        },
      ]))
  })
})
