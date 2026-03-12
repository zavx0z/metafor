import { describe, expect, test } from "bun:test"
import type { ActorAST } from "@metafor/ast"
import { createDarkAddress, createDarkStore, formatDarkPath, parseDarkAddress } from "./store"

const ast: ActorAST = {
  name: "git",
  fields: {
    src: {
      type: "string",
      required: true,
    },
  },
  superposition: {
    idle: {
      run: {},
    },
  },
  processes: {
    run: {
      type: "action",
    },
  },
  bulk: {
    gravity: [
      {
        type: "log",
        data: "/state",
        child: [],
      },
    ],
  },
  mass: {
    history: [],
  },
}

describe("dark/store", () => {
  test("builds linked flat graph with path and address lookup", () => {
    const store = createDarkStore({
      schemaPath: "/schemas/git",
      ast,
    })

    expect(store.getNode([])?.kind).toBe("root")
    expect(store.getNode(["fields", "src"])?.section).toBe("fields")
    expect(store.getNode(createDarkAddress("/schemas/git", ["fields", "src", "type"]))?.value).toBe("string")
    expect(store.getChildren(["fields"]).map((node) => node.key)).toEqual(["src"])
    expect(store.lookup(["bulk"]).map((node) => node.key)).toContain("gravity")
  })

  test("formats and parses addressable paths", () => {
    const address = createDarkAddress("/schemas/git", ["superposition", "idle", "run"])

    expect(formatDarkPath(["superposition", "idle", "run"])).toBe("/superposition/idle/run")
    expect(parseDarkAddress(address)).toEqual({
      schemaPath: "/schemas/git",
      path: ["superposition", "idle", "run"],
    })
  })
})
