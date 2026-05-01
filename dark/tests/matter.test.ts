import {afterAll, beforeAll, describe, expect, test} from "bun:test"
import {SQL} from "bun"
import type {DarkParticle} from "@dark/types"
import {open} from "../../store/server.ts"
import {matter} from "../index.ts"
import {Axion, Fuzzy, Macho, Wimp} from "@dark/strong"

let store: Awaited<ReturnType<typeof open>>
let sql: SQL
let root: Wimp
let allParticles: DarkParticle[]
let wimps: Wimp[]

const collectParticles = (particle: DarkParticle, sink: DarkParticle[] = []): DarkParticle[] => {
  sink.push(particle)
  for (const child of particle.children) collectParticles(child, sink)
  return sink
}

describe("matter() — runtime tree", () => {
  beforeAll(async () => {
    store = await open(":memory:")
    sql = new SQL("sqlite::memory:")
    root = new Wimp({src: "zavx0z/git", parent: null})
    await matter(root, undefined, {store})
    allParticles = collectParticles(root)
    wimps = allParticles.filter((p): p is Wimp => p instanceof Wimp)
  })
  afterAll(async () => {
    await sql.close()
    await store.close()
  })

  describe("частицы", () => {
    test("частицы созданы", () => expect(allParticles.length).toBeGreaterThan(0))

    test("Wimp присутствуют", () => {
      expect(wimps.length).toBeGreaterThan(0)
    })

    test("Fuzzy присутствуют", () => {
      const fuzzy = allParticles.filter((p): p is Fuzzy => p instanceof Fuzzy)
      expect(fuzzy.length).toBeGreaterThan(0)
    })

    test("Axion присутствуют", () => {
      const axion = allParticles.filter((p): p is Axion => p instanceof Axion)
      expect(axion.length).toBeGreaterThan(0)
    })

    test("Macho отсутствуют", () => {
      const macho = allParticles.filter((p): p is Macho => p instanceof Macho)
      expect(macho.length).toBe(0)
    })

    test("кроме Wimp/Fuzzy/Axion/Macho других particle нет", () => {
      const w = allParticles.filter((p) => p instanceof Wimp).length
      const f = allParticles.filter((p) => p instanceof Fuzzy).length
      const a = allParticles.filter((p) => p instanceof Axion).length
      const m = allParticles.filter((p) => p instanceof Macho).length
      expect(w + f + a + m).toBe(allParticles.length)
    })
  })

  describe("декларация в store", () => {
    test("каждая уникальная wimp.src имеет ровно одну запись в store.meta", async () => {
      const uniqueSrcs = new Set(wimps.map((wimp) => wimp.src))
      for (const src of uniqueSrcs) {
        const meta = await store.meta.get(src)
        expect(meta, `meta для "${src}" должна существовать в store`).not.toBeNull()
      }
    })

    test("каждый wimp ссылается на свой Meta-объект (не shared identity, см. policy без кеша)", () => {
      for (const wimp of wimps) {
        expect(wimp.meta, `Wimp ${wimp.id} должен ссылаться на свой Meta`).toBeDefined()
        expect(wimp.meta!.src).toBe(wimp.src)
      }
    })
  })

  describe("родители (object-graph)", () => {
    test("корневой Wimp не имеет parent", () => {
      const rootByName = wimps.find((wimp) => wimp.src === "zavx0z/git")
      expect(rootByName, "корневой Wimp должен присутствовать в списке Wimp").toBeDefined()
      expect(rootByName!.parent).toBeNull()
    })

    test("каждая не-корневая частица имеет parent в той же object-graph", () => {
      for (const particle of allParticles) {
        if (particle === root) continue
        const parent = particle.parent
        if (!parent) throw new Error(`частица ${particle.id} должна иметь parent`)
        expect(
          parent.children.has(particle),
          `родительская частица ${parent.id} должна ссылаться на ${particle.id}`,
        ).toBe(true)
      }
    })
  })
})
