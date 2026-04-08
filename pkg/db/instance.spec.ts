import { describe, expect, test } from "bun:test"
import { openDbInstanceSqlite, readDbWorldSnapshot, writeDbWorldSnapshot } from "./instance.ts"
import type { DbWorldSnapshot } from "./instance.t.ts"

describe("pkg/db instance sqlite", () => {
  test("пишет и читает nested particle shells и field orbits без JSON payload", () => {
    const db = openDbInstanceSqlite()

    const snapshot: DbWorldSnapshot = {
      rootSrc: "zavx0z/git",
      particles: [
        {
          particleId: "root:wimp",
          parentParticleId: null,
          kind: "wimp",
          src: "zavx0z/git",
          metaSrc: "zavx0z/git",
          label: "zavx0z/git",
          depth: 0,
          shellOrder: 0,
          localX: 0,
          localY: 0,
          localZ: 1,
          shellScale: 1,
          shellRadius: 0.2,
          shellTube: 0.14,
          colorR: 0.4,
          colorG: 0.45,
          colorB: 0.98,
        },
        {
          particleId: "child:fuzzy",
          parentParticleId: "root:wimp",
          kind: "fuzzy",
          src: null,
          metaSrc: null,
          label: "fuzzy",
          depth: 1,
          shellOrder: 0,
          localX: 0.14,
          localY: 0,
          localZ: 0.06,
          shellScale: 0.42,
          shellRadius: 0.2,
          shellTube: 0.14,
          colorR: 1,
          colorG: 0.72,
          colorB: 0.22,
        },
      ],
      fields: [
        {
          id: "field:command",
          particleId: "root:wimp",
          fieldKey: "command",
          fieldLabel: "Команда",
          fieldOrder: 0,
          valueText: "git status",
          localX: 0.08,
          localY: 0,
          localZ: 0.03,
          sphereRadius: 0.03,
          colorR: 0.98,
          colorG: 0.47,
          colorB: 0.47,
        },
      ],
    }

    writeDbWorldSnapshot(db, snapshot)

    const restored = readDbWorldSnapshot(db, "zavx0z/git")
    expect(restored).toEqual(snapshot)
  })
})
