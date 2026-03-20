import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { HubFixture } from "fixture"

import type { SRC } from "@metafor/dsl"
import type { MetaAST } from "@metafor/ast"

import { Axion, Fuzzy, Wimp } from "@dark/part"
import { matterPipeline } from "../dark"
import { loadMetaAST } from "../load"
import { dark$ } from "../store"

const hub = new HubFixture("./github/")

const src = "zavx0z/git"

describe("matter pipeline", () => {
  let ast: MetaAST
  let wimp: Wimp
  beforeAll(async () => {
    await hub.setup()
    ast = (await loadMetaAST("zavx0z/git" as SRC)) as MetaAST
    wimp = new Wimp(src)
  })
  afterAll(async () => {
    dark$.meta.clear()
    dark$.particles.clear()
    dark$.parent = new WeakMap()
    await hub.teardown()
  })

  test("сохраняет стабильное состояние графа для одного meta", () => {
    const wimps = matterPipeline(wimp, ast)
    const operation = ast.fields.operation
    if (!operation) throw new Error("operation field is undefined")
    const operationValues = operation.values
    if (!operationValues) throw new Error("operation values are undefined")
    const dynamicMeta = ast.matter?.[0]
    const logicalMeta = ast.matter?.[1]
    const childMeta = logicalMeta?.type === "log" ? logicalMeta.child?.[0] : undefined
    if (!dynamicMeta || dynamicMeta.type !== "meta") throw new Error("dynamic meta node is undefined")
    if (!logicalMeta || logicalMeta.type !== "log") throw new Error("logical meta node is undefined")
    if (!childMeta || childMeta.type !== "meta") throw new Error("child meta node is undefined")

    const particles = Array.from(dark$.particles.values())
    const fuzzy = particles.find((particle): particle is Fuzzy => particle instanceof Fuzzy)
    const axion = particles.find((particle): particle is Axion => particle instanceof Axion)
    const branchWimps = particles.filter((particle): particle is Wimp => particle instanceof Wimp && particle !== wimp)
    const fuzzyBranchWimps = branchWimps.filter((particle) => dark$.parent.get(particle) === fuzzy)
    const childWimp = branchWimps.find((particle) => dark$.parent.get(particle) === axion)

    expect(wimp.values, "root Wimp должен инициализировать runtime values из MetaAST.fields").toEqual({
      operation: null,
      error: null,
      command: null,
      args: null,
    })
    expect(fuzzy, "matterPipeline должен сохранить Fuzzy в store").toBeDefined()
    expect(fuzzy?.value, "Fuzzy без выбранного enum значения должен быть пустым").toBeNull()
    expect(axion, "matterPipeline должен сохранить Axion в store").toBeDefined()
    expect((axion as any)?.basis, "matterPipeline не должен materialize basis в runtime Axion").toBeUndefined()
    expect((axion as any)?.expr, "matterPipeline не должен materialize expr в runtime Axion").toBeUndefined()
    expect(fuzzyBranchWimps, "matterPipeline должен сохранить все Wimp-ветви Fuzzy").toHaveLength(
      operationValues.length,
    )
    expect(childWimp, "matterPipeline должен сохранить дочерний Wimp в store").toBeDefined()
    expect(wimps, "matterPipeline должен вернуть все materialized Wimp").toHaveLength(operationValues.length + 1)
    expect(
      fuzzyBranchWimps.map((particle) => particle.values),
      "matterPipeline должен materialize runtime values всех Wimp-ветвей Fuzzy через strong",
    ).toEqual(operationValues.map(() => ({ operation: null, args: null })))
    expect(childWimp?.values, "matterPipeline должен materialize runtime values child Wimp через strong").toEqual({
      message: null,
    })

    expect(dark$.particles.size, "store должен содержать root, Fuzzy, Axion и все Wimp-ветви").toBe(14)
    expect(wimp.children, "root wimp должен ссылаться на Fuzzy и Axion").toEqual(new Set([fuzzy!.id, axion!.id]))
    expect(fuzzy!.children, "Fuzzy должен ссылаться на все Wimp-ветви").toEqual(
      new Set(fuzzyBranchWimps.map((particle) => particle.id)),
    )
    expect(axion!.children, "Axion должен ссылаться на дочерний Wimp").toEqual(new Set([childWimp!.id]))

    expect(dark$.meta, "meta lookup должен содержать root и все Wimp-ветви").toEqual(
      new Map([[wimp.id, src], ...branchWimps.map((particle) => [particle.id, particle.src] as const)]),
    )

    expect(dark$.parent.get(fuzzy!), "parent Fuzzy должен быть root wimp").toBe(wimp)
    expect(dark$.parent.get(axion!), "parent Axion должен быть root wimp").toBe(wimp)
    for (const particle of fuzzyBranchWimps) {
      expect(dark$.parent.get(particle), "parent каждой Wimp-ветви должен быть Fuzzy").toBe(fuzzy)
    }
    expect(dark$.parent.get(childWimp!), "parent дочернего Wimp должен быть Axion").toBe(axion)
  })
})
