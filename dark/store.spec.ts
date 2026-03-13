import { describe, expect, test } from "bun:test"
import type { MetaAST } from "@metafor/ast"
import { dark$, createDarkAddress, formatDarkPath, parseDarkAddress } from "./store"

const ast: MetaAST = {
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
  gravity: [
    {
      type: "log",
      data: "/state",
      child: [],
    },
  ],
  mass: {
    history: [],
  },
}

describe("dark/store", () => {
  test("builds linked flat graph with path and address lookup", () => {
    dark$.restore({
      schemaPath: "/schemas/git",
      ast,
    })

    expect(dark$.getNode([])?.kind).toBe("root")
    expect(dark$.getNode(["fields", "src"])?.section).toBe("fields")
    expect(dark$.getNode(createDarkAddress("/schemas/git", ["fields", "src", "type"]))?.value).toBe("string")
    expect(dark$.getChildren(["fields"]).map((node) => node.key)).toEqual(["src"])
    expect(dark$.lookup(["gravity"]).map((node) => node.key)).toContain("0")
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
