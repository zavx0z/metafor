import { describe, it, expect, beforeAll } from "bun:test"
import { parse, type Node } from "../../../index"

describe("meta-компоненты с fields/mass в map и condition", () => {
  describe("meta-элемент с пустыми объектами", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(({ html }) => html` <meta-hash fields=${{}} mass=${{}} /> `)
    })
    it("attributes", () => {
      expect(elements, "при обработке пустых объектов не должен устанавливаться mass и fields").toEqual([
        {
          tag: "meta-hash",
          type: "meta",
        },
      ])
    })
    it("data", () => {
      expect(elements, "fields и mass не должно быть в data").toEqual([
        {
          tag: "meta-hash",
          type: "meta",
        },
      ])
    })
  })
  describe("meta-компоненты в map с mass объектами", () => {
    type Core = { items: any[]; tag: string; type: string }
    let elements: Node[]

    beforeAll(() => {
      elements = parse<any, Core>(
        ({ html, mass, fields }) => html`
          <div>
            ${mass.items.map(
              (item) => html`
                <meta-${mass.tag}
                  mass=${{ id: item.id, name: item.name, type: mass.type }}
                  fields=${{ status: item.status, active: item.active }} />
              `
            )}
          </div>
        `
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
              data: "/mass/items",
              child: [
                {
                  tag: {
                    data: "/mass/tag",
                    expr: "meta-${_[0]}",
                  },
                  type: "meta",
                  mass: {
                    data: ["[item]/id", "[item]/name", "/mass/type"],
                    expr: "{ id: _[0], name: _[1], type: _[2] }",
                  },
                  fields: {
                    data: ["[item]/status", "[item]/active"],
                    expr: "{ status: _[0], active: _[1] }",
                  },
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("meta-компоненты в condition с fields/mass объектами", () => {
    let elements: Node[]

    beforeAll(() => {
      elements = parse(
        ({ html, mass, fields }) => html`
          <div>
            ${fields.showMeta
              ? html`
                  <meta-${mass.tag}
                    mass=${{ id: fields.id, name: fields.name }}
                    fields=${{ type: "primary", active: true }} />
                `
              : html`
                  <meta-${mass.tag}
                    mass=${{ id: "default", name: "default" }}
                    fields=${{ type: "secondary", active: false }} />
                `}
          </div>
        `
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
              data: "/fields/showMeta",
              child: [
                {
                  tag: {
                    data: "/mass/tag",
                    expr: "meta-${_[0]}",
                  },
                  type: "meta",
                  mass: {
                    data: ["/fields/id", "/fields/name"],
                    expr: "{ id: _[0], name: _[1] }",
                  },
                  fields: '{ type: "primary", active: true }',
                },
                {
                  tag: {
                    data: "/mass/tag",
                    expr: "meta-${_[0]}",
                  },
                  type: "meta",
                  mass: '{ id: "default", name: "default" }',
                  fields: '{ type: "secondary", active: false }',
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("meta-компоненты в map внутри condition", () => {
    type Core = { items: any[]; tag: string; type: string }
    let elements: Node[]

    beforeAll(() => {
      elements = parse<any, Core>(
        ({ html, mass, fields }) => html`
          <div>
            ${fields.showList
              ? html`
                  ${mass.items.map(
                    (item) => html`
                      <meta-${mass.tag}
                        mass=${{
                          id: item.id,
                          name: item.name,
                          type: mass.type,
                          metadata: item.metadata,
                        }}
                        fields=${{
                          status: item.status,
                          active: item.active,
                          permissions: item.permissions,
                        }} />
                    `
                  )}
                `
              : html`
                  <meta-${mass.tag}
                    mass=${{ id: "empty", name: "empty" }}
                    fields=${{ type: "empty", active: false }} />
                `}
          </div>
        `
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
              data: "/fields/showList",
              child: [
                {
                  type: "map",
                  data: "/mass/items",
                  child: [
                    {
                      tag: {
                        data: "/mass/tag",
                        expr: "meta-${_[0]}",
                      },
                      type: "meta",
                      mass: {
                        data: ["[item]/id", "[item]/name", "/mass/type", "[item]/metadata"],
                        expr: "{ id: _[0], name: _[1], type: _[2], metadata: _[3] }",
                      },
                      fields: {
                        data: ["[item]/status", "[item]/active", "[item]/permissions"],
                        expr: "{ status: _[0], active: _[1], permissions: _[2] }",
                      },
                    },
                  ],
                },
                {
                  tag: {
                    data: "/mass/tag",
                    expr: "meta-${_[0]}",
                  },
                  type: "meta",
                  mass: '{ id: "empty", name: "empty" }',
                  fields: '{ type: "empty", active: false }',
                },
              ],
            },
          ],
        },
      ])
    })
  })

  describe("meta-компоненты в condition внутри map", () => {
    type Core = { items: any[]; tag: string }
    let elements: Node[]

    beforeAll(() => {
      elements = parse<any, Core>(
        ({ html, mass }) => html`
          <div>
            ${mass.items.map(
              (item) => html`
                ${item.isActive
                  ? html`
                      <meta-${mass.tag}
                        mass=${{
                          id: item.id,
                          name: item.name,
                          type: "active",
                        }}
                        fields=${{
                          status: "active",
                          permissions: item.permissions,
                        }} />
                    `
                  : item.hasError
                  ? html`
                      <meta-${mass.tag}
                        mass=${{
                          id: item.id,
                          name: item.name,
                          type: "error",
                        }}
                        fields=${{
                          status: "error",
                          message: "Item has error",
                        }} />
                    `
                  : html`
                      <meta-${mass.tag}
                        mass=${{ id: item.id, name: item.name, type: "inactive" }}
                        fields=${{ status: "inactive" }} />
                    `}
              `
            )}
          </div>
        `
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
              data: "/mass/items",
              child: [
                {
                  type: "cond",
                  data: "[item]/isActive",
                  child: [
                    {
                      tag: {
                        data: "/mass/tag",
                        expr: "meta-${_[0]}",
                      },
                      type: "meta",
                      mass: {
                        data: ["[item]/id", "[item]/name"],
                        expr: '{ id: _[0], name: _[1], type: "active" }',
                      },
                      fields: {
                        data: "[item]/permissions",
                        expr: '{ status: "active", permissions: _[0] }',
                      },
                    },
                    {
                      type: "cond",
                      data: "[item]/hasError",
                      child: [
                        {
                          tag: {
                            data: "/mass/tag",
                            expr: "meta-${_[0]}",
                          },
                          type: "meta",
                          mass: {
                            data: ["[item]/id", "[item]/name"],
                            expr: '{ id: _[0], name: _[1], type: "error" }',
                          },
                          fields: '{ status: "error", message: "Item has error" }',
                        },
                        {
                          tag: {
                            data: "/mass/tag",
                            expr: "meta-${_[0]}",
                          },
                          type: "meta",
                          mass: {
                            data: ["[item]/id", "[item]/name"],
                            expr: '{ id: _[0], name: _[1], type: "inactive" }',
                          },
                          fields: '{ status: "inactive" }',
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

  describe("сложные meta-компоненты с вложенными fields/mass объектами", () => {
    type Core = { users: any[]; tag: string }
    let elements: Node[]

    beforeAll(() => {
      elements = parse<any, Core>(
        ({ html, mass }) => html`
          <div>
            ${mass.users.map(
              (user) => html`
                ${user.permissions.includes("admin")
                  ? html`<meta-${mass.tag}
                      mass=${{
                        id: user.id,
                        name: user.name,
                        type: "admin",
                        permissions: user.permissions,
                        metadata: {
                          level: "admin",
                          access: "full",
                          settings: user.settings,
                        },
                      }}
                      fields=${{
                        status: "admin",
                        active: user.isOnline,
                        canEdit: true,
                        canDelete: true,
                        canManage: true,
                      }} />`
                  : user.permissions.includes("moderator")
                  ? html`<meta-${mass.tag}
                      mass=${{
                        id: user.id,
                        name: user.name,
                        type: "moderator",
                        permissions: user.permissions,
                        metadata: {
                          level: "moderator",
                          access: "limited",
                          settings: user.settings,
                        },
                      }}
                      fields=${{
                        status: "moderator",
                        active: user.isOnline,
                        canEdit: true,
                        canDelete: false,
                        canManage: false,
                      }} />`
                  : html`<meta-${mass.tag}
                      mass=${{
                        id: user.id,
                        name: user.name,
                        type: "user",
                        permissions: user.permissions,
                        metadata: {
                          level: "user",
                          access: "basic",
                          settings: user.settings,
                        },
                      }}
                      fields=${{
                        status: "user",
                        active: user.isOnline,
                        canEdit: false,
                        canDelete: false,
                        canManage: false,
                      }} />`}
              `
            )}
          </div>
        `
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
              data: "/mass/users",
              child: [
                {
                  type: "cond",
                  data: "[item]/permissions/includes",
                  expr: '_[0]("admin")',
                  child: [
                    {
                      tag: {
                        data: "/mass/tag",
                        expr: "meta-${_[0]}",
                      },
                      type: "meta",
                      mass: {
                        data: ["[item]/id", "[item]/name", "[item]/permissions", "[item]/settings"],
                        expr: '{ id: _[0], name: _[1], type: "admin", permissions: _[2], metadata: { level: "admin", access: "full", settings: _[3] } }',
                      },
                      fields: {
                        data: "[item]/isOnline",
                        expr: '{ status: "admin", active: _[0], canEdit: true, canDelete: true, canManage: true }',
                      },
                    },
                    {
                      type: "cond",
                      data: "[item]/permissions/includes",
                      expr: '_[0]("moderator")',
                      child: [
                        {
                          tag: {
                            data: "/mass/tag",
                            expr: "meta-${_[0]}",
                          },
                          type: "meta",
                          mass: {
                            data: ["[item]/id", "[item]/name", "[item]/permissions", "[item]/settings"],
                            expr: '{ id: _[0], name: _[1], type: "moderator", permissions: _[2], metadata: { level: "moderator", access: "limited", settings: _[3] } }',
                          },
                          fields: {
                            data: "[item]/isOnline",
                            expr: '{ status: "moderator", active: _[0], canEdit: true, canDelete: false, canManage: false }',
                          },
                        },
                        {
                          tag: {
                            data: "/mass/tag",
                            expr: "meta-${_[0]}",
                          },
                          type: "meta",
                          mass: {
                            data: ["[item]/id", "[item]/name", "[item]/permissions", "[item]/settings"],
                            expr: '{ id: _[0], name: _[1], type: "user", permissions: _[2], metadata: { level: "user", access: "basic", settings: _[3] } }',
                          },
                          fields: {
                            data: "[item]/isOnline",
                            expr: '{ status: "user", active: _[0], canEdit: false, canDelete: false, canManage: false }',
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
      ])
    })
  })

  describe("meta-компоненты с динамическими mass/context объектами", () => {
    type Core = { items: any[]; tag: string; type: string }
    let elements: Node[]

    beforeAll(() => {
      elements = parse<any, Core>(
        ({ html, mass, fields }) => html`
          <div>
            ${mass.items.map(
              (item) => html`
                <meta-${mass.tag}
                  mass=${{
                    id: item.id,
                    name: item.name,
                    type: mass.type,
                    dynamic: item.isActive ? "active" : "inactive",
                    computed: `${item.id}-${item.name}`,
                    metadata: {
                      status: item.status,
                      priority: item.priority || "normal",
                      tags: item.tags || [],
                    },
                  }}
                  fields=${{
                    status: item.isActive ? "active" : "inactive",
                    active: item.isActive,
                    canEdit: item.permissions.includes("edit"),
                    canDelete: item.permissions.includes("delete"),
                    dynamic: {
                      lastModified: item.lastModified,
                      created: item.created,
                      updated: item.updated || item.lastModified,
                    },
                  }} />
              `
            )}
          </div>
        `
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
              data: "/mass/items",
              child: [
                {
                  tag: {
                    data: "/mass/tag",
                    expr: "meta-${_[0]}",
                  },
                  type: "meta",
                  fields: {
                    data: [
                      "[item]/isActive",
                      "[item]/permissions/includes",
                      "[item]/lastModified",
                      "[item]/created",
                      "[item]/updated",
                    ],
                    expr: '{ status: _[0] ? "active" : "inactive", active: _[0], canEdit: _[1]("edit"), canDelete: _[1]("delete"), dynamic: { lastModified: _[2], created: _[3], updated: _[4] || _[2] } }',
                  },
                  mass: {
                    data: [
                      "[item]/id",
                      "[item]/name",
                      "/mass/type",
                      "[item]/isActive",
                      "[item]/status",
                      "[item]/priority",
                      "[item]/tags",
                    ],
                    expr: '{ id: _[0], name: _[1], type: _[2], dynamic: _[3] ? "active" : "inactive", computed: `${_[0]}-${_[1]}`, metadata: { status: _[4], priority: _[5] || "normal", tags: _[6] || [] } }',
                  },
                },
              ],
            },
          ],
        },
      ])
    })
  })
})
