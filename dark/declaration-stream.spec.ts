import {describe, expect, test} from "bun:test"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {Particle} from "@metafor/types/force/particle"
import {matterParticles} from "./dark.ts"

const declaration = (input: Partial<MetaDSL> & Pick<MetaDSL, "name">): MetaDSL => ({
  name: input.name,
  fields: input.fields ?? [],
  superposition: input.superposition ?? [],
  ...(input.processes === undefined ? {} : {processes: input.processes}),
  ...(input.reactions === undefined ? {} : {reactions: input.reactions}),
  ...(input.matter === undefined ? {} : {matter: input.matter}),
  ...(input.mass === undefined ? {} : {mass: input.mass}),
  ...(input.bulk === undefined ? {} : {bulk: input.bulk}),
})

const collect = async (source: AsyncGenerator<Particle>): Promise<Particle[]> => {
  const result: Particle[] = []
  for await (const particle of source) result.push(particle)
  return result
}

const identity = (particle: Particle): Record<string, unknown> => {
  expect(particle.value).toBeObject()
  return particle.value as Record<string, unknown>
}

describe("Dark declaration stream", () => {
  test("uses categorical paths, WIMP SRC and deterministic local indices", async () => {
    const root = "test/capsule"
    const child = "test/capsule-child"
    const declarations = new Map<string, MetaDSL>([
      [root, declaration({
        name: "Capsule",
        fields: [
          {key: "mode", type: "enum", values: ["idle", "ready"]},
          {key: "title", type: "string"},
        ],
        superposition: [
          {name: "idle", transitions: {ready: {mode: {eq: "ready"}}}},
          {name: "ready"},
        ],
        matter: [{kind: "wimp", src: child}],
      })],
      [child, declaration({name: "Child", fields: [{key: "label", type: "string"}]})],
    ])
    const readOrder: string[] = []
    const particles = await collect(matterParticles(root, async (src) => {
      readOrder.push(src)
      const value = declarations.get(src)
      if (!value) throw new Error(`Missing declaration ${src}`)
      return structuredClone(value)
    }))

    expect(readOrder).toEqual([root, child])
    expect(particles.some((particle) => particle.op === "test" || particle.path === "meta")).toBe(false)
    expect(particles.every((particle) => typeof particle.path === "string" && !particle.path.includes("/"))).toBe(true)

    const rootWimp = particles.find((particle) => particle.path === "wimp" && identity(particle).src === root)
    expect(rootWimp?.value).toEqual({src: root, name: "Capsule", desc: null})

    const rootFields = particles
      .filter((particle) => particle.path === "field" && identity(particle).wimp === root)
      .map((particle) => identity(particle).id)
    expect(rootFields).toEqual([1, 2])

    const rootStates = particles
      .filter((particle) => particle.path === "state" && identity(particle).wimp === root)
      .map((particle) => identity(particle).id)
    expect(rootStates).toEqual([1, 2])

    const transition = particles.find((particle) => particle.path === "transition" && identity(particle).wimp === root)
    expect(transition?.value).toMatchObject({wimp: root, id: 1, from: 1, to: 2})

    const condition = particles.find((particle) => particle.path === "condition" && identity(particle).wimp === root)
    expect(condition?.value).toMatchObject({wimp: root, id: 1, transition: 1, field: 1})

    const edgeIndex = particles.findIndex((particle) =>
      particle.path === "matter" && identity(particle).wimp === root && identity(particle).id === 1
    )
    const childIndex = particles.findIndex((particle) =>
      particle.path === "wimp" && identity(particle).src === child
    )
    expect(edgeIndex).toBeGreaterThan(-1)
    expect(childIndex).toBeGreaterThan(edgeIndex)
  })

  test("yields a WIMP Matter reference before loading its target", async () => {
    const root = "test/stream-root"
    const child = "test/stream-child"
    let childRequested = false
    let releaseChild!: () => void
    const childGate = new Promise<void>((resolve) => {
      releaseChild = resolve
    })
    const stream = matterParticles(root, async (src) => {
      if (src === root) return declaration({name: "Root", matter: [{kind: "wimp", src: child}]})
      childRequested = true
      await childGate
      return declaration({name: "Child"})
    })

    const first = await stream.next()
    expect(first.value).toMatchObject({path: "wimp", value: {src: root}})

    const second = await stream.next()
    expect(second.value).toMatchObject({path: "matter", value: {wimp: root, id: 1, src: child}})
    expect(childRequested).toBe(false)

    const pendingChild = stream.next()
    await Bun.sleep(5)
    expect(childRequested).toBe(true)
    releaseChild()
    expect((await pendingChild).value).toMatchObject({path: "wimp", value: {src: child}})
  })
})
