import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import type { Address } from "@dark/types/dark"
import { HubFixture } from "../fixture/hub"
import * as dark from "./dark"
import { resetDark } from "./tests/fixtures"
import { dark$ } from "./store"

const hub = new HubFixture("./github/")

beforeAll(async () => {
  await hub.setup()
})

beforeEach(() => {
  resetDark()
})

afterAll(async () => {
  await hub.teardown()
  resetDark()
})

describe("dark.matter", () => {
  test("загружает meta и строит topology", async () => {
    await dark.matter("zavx0z/git-error" as Address)

    const snapshot = structuredClone({
      meta: dark$.meta,
      objects: dark$.objects,
      placements: dark$.placements,
      links: dark$.links,
      references: dark$.references,
      entanglements: dark$.entanglements,
    })
    expect(snapshot).toMatchObject({
      meta: new Map([
        [
          "zavx0z/git-error",
          {
            name: "git-error",
            fields: {
              error: {
                type: "string",
                label: "Ошибка",
              },
            },
            superposition: {},
            processes: {},
            mass: {},
          },
        ],
      ]),
      objects: expect.any(Map),
      placements: expect.any(Map),
      links: expect.any(Map),
      references: expect.any(Map),
      entanglements: expect.any(Map),
    })

    // Проверяем что meta загружена
    expect(dark$.meta.has("zavx0z/git-error")).toBe(true)
  })
})
