import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import type { Address } from "./dark.t"
import { HubFixture } from "../fixture/hub"
import * as dark from "./dark"
import { dark$ } from "./store"

const hub = new HubFixture("./github/")

beforeAll(async () => {
  await hub.setup()
})

afterAll(async () => {
  await hub.teardown()
  dark$.reset()
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
      topology: {
        fragments: expect.any(Map),
        objects: expect.any(Map),
        placements: expect.any(Map),
        links: expect.any(Map),
        references: expect.any(Map),
        entanglements: expect.any(Map),
        placementAddressIndex: expect.any(Map),
        entanglementAddressIndex: expect.any(Map),
        objectPlacementsIndex: expect.any(Map),
        sourceMetaIndex: expect.any(Map),
        metaSourceLookup: expect.any(Map),
        nextPlacementSeq: expect.any(Number),
        nextLinkSeq: expect.any(Number),
        nextReferenceSeq: expect.any(Number),
        rootOccurrenceSeq: expect.any(Number),
      },
    })

    // Проверяем что meta загружены
    expect(dark$.meta.has("zavx0z/git-error")).toBe(true)

    // Проверяем что topology построена
    const gitErrorPlacements = dark$.topology.getPlacementsByMeta("zavx0z/git-error")
    expect(gitErrorPlacements.length).toBeGreaterThan(0)
  })
})
