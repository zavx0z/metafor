import {afterEach, beforeEach, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import type {MetaDSL} from "../../.."
import type {Store} from "../../index.ts"
import {open} from "../../server.ts"
import {projectTemplateMatterRelations} from "../../../dark/matter.ts"

const richMeta: MetaDSL = {
  name: "rich",
  desc: "rich meta",
  fields: {
    status: {
      type: "enum",
      values: ["open", "closed"],
      label: "Status",
    },
    title: {
      type: "string",
      label: "Title",
    },
    enabled: {
      type: "boolean",
      required: true,
      default: true,
      label: "Enabled",
    },
    items: {
      type: "array",
      default: [1, 2],
      label: "Items",
    },
    note: {
      type: "string",
      label: "Note",
    },
  },
  superposition: {
    idle: {
      ready: {},
    },
    ready: {
      idle: {
        enabled: {
          eq: true,
        },
      },
    },
  },
  mass: {
    cache: "local",
  },
  processes: {
    ready: {
      type: "action",
      label: "Run",
      desc: "Run action",
      env: ["node", "browser"],
      action: {
        src: "./actions/run.ts",
        importSpecifier: "run",
        read: ["title", "enabled"],
      },
      success: {
        src: "({ update, data }) => update({ note: data.note })",
        read: ["title"],
        write: ["note"],
      },
      error: {
        src: "({ update, error }) => update({ note: error.message })",
        write: ["note"],
      },
    },
    idle: {
      type: "finally",
      label: "Cleanup",
      env: ["worker"],
      before: {
        src: "({ mass }) => { void mass.cache }",
        read: ["title"],
      },
    },
  },
  reactions: {
    reactions: {
      "sync-title": {
        label: "Sync title",
        cond: "() => true",
        src: "({ update }) => update({ title: 'synced' })",
        read: ["title"],
        write: ["title"],
      },
    },
    superposition: {
      ready: ["sync-title"],
    },
  },
  matter: [
    {
      type: "meta",
      tag: "meta-for",
      src: "owner/static-child",
      fields: {
        data: ["/value/title", "/value/status"],
        expr: "{ title: _[0], status: _[1] }",
      },
      mass: {
        data: "/mass/cache",
      },
      string: {
        title: {
          data: "/value/title",
        },
      },
      boolean: {
        hidden: {
          data: "/value/enabled",
          expr: "!_[0]",
        },
        inert: true,
      },
      array: {
        class: [
          "card",
          {
            data: "/value/status",
          },
          {
            data: "/value/enabled",
            expr: "_[0] ? 'enabled' : 'disabled'",
          },
        ],
      },
      style: {
        color: "red",
        display: {
          data: "/value/title",
          expr: "_[0] ? 'block' : 'none'",
        },
      },
      event: {
        onclick: {
          data: "/value/title",
          expr: "(event) => update({ note: _[0] })",
          upd: "note",
        },
      },
      child: [
        {
          type: "map",
          data: "/value/items",
          child: [
            {
              type: "meta",
              tag: "meta-for",
              src: "owner/item",
              fields: {
                data: "[item]",
                expr: "{ id: _[0] }",
              },
            },
          ],
        },
      ],
    },
    {
      type: "cond",
      data: "/value/enabled",
      child: [
        {
          type: "meta",
          tag: "meta-for",
          src: "owner/enabled",
        },
        {
          type: "meta",
          tag: "meta-for",
          src: "owner/disabled",
        },
      ],
    },
    {
      type: "log",
      data: "/state",
      expr: "_[0] === 'ready'",
      child: [
        {
          type: "meta",
          tag: "meta-for",
          src: {
            data: "/value/status",
            expr: "owner/${_[0]}",
          },
        },
      ],
    },
  ],
}

const explicitEmptyMeta: MetaDSL = {
  name: "empty",
  fields: {
    operation: {
      type: "enum",
      values: ["clone", "init"],
    },
  },
  superposition: {},
  mass: {},
  processes: {},
  reactions: {
    reactions: {},
    superposition: {},
  },
  matter: [],
}

describe("sqlite dark particle model", () => {
  let store: Store
  let sql: SQL

  beforeEach(async () => {
    store = await open(":memory:")
    sql = new SQL("sqlite::memory:")
  })

  afterEach(async () => {
    await sql.close()
    await store.close()
  })

  const countRows = async (table: string): Promise<number> => {
    const rows = (await (store as unknown as {meta: {sql?: SQL}}).meta.sql?.unsafe(
      `SELECT COUNT(*) AS count FROM ${table}`,
    )) as Array<{count: number}> | undefined
    return rows?.[0]?.count ?? 0
  }

  test("сохраняет particle-centric matter и даёт ORM loader поверх реляционных rows", async () => {
    await store.wimp.create("owner/rich", richMeta, projectTemplateMatterRelations(richMeta))

    const projection = (await store.wimp.readDarkParticleModel("owner/rich"))!
    expect(projection).toBeDefined()
    expect(projection.meta.fieldSchemas).toEqual(richMeta.fields)
    expect(projection.meta.superposition).toEqual(richMeta.superposition)
    expect(projection.meta.processes).toEqual(richMeta.processes)
    expect(projection.meta.reactions).toEqual(richMeta.reactions)
    expect(projection.meta.mass).toEqual(richMeta.mass)
    expect(projection.particles.map((particle) => particle.kind)).toEqual(["wimp", "fuzzy", "axion"])
  })

  test("не выводит пустые processes/reactions из отсутствия записей в БД", async () => {
    await store.wimp.create("owner/empty", explicitEmptyMeta, projectTemplateMatterRelations(explicitEmptyMeta))

    const projection = (await store.wimp.readDarkParticleModel("owner/empty"))!

    // Принцип минимума: если в БД нет ни одной записи в process/reaction/matter_particle,
    // соответствующая секция не появляется в projection. Пустой объект — это производное,
    // не хранимое состояние.
    expect(projection.meta.processes).toBeUndefined()
    expect(projection.meta.reactions).toBeUndefined()
    expect(projection.particles).toEqual([])
  })
})
