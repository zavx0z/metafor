import { describe, it, expect, beforeAll } from "bun:test"
import { parse } from "../../../index.ts"
import type { NodeType } from "@metafor/types/template/node/index"

describe("логические операторы в условиях", () => {
  describe("логический оператор с вложенными элементами в условии", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<
        { showDetails: { type: "boolean" } },
        { user: { name: { type: "string" }; isVerified: { type: "boolean" } } }
      >(
        ({ html, value, mass }) => html`
          <div>
            ${mass.user && value.showDetails
              ? html`
                  <div class="user-profile">
                    <h2>${mass.user.name}</h2>
                    ${mass.user.isVerified && html` <span class="verified-badge">VERIFIED</span> `}
                    <p>User details</p>
                  </div>
                `
              : html`
                  <div class="no-profile">
                    <p>No profile available</p>
                  </div>
                `}
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
              data: ["/mass/user", "/value/showDetails"],
              expr: "_[0] && _[1]",
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "user-profile",
                  },
                  child: [
                    {
                      tag: "h2",
                      type: "el",
                      child: [
                        {
                          type: "text",
                          data: "/mass/user/name",
                        },
                      ],
                    },
                    {
                      type: "log",
                      data: "/mass/user/isVerified",
                      child: [
                        {
                          tag: "span",
                          type: "el",
                          string: {
                            class: "verified-badge",
                          },
                          child: [
                            {
                              type: "text",
                              value: "VERIFIED",
                            },
                          ],
                        },
                      ],
                    },
                    {
                      tag: "p",
                      type: "el",
                      child: [
                        {
                          type: "text",
                          value: "User details",
                        },
                      ],
                    },
                  ],
                },
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "no-profile",
                  },
                  child: [
                    {
                      tag: "p",
                      type: "el",
                      child: [
                        {
                          type: "text",
                          value: "No profile available",
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

  describe("сложный логический оператор в условии", () => {
    let elements: NodeType[]

    beforeAll(() => {
      elements = parse<{ isAdmin: { type: "boolean" } }, { user: { role: string; isActive: boolean } }>(
        ({ html, value, mass }) => html`
          <div>
            ${mass.user && mass.user.role === "admin" && value.isAdmin
              ? html`
                  <div class="admin-dashboard">
                    <h1>Admin Dashboard</h1>
                    ${mass.user.isActive &&
                    html`
                      <div class="active-admin">
                        <span class="status">Active</span>
                        <button>Manage Users</button>
                      </div>
                    `}
                  </div>
                `
              : html`
                  <div class="user-dashboard">
                    <h1>User Dashboard</h1>
                    <p>Welcome, user!</p>
                  </div>
                `}
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
              data: ["/mass/user", "/mass/user/role", "/value/isAdmin"],
              expr: '_[0] && _[1] === "admin" && _[2]',
              child: [
                {
                  tag: "div",
                  type: "el",
                  string: {
                    class: "admin-dashboard",
                  },
                  child: [
                    {
                      tag: "h1",
                      type: "el",
                      child: [
                        {
                          type: "text",
                          value: "Admin Dashboard",
                        },
                      ],
                    },
                    {
                      type: "log",
                      data: "/mass/user/isActive",
                      child: [
                        {
                          tag: "div",
                          type: "el",
                          string: {
                            class: "active-admin",
                          },
                          child: [
                            {
                              tag: "span",
                              type: "el",
                              string: {
                                class: "status",
                              },
                              child: [
                                {
                                  type: "text",
                                  value: "Active",
                                },
                              ],
                            },
                            {
                              tag: "button",
                              type: "el",
                              child: [
                                {
                                  type: "text",
                                  value: "Manage Users",
                                },
                              ],
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
                    class: "user-dashboard",
                  },
                  child: [
                    {
                      tag: "h1",
                      type: "el",
                      child: [
                        {
                          type: "text",
                          value: "User Dashboard",
                        },
                      ],
                    },
                    {
                      tag: "p",
                      type: "el",
                      child: [
                        {
                          type: "text",
                          value: "Welcome, user!",
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
