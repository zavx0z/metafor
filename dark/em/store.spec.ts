/**
 * Тесты `@dark/em` — projection-only.
 *
 * Проверяют что em:
 * - только проецирует данные
 * - не хранит состояние
 * - не имеет ownership над storage
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { MetaFor, compileLocalTopologyFragment } from "../../metafor/dsl/metafor.ts"
import { projectDarkGraph, projectDarkGraphToBoundary, projectDarkGraphToBulk } from "./index.ts"
import { ingestFragment } from "../gravity/gravity.ts"
import { gravity$ } from "../gravity/store.ts"
import { dark$ } from "../store.ts"
import { strong$ } from "../strong/store.ts"
import { resetAll, snapshotDark } from "../tests/fixtures"

describe("@dark/em — projection-only", () => {
  beforeEach(() => {
    resetAll()
  })

  describe("projection", () => {
    test("проецирует placements, references, entanglements", async () => {
      const meta = MetaFor("em-projection")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      ingestFragment(dark$, gravity$, strong$, "em-projection/root", fragment, {})

      const projection = projectDarkGraph(dark$, "boundary")

      expect(projection.consumer).toBe("boundary")
      expect(projection.placements.length).toBeGreaterThan(0)
      // projection.meta берётся из dark$.meta, а не из topology fragments
      expect(projection.placements.some(p => p.meta === "em-projection/root")).toBe(true)
    })

    test("сохраняет axion placements в downstream projection без entanglement", async () => {
      const meta = MetaFor("em-axion")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`${state === "idle" && html`<meta-for src="em/child"></meta-for>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const axion = Object.values(fragment.objects).find((object) => object.kind === "axion")

      expect(axion).toBeDefined()
      if (!axion) {
        throw new Error("axion object не собран")
      }

      ingestFragment(dark$, gravity$, strong$, "em-axion/root", fragment, {})

      const projection = projectDarkGraphToBoundary(dark$)
      const globalAxionObjectId = `em-axion/root#${axion.id}`

      expect(projection.placements.some((placement) => placement.objectId === globalAxionObjectId)).toBe(true)
      expect(projection.entanglements.some((entanglement) => entanglement.objectId === globalAxionObjectId)).toBe(false)
    })

    test("projectDarkGraphToBoundary возвращает boundary projection", async () => {
      const meta = MetaFor("em-boundary")
        .fields((field) => ({
          value: field.number.required(0),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Value</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      ingestFragment(dark$, gravity$, strong$, "em-boundary/root", fragment, {})

      const projection = projectDarkGraphToBoundary(dark$)

      expect(projection.consumer).toBe("boundary")
      expect(projection.placements.length).toBeGreaterThan(0)
    })

    test("projectDarkGraphToBulk возвращает bulk projection", async () => {
      const meta = MetaFor("em-bulk")
        .fields((field) => ({
          mode: field.enum("a", "b").required("a"),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`${value.mode && html`<div>Mode</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      ingestFragment(dark$, gravity$, strong$, "em-bulk/root", fragment, {})

      const projection = projectDarkGraphToBulk(dark$)

      expect(projection.consumer).toBe("bulk")
      expect(projection.placements.length).toBeGreaterThan(0)
    })
  })

  describe("no storage ownership", () => {
    test("projection не изменяет исходные данные", async () => {
      const meta = MetaFor("em-immut")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      ingestFragment(dark$, gravity$, strong$, "em-immut/root", fragment, {})

      const snapshotBefore = snapshotDark()
      const projection = projectDarkGraph(dark$, "boundary")

      // Изменить projection
      projection.placements.push({
        id: "fake",
        meta: "fake",
        objectId: "fake",
        localPlacementId: "fake",
        localAddress: "fake",
        address: "fake",
        relation: "root",
      })

      const snapshotAfter = snapshotDark()

      // Проверка что исходные данные не изменились
      expect(snapshotAfter.placements.size).toBe(snapshotBefore.placements.size)
      expect(snapshotAfter.placements.has("fake")).toBe(false)
    })

    test("projection DTO не содержит internal storage methods", () => {
      const projection = projectDarkGraphToBoundary(dark$)

      expect("ingestFragment" in projection).toBe(false)
      expect("reset" in projection).toBe(false)
      expect("snapshot" in projection).toBe(false)
    })
  })

  describe("meta projection", () => {
    test("проецирует meta AST", async () => {
      const meta = MetaFor("em-meta")
        .fields((field) => ({
          value: field.string.required("test"),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, value, html }) => html`${state === "idle" && html`<div>${value.value}</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      ingestFragment(dark$, gravity$, strong$, "em-meta/root", fragment, {})

      // Добавим meta в dark$.meta для корректной проекции
      dark$.setMeta("em-meta/root", fragment as any)

      const projection = projectDarkGraph(dark$, "boundary")

      expect(projection.meta.size).toBeGreaterThan(0)
      expect(projection.meta.has("em-meta/root")).toBe(true)
    })
  })
})
