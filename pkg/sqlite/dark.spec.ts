import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import type { Database } from "bun:sqlite"
import type { MetaDSL } from "../.."
import gitMeta from "../../github/zavx0z/git/meta.ts"
import { relation, getMetaDB } from "./index.ts"
import { readDarkBundle } from "./dark.ts"

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

describe("sqlite dark bundle", () => {
  let db: Database

  beforeEach(() => {
    db = getMetaDB(":memory:")
  })

  afterEach(() => {
    db.close()
  })

  test("читает канонический bundle для существующей git meta после relation()", () => {
    relation(db, gitMeta, "zavx0z/git")

    const bundle = readDarkBundle(db, "zavx0z/git")

    expect(bundle).toEqual(gitMeta)
  })

  test("сохраняет полный matter/process write-side и читает его обратно как canonical bundle", () => {
    relation(db, richMeta, "owner/rich")

    const bundle = readDarkBundle(db, "owner/rich")

    expect(bundle.fields).toEqual(richMeta.fields)
    expect(bundle.superposition).toEqual(richMeta.superposition)
    expect(bundle.processes).toEqual(richMeta.processes)
    expect(bundle.reactions).toEqual(richMeta.reactions)
    expect(bundle.matter).toEqual(richMeta.matter)
    expect(bundle.mass).toEqual(richMeta.mass)
    expect(bundle.desc).toBe(richMeta.desc)

    const processActionCount = db.query(`SELECT COUNT(*) AS count FROM process_action`).get() as { count: number }
    const processActionReadCount = db.query(`SELECT COUNT(*) AS count FROM process_action_read`).get() as { count: number }
    const processActionWriteCount = db.query(`SELECT COUNT(*) AS count FROM process_action_write`).get() as { count: number }
    const processFinallyCount = db.query(`SELECT COUNT(*) AS count FROM process_finally`).get() as { count: number }
    const processFinallyReadCount = db.query(`SELECT COUNT(*) AS count FROM process_finally_read`).get() as { count: number }
    const matterConditionCount = db.query(`SELECT COUNT(*) AS count FROM matter_condition`).get() as { count: number }
    const matterLogicalCount = db.query(`SELECT COUNT(*) AS count FROM matter_logical`).get() as { count: number }
    const matterMapCount = db.query(`SELECT COUNT(*) AS count FROM matter_map`).get() as { count: number }
    const matterAttrCount = db.query(`SELECT COUNT(*) AS count FROM matter_attr`).get() as { count: number }
    const matterAttrPartCount = db.query(`SELECT COUNT(*) AS count FROM matter_attr_part`).get() as { count: number }
    const matterStylePropCount = db.query(`SELECT COUNT(*) AS count FROM matter_style_prop`).get() as { count: number }
    const matterEventUpdateCount = db.query(`SELECT COUNT(*) AS count FROM matter_event_update`).get() as { count: number }

    expect(processActionCount.count).toBe(1)
    expect(processActionReadCount.count).toBe(3)
    expect(processActionWriteCount.count).toBe(2)
    expect(processFinallyCount.count).toBe(1)
    expect(processFinallyReadCount.count).toBe(1)
    expect(matterConditionCount.count).toBe(1)
    expect(matterLogicalCount.count).toBe(1)
    expect(matterMapCount.count).toBe(1)
    expect(matterAttrCount.count).toBe(6)
    expect(matterAttrPartCount.count).toBe(3)
    expect(matterStylePropCount.count).toBe(2)
    expect(matterEventUpdateCount.count).toBe(1)
  })

  test("не теряет явно объявленные пустые processes/reactions/matter", () => {
    relation(db, explicitEmptyMeta, "owner/empty")

    const bundle = readDarkBundle(db, "owner/empty")

    expect(bundle.processes).toEqual({})
    expect(bundle.reactions).toEqual({
      reactions: {},
      superposition: {},
    })
    expect(bundle.matter).toEqual([])
  })
})
