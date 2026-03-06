import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type NodeType } from "../../../index"

describe("вложенные условия", () => {
  describe("if else if", () => {
    let elements: NodeType[]
    beforeAll(() => {
      elements = parse<any, { flag1: boolean; flag2: boolean }>(
        ({ html, fields }) => html`
          ${fields.flag1
            ? html`<div class="flag1"></div>`
            : fields.flag2
            ? html`<div class="flag2"></div>`
            : html`<div class="flag3"></div>`}
        `
      )
    })
    it("data", () =>
      expect(elements).toEqual([
        {
          type: "cond",
          data: "/fields/flag1",
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
              data: "/fields/flag2",
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
        ({ html, fields }) => html`
          <div>
            ${fields.hasPermission
              ? fields.isAdmin
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
        `
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
              data: "/fields/hasPermission",
              child: [
                {
                  type: "cond",
                  data: "/fields/isAdmin",
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
        ({ html, fields }) => html`
          <div>
            ${fields.hasPermission
              ? fields.isAdmin
                ? fields.isSuperAdmin
                  ? html`<div class="super-admin">Super Admin Panel</div>`
                  : html`<div class="admin">Admin Panel</div>`
                : html`<div class="user">User Panel</div>`
              : html`<div class="no-access">Access Denied</div>`}
          </div>
        `
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
              data: "/fields/hasPermission",
              child: [
                {
                  type: "cond",
                  data: "/fields/isAdmin",
                  child: [
                    {
                      type: "cond",
                      data: "/fields/isSuperAdmin",
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
