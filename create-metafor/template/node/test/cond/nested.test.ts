import { describe, it, expect, beforeAll } from "bun:test"
import { parse } from "../../../index.ts"
import type { NodeType } from "@metafor/types/template/node/index"

describe("вложенные условия", () => {
  describe("if else if", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<any, { flag1: boolean; flag2: boolean }>(
        ({ html, value }) => html`
          ${value.flag1
            ? html`<div class="flag1"></div>`
            : value.flag2
              ? html`<div class="flag2"></div>`
              : html`<div class="flag3"></div>`}
        `,
      )
    })
    it("data", () =>
      expect(elements).toEqual([
        {
          type: "cond",
          data: "/value/flag1",
          child: [
            {
              tag: "div",
              type: "el",
              string: {
                class: "flag1",
              },
            },
            {
              type: "cond",
              data: "/value/flag2",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "flag2",
                  },
                },
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "flag3",
                  },
                },
              ],
            },
          ],
        },
      ]))
  })
  describe("if if", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<any, { hasPermission: boolean; isAdmin: boolean }>(
        ({ html, value }) => html`
          <div>
            ${value.hasPermission
              ? value.isAdmin
                ? html`
                    <div>
                      <button class="admin">Admin Action</button>
                    </div>
                  `
                : html`
                    <div>
                      <button class="user">User Action</button>
                    </div>
                  `
              : html`<div class="no-access">Access Denied</div>`}
          </div>
        `,
      )
    })
    it("data", () =>
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: "/value/hasPermission",
              child: [
                {
                  type: "cond",
                  data: "/value/isAdmin",
                  child: [
                    {
                      tag: "div",
                      type: "el",
                      child: [
                        {
                          tag: "button",
                          type: "el",
                          string: {
                            class: "admin",
                          },
                          child: [{ type: "text", value: "Admin Action" }],
                        },
                      ],
                    },
                    {
                      tag: "div",
                      type: "el",
                      child: [
                        {
                          tag: "button",
                          type: "el",
                          string: {
                            class: "user",
                          },
                          child: [{ type: "text", value: "User Action" }],
                        },
                      ],
                    },
                  ],
                },
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "no-access",
                  },
                  child: [{ type: "text", value: "Access Denied" }],
                },
              ],
            },
          ],
        },
      ]))
  })

  describe("if if if", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<any, { hasPermission: boolean; isAdmin: boolean; isSuperAdmin: boolean }>(
        ({ html, value }) => html`
          <div>
            ${value.hasPermission
              ? value.isAdmin
                ? value.isSuperAdmin
                  ? html`<div class="super-admin">Super Admin Panel</div>`
                  : html`<div class="admin">Admin Panel</div>`
                : html`<div class="user">User Panel</div>`
              : html`<div class="no-access">Access Denied</div>`}
          </div>
        `,
      )
    })
    it("data", () =>
      expect(elements).toEqual([
        {
          tag: "div",
          type: "el",
          child: [
            {
              type: "cond",
              data: "/value/hasPermission",
              child: [
                {
                  type: "cond",
                  data: "/value/isAdmin",
                  child: [
                    {
                      type: "cond",
                      data: "/value/isSuperAdmin",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "super-admin",
                          },
                          child: [
                            {
                              type: "text",
                              value: "Super Admin Panel",
                            },
                          ],
                        },
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "admin",
                          },
                          child: [
                            {
                              type: "text",
                              value: "Admin Panel",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      tag: "div",
                      type: "el",
                      string: {
                        class: "user",
                      },
                      child: [
                        {
                          type: "text",
                          value: "User Panel",
                        },
                      ],
                    },
                  ],
                },
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "no-access",
                  },
                  child: [
                    {
                      type: "text",
                      value: "Access Denied",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]))
  })
})
