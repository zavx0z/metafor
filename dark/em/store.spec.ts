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
import { dark$ } from "../store.ts"

describe("@dark/em — projection-only", () => {
  beforeEach(() => {
    dark$.reset()
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
        .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      dark$.topology.ingestFragment("em-projection/root", fragment)

      const projection = projectDarkGraph("boundary")

      expect(projection.consumer).toBe("boundary")
      expect(projection.placements.length).toBeGreaterThan(0)
      // projection.meta берётся из dark$.meta, а не из topology fragments
      expect(projection.placements.some(p => p.meta === "em-projection/root")).toBe(true)
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
        .gravity(({ value, html }) => html`${value.value > 0 && html`<div>Value</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      dark$.topology.ingestFragment("em-boundary/root", fragment)

      const projection = projectDarkGraphToBoundary()

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
      dark$.topology.ingestFragment("em-bulk/root", fragment)

      const projection = projectDarkGraphToBulk()

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
        .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      dark$.topology.ingestFragment("em-immut/root", fragment)

      const snapshotBefore = dark$.topology.snapshot()
      const projection = projectDarkGraph("boundary")

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

      const snapshotAfter = dark$.topology.snapshot()

      // Проверка что исходные данные не изменились
      expect(snapshotAfter.placements.size).toBe(snapshotBefore.placements.size)
      expect(snapshotAfter.placements.has("fake")).toBe(false)
    })

    test("projection DTO не содержит internal storage methods", () => {
      const projection = projectDarkGraphToBoundary()

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
        .gravity(({ value, html }) => html`${value.value && html`<div>${value.value}</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      dark$.topology.ingestFragment("em-meta/root", fragment)

      // Добавим meta в dark$.meta для корректной проекции
      dark$.setMeta("em-meta/root", fragment as any)

      const projection = projectDarkGraph("boundary")

      expect(projection.meta.size).toBeGreaterThan(0)
      expect(projection.meta.has("em-meta/root")).toBe(true)
    })
  })
})
