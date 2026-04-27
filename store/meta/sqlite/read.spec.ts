import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { SQL } from "bun"
import type { MetaDSL } from "../../.."
import gitMeta from "../../../github/zavx0z/git/meta.ts"
import { metaCreate, metaSchemaSql, readDarkParticleModel } from "./index.ts"

const getMetaDB = async (path: string): Promise<SQL> => {
  const url = path === ":memory:" ? "sqlite::memory:" : `sqlite://${path}`
  const sql = new SQL(url)
  await sql.unsafe("PRAGMA foreign_keys = ON;")
  await sql.unsafe(metaSchemaSql)
  return sql
}
const relation = (sql: SQL, meta: MetaDSL, src: string) => metaCreate(sql, src, meta)

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
  let db: SQL

  beforeEach(async () => {
    db = await getMetaDB(":memory:")
  })

  afterEach(async () => {
    await db.close()
  })

  const countRows = async (table: string): Promise<number> => {
    const rows = (await db.unsafe(`SELECT COUNT(*) AS count FROM ${table}`)) as Array<{ count: number }>
    return rows[0]?.count ?? 0
  }

  test("читает particle-centric runtime model для существующей git meta после relation()", async () => {
    await relation(db, gitMeta, "zavx0z/git")

    const projection = (await readDarkParticleModel(db, "zavx0z/git"))!

    expect(projection.meta.fieldSchemas).toEqual(gitMeta.fields)
    expect(projection.meta.superposition).toEqual(gitMeta.superposition)
    expect(projection.meta.processes).toEqual(gitMeta.processes)
    expect(projection.meta.mass).toBeUndefined()
    expect(projection.particles.map((particle) => particle.kind)).toEqual(["fuzzy", "axion"])
  })

  test("сохраняет particle-centric matter write-side и даёт тонкий ORM loader поверх реляционных rows", async () => {
    await relation(db, richMeta, "owner/rich")

    const projection = (await readDarkParticleModel(db, "owner/rich"))!

    expect(projection.meta.fieldSchemas).toEqual(richMeta.fields)
    expect(projection.meta.superposition).toEqual(richMeta.superposition)
    expect(projection.meta.processes).toEqual(richMeta.processes)
    expect(projection.meta.reactions).toEqual(richMeta.reactions)
    expect(projection.meta.mass).toEqual(richMeta.mass)
    expect(projection.particles.map((particle) => particle.kind)).toEqual(["wimp", "fuzzy", "axion"])

    expect(await countRows("process_action")).toBe(1)
    expect(await countRows("process_action_read")).toBe(3)
    expect(await countRows("process_action_write")).toBe(2)
    expect(await countRows("process_finally")).toBe(1)
    expect(await countRows("process_finally_read")).toBe(1)
    expect(await countRows("matter_particle")).toBe(10)
    expect(await countRows("matter_particle_wimp")).toBe(6)
    expect(await countRows("matter_particle_fuzzy")).toBe(2)
    expect(await countRows("matter_particle_axion")).toBe(1)
    expect(await countRows("matter_particle_macho")).toBe(1)
  })

  test("не выводит пустые processes/reactions из отсутствия записей в БД", async () => {
    await relation(db, explicitEmptyMeta, "owner/empty")

    const projection = (await readDarkParticleModel(db, "owner/empty"))!

    // Принцип минимума: если в БД нет ни одной записи в process/reaction/matter_particle,
    // соответствующая секция не появляется в projection. Пустой объект — это производное,
    // не хранимое состояние.
    expect(projection.meta.processes).toBeUndefined()
    expect(projection.meta.reactions).toBeUndefined()
    expect(projection.particles).toEqual([])
  })
})
