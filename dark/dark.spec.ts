import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import type { Address } from "./dark.t"
import { HubFixture } from "../fixture/hub"
import * as dark from "./dark"
import { getPlacementsByMeta } from "./gravity/query.ts"
import { dark$ } from "./store"
import { gravity$ } from "./gravity/store.ts"
import { strong$ } from "./strong/store.ts"

const hub = new HubFixture("./github/")

beforeAll(async () => {
  await hub.setup()
})

beforeEach(() => {
  dark$.reset()
  gravity$.reset()
  strong$.reset()
})

afterAll(async () => {
  await hub.teardown()
  dark$.reset()
  gravity$.reset()
  strong$.reset()
})

describe("dark.matter", () => {
  test("загружает meta и строит topology", async () => {
    await dark.matter("zavx0z/git-error" as Address)

    const snapshot = dark$.snapshot()

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
            gravity: [
              {
                type: "log",
                data: "/value/error",
                child: [
                  {
                    tag: "div",
                    type: "el",
                    child: [
                      {
                        type: "text",
                        data: "/value/error",
                      },
                    ],
                    string: {
                      class: "error",
                    },
                  },
                ],
              },
            ],
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
    expect((snapshot as any).fragments).toBeUndefined()
    expect((snapshot as any).placementAddressIndex).toBeUndefined()

    // Проверяем что meta загружены
    expect(dark$.meta.has("zavx0z/git-error")).toBe(true)
    expect(gravity$.fragments.has("zavx0z/git-error")).toBe(true)
    expect(strong$.sourceMetaIndex.has("zavx0z/git-error")).toBe(true)

    // Проверяем что topology построена
    const gitErrorPlacements = getPlacementsByMeta(dark$, "zavx0z/git-error")
    expect(gitErrorPlacements.length).toBeGreaterThan(0)
  })
})
