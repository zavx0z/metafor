import { describe, it, expect } from "bun:test"
import { extractHtmlElements, extractMainHtmlBlock } from "../splitter"
import { makeHierarchy } from "../hierarchy"
import { enrichWithData } from "../data"
import { extractAttributes } from "../attributes"

describe("атрибуты", () => {
  describe("namespace", () => {
    const mainHtml = extractMainHtmlBlock(({ html }) => html`<svg:use xlink:href="#id"></svg:use>`)

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: '<svg:use xlink:href="#id">', index: 0, name: "svg:use", kind: "open" },
        { text: "</svg:use>", index: 26, name: "svg:use", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "svg:use",
          type: "el",
          text: '<svg:use xlink:href="#id">',
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "svg:use",
          type: "el",
          string: {
            "xlink:href": {
              type: "static",
              value: "#id",
            },
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "svg:use",
          type: "el",
          string: {
            "xlink:href": "#id",
          },
        },
      ]))
  })

  describe("двойные/одинарные кавычки", () => {
    const mainHtml = extractMainHtmlBlock(({ html }) => html`<a href="https://e.co" target="_blank">x</a>`)

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: '<a href="https://e.co" target="_blank">', index: 0, name: "a", kind: "open" },
        { text: "x", index: 39, name: "", kind: "text" },
        { text: "</a>", index: 40, name: "a", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "a",
          type: "el",
          text: '<a href="https://e.co" target="_blank">',
          child: [
            {
              type: "text",
              text: "x",
            },
          ],
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "a",
          type: "el",
          string: {
            href: {
              type: "static",
              value: "https://e.co",
            },
            target: {
              type: "static",
              value: "_blank",
            },
          },
          child: [
            {
              type: "text",
              text: "x",
            },
          ],
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "a",
          type: "el",
          string: {
            href: "https://e.co",
            target: "_blank",
          },
          child: [
            {
              type: "text",
              value: "x",
            },
          ],
        },
      ]))
  })

  describe("угловые скобки внутри значения", () => {
    const mainHtml = extractMainHtmlBlock(({ html }) => html`<div title="a > b, c < d"></div>`)

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: '<div title="a > b, c < d">', index: 0, name: "div", kind: "open" },
        { text: "</div>", index: 26, name: "div", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: '<div title="a > b, c < d">',
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              type: "static",
              value: "a > b, c < d",
            },
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: "a > b, c < d",
          },
        },
      ]))
  })

  describe("условие в атрибуте", () => {
    const mainHtml = extractMainHtmlBlock<{ flag: boolean }>(
      ({ html, context }) => html`<div title="${context.flag ? "a > b" : "c < d"}"></div>`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: '<div title="${context.flag ? "a > b" : "c < d"}">', index: 0, name: "div", kind: "open" },
        { text: "</div>", index: 49, name: "div", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: '<div title="${context.flag ? "a > b" : "c < d"}">',
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              type: "dynamic",
              value: 'context.flag ? "a > b" : "c < d"',
            },
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              data: "/context/flag",
              expr: '${0} ? "a > b" : "c < d"',
            },
          },
        },
      ]))
  })

  describe("условие в аттрибуте без кавычек", () => {
    const mainHtml = extractMainHtmlBlock<{ flag: boolean }>(
      ({ html, context }) => html`<div title=${context.flag ? "a > b" : "c < d"}></div>`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: '<div title=${context.flag ? "a > b" : "c < d"}>', index: 0, name: "div", kind: "open" },
        { text: "</div>", index: 47, name: "div", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: '<div title=${context.flag ? "a > b" : "c < d"}>',
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              type: "dynamic",
              value: 'context.flag ? "a > b" : "c < d"',
            },
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              data: "/context/flag",
              expr: '${0} ? "a > b" : "c < d"',
            },
          },
        },
      ]))
  })

  describe("условие в аттрибуте с одинарными кавычками", () => {
    const mainHtml = extractMainHtmlBlock<{ flag: boolean }>(
      // prettier-ignore
      ({ html, context }) => html`<div title='${context.flag ? "a > b" : "c < d"}'></div>`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: '<div title=\'${context.flag ? "a > b" : "c < d"}\'>', index: 0, name: "div", kind: "open" },
        { text: "</div>", index: 49, name: "div", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: '<div title=\'${context.flag ? "a > b" : "c < d"}\'>',
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              type: "dynamic",
              value: 'context.flag ? "a > b" : "c < d"',
            },
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () => {
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            title: {
              data: "/context/flag",
              expr: '${0} ? "a > b" : "c < d"',
            },
          },
        },
      ])
    })
  })

  it("булевые атрибуты", () => {
    const mainHtml = extractMainHtmlBlock<{ flag: boolean }>(
      ({ html, context }) => html`<button ${context.flag && "disabled"}></button>`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: '<button ${context.flag && "disabled"}>', index: 0, name: "button", kind: "open" },
        { text: "</button>", index: 38, name: "button", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "button",
          type: "el",
          text: '<button ${context.flag && "disabled"}>',
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "button",
          type: "el",
          boolean: {
            disabled: {
              type: "dynamic",
              value: "context.flag",
            },
          },
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "button",
          type: "el",
          boolean: {
            disabled: {
              data: "/context/flag",
            },
          },
        },
      ]))
  })

  describe("класс в map", () => {
    const mainHtml = extractMainHtmlBlock<any, { items: { type: string; name: string }[] }>(
      ({ html, core }) => html`
        <ul>
          ${core.items.map((item) => html`<li class="item-${item.type}" title="${item.name}">${item.name}</li>`)}
        </ul>
      `
    )
    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: "<ul>", index: 9, name: "ul", kind: "open" },
        { text: '<li class="item-${item.type}" title="${item.name}">', index: 56, name: "li", kind: "open" },
        { text: "${item.name}", index: 107, name: "", kind: "text" },
        { text: "</li>", index: 119, name: "li", kind: "close" },
        { text: "</ul>", index: 136, name: "ul", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "ul",
          type: "el",
          text: "<ul>",
          child: [
            {
              type: "map",
              text: "core.items.map((item)`",
              child: [
                {
                  tag: "li",
                  type: "el",
                  text: '<li class="item-${item.type}" title="${item.name}">',
                  child: [
                    {
                      type: "text",
                      text: "${item.name}",
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
          tag: "ul",
          type: "el",
          child: [
            {
              type: "map",
              text: "core.items.map((item)`",
              child: [
                {
                  tag: "li",
                  type: "el",
                  string: {
                    class: {
                      type: "mixed",
                      value: "item-${item.type}",
                    },
                    title: {
                      type: "dynamic",
                      value: "item.name",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      text: "${item.name}",
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
                      expr: "item-${0}",
                    },
                    title: {
                      data: "[item]/name",
                    },
                  },
                  child: [
                    {
                      type: "text",
                      data: "[item]/name",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]))
  })

  describe("сложные условные атрибуты class", () => {
    const mainHtml = extractMainHtmlBlock<{ active: boolean }>(
      ({ html, core }) => html`<div class="div-${core.active ? "active" : "inactive"}">Content</div>`
    )

    const elements = extractHtmlElements(mainHtml)
    it("elements", () =>
      expect(elements).toEqual([
        { text: '<div class="div-${core.active ? "active" : "inactive"}">', index: 0, name: "div", kind: "open" },
        { text: "Content", index: 56, name: "", kind: "text" },
        { text: "</div>", index: 63, name: "div", kind: "close" },
      ]))

    const hierarchy = makeHierarchy(mainHtml, elements)
    it("hierarchy", () =>
      expect(hierarchy).toEqual([
        {
          tag: "div",
          type: "el",
          text: '<div class="div-${core.active ? "active" : "inactive"}">',
          child: [
            {
              type: "text",
              text: "Content",
            },
          ],
        },
      ]))

    const attributes = extractAttributes(hierarchy)
    it("attributes", () =>
      expect(attributes).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              type: "mixed",
              value: 'div-${core.active ? "active" : "inactive"}',
            },
          },
          child: [
            {
              type: "text",
              text: "Content",
            },
          ],
        },
      ]))

    const data = enrichWithData(attributes)
    it("data", () =>
      expect(data).toEqual([
        {
          tag: "div",
          type: "el",
          string: {
            class: {
              data: "/core/active",
              expr: 'div-${0 ? "active" : "inactive"}',
            },
          },
          child: [
            {
              type: "text",
              value: "Content",
            },
          ],
        },
      ]))
  })
})
