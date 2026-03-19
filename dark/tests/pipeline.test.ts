import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { HubFixture } from "fixture"

import type { SRC } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"

import { Axion, Fuzzy, Wimp } from "@dark/part"
import { matterPipeline } from "../dark"
import { loadMetaAST } from "../load"
import { dark$ } from "../store"

const hub = new HubFixture("./github/")
beforeAll(async () => await hub.setup())
afterAll(async () => {
  dark$.meta.clear()
  dark$.particles.clear()
  dark$.parent = new WeakMap()
  await hub.teardown()
})

const src = "zavx0z/git"

describe("matter pipeline", () => {
  let ast: MetaAST
  let wimp: Wimp

  beforeAll(async () => {
    ast = (await loadMetaAST("zavx0z/git" as SRC)) as MetaAST
    wimp = new Wimp(src)
  })

  afterAll(() => {
    dark$.meta.clear()
    dark$.particles.clear()
    dark$.parent = new WeakMap()
  })

  test("сохраняет стабильное состояние графа для одного meta", () => {
    dark$.meta.clear()
    dark$.particles.clear()
    dark$.parent = new WeakMap()

    const wimps = matterPipeline(wimp, ast)

    const particles = Array.from(dark$.particles.values())
    const fuzzy = particles.find((particle): particle is Fuzzy => particle instanceof Fuzzy)
    const axion = particles.find((particle): particle is Axion => particle instanceof Axion)
    const branchWimps = particles.filter((particle): particle is Wimp => particle instanceof Wimp && particle !== wimp)
    const fuzzyWimp = branchWimps.find((particle) => dark$.parent.get(particle) === fuzzy)
    const childWimp = branchWimps.find((particle) => dark$.parent.get(particle) === axion)

    expect(fuzzy, "matterPipeline должен сохранить Fuzzy в store").toBeDefined()
    expect(axion, "matterPipeline должен сохранить Axion в store").toBeDefined()
    expect(fuzzyWimp, "matterPipeline должен сохранить continuation Wimp для Fuzzy").toBeUndefined()
    expect(childWimp, "matterPipeline должен сохранить дочерний Wimp в store").toBeUndefined()

    expect(dark$.particles.size, "store должен содержать root и четыре materialized particle").toBe(5)
    expect(wimp.children, "root wimp должен ссылаться на Fuzzy и Axion").toEqual(new Set([fuzzy!.id, axion!.id]))
    expect(fuzzy!.children, "Fuzzy должен ссылаться на continuation Wimp").toEqual(new Set([fuzzyWimp!.id]))
    expect(axion!.children, "Axion должен ссылаться на дочерний Wimp").toEqual(new Set([childWimp!.id]))

    expect(dark$.meta, "meta lookup должен содержать root и оба Wimp второго уровня").toEqual(
      new Map([
        [wimp.id, src],
        [fuzzyWimp!.id, "zavx0z/git-${operation}"],
        [childWimp!.id, "zavx0z/git-error"],
      ]),
    )

    expect(dark$.parent.get(fuzzy!), "parent Fuzzy должен быть root wimp").toBe(wimp)
    expect(dark$.parent.get(axion!), "parent Axion должен быть root wimp").toBe(wimp)
    expect(dark$.parent.get(fuzzyWimp!), "parent continuation Wimp должен быть Fuzzy").toBe(fuzzy)
    expect(dark$.parent.get(childWimp!), "parent дочернего Wimp должен быть Axion").toBe(axion)
  })
})
