import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { matter } from "../dark"
import { HubFixture } from "fixture"
import { dark$ } from "../store"
import { Axion, Fuzzy, Macho, Wimp } from "@dark/strong"
const hub = new HubFixture("./github/")
let wimps: Wimp[]

describe("dark$", () => {
  beforeAll(async () => {
    await hub.setup()
    await matter(new Wimp({ src: "zavx0z/git", parent: null }))
  })
  afterAll(async () => {
    dark$.meta.clear()
    dark$.particles.clear()
    await hub.teardown()
  })

  describe("particles", () => {
    test("частицы созданы", () => expect(dark$.particles.size).toBeGreaterThan(0))
    test("wimp присутствуют", () => {
      wimps = [...dark$.particles.values()].filter((particle) => particle instanceof Wimp)
      expect(wimps.length).toBeGreaterThan(0)
    })
    let fuzzy: Fuzzy[]
    test("fuzzy присутствуют", () => {
      fuzzy = [...dark$.particles.values()].filter((particle) => particle instanceof Fuzzy)
      expect(fuzzy.length).toBeGreaterThan(0)
    })
    let axion: Axion[]
    test("axion присутствуют", () => {
      axion = [...dark$.particles.values()].filter((particle) => particle instanceof Axion)
      expect(axion.length).toBeGreaterThan(0)
    })
    let macho: Macho[]
    test("macho отсутствуют", () => {
      macho = [...dark$.particles.values()].filter((particle) => particle instanceof Macho)
      expect(macho.length).toBe(0)
    })
    test("кроме частиц ничего нет", () => {
      const lenghAllParticles = wimps.length + fuzzy.length + axion.length + macho.length
      expect(lenghAllParticles).toBe(dark$.particles.size)
    })
  })

  describe("meta", () => {
    test("meta хранит все Wimp по src", () => {
      expect(dark$.meta.size).toBe(wimps.length)
      expect(dark$.meta).toEqual(new Map(wimps.map((wimp) => [wimp.id, wimp.src] as const)))
    })
  })

  describe("parent", () => {
    test("parent хранит связи для всех не-root частиц", () => {
      const particles = [...dark$.particles.values()]
      const root = wimps.find((wimp) => wimp.src === "zavx0z/git")

      expect(root, "root Wimp должен присутствовать в списке Wimp").toBeDefined()
      expect(root!.parent, "root Wimp не должен иметь parent").toBeNull()

      for (const particle of particles) {
        if (particle === root) continue

        const parent = particle.parent
        if (!parent) throw new Error(`particle ${particle.id} должен иметь parent`)
        expect(
          dark$.particles.has(parent.id),
          `parent particle ${parent.id} должен быть сохранён в dark$.particles`,
        ).toBe(true)
        expect(
          parent.children.has(particle),
          `parent particle ${parent.id} должен ссылаться на ${particle.id}`,
        ).toBe(true)
      }
    })
  })
})
