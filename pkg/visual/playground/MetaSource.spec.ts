import {describe, expect, test} from "bun:test"
import {metaStateDslSource, stateDslExcerpt} from "./MetaSource.ts"

describe("Visual playground MetaFor DSL source", () => {
  test("reads the exact State declaration from the canonical peer Meta package", () => {
    expect(metaStateDslSource("zavx0z/lada")).toMatchObject({
      path: "cluster/zavx0z/lada/meta.ts",
      src: "zavx0z/lada",
    })
    expect(metaStateDslSource("zavx0z/lada")?.dsl).toStartWith(".superposition({")
    expect(metaStateDslSource("zavx0z/lada")?.dsl).toContain('"ожидание мира"')
    expect(metaStateDslSource("zavx0z/lada")?.dsl).not.toContain(".mass(")
  })

  test("keeps every captured declaration byte-equal to its canonical meta.ts excerpt", async () => {
    for (const src of [
      "zavx0z/lada",
      "zavx0z/lada-auth",
      "zavx0z/lada-chat",
      "zavx0z/lada-model",
      "zavx0z/lada-chat-send",
    ]) {
      const captured = metaStateDslSource(src)
      if (!captured) throw new Error(`Missing captured DSL for ${src}`)
      const actual = await Bun.file(captured.path).text()
      expect(captured.dsl).toBe(stateDslExcerpt(actual))
    }
  })
})
