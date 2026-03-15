/**
 * Тесты `@dark/strong` — graph cohesion и lookup.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { MetaFor, compileLocalTopologyFragment } from "../../metafor/dsl/metafor.ts"
import { ingestFragment } from "../gravity/gravity.ts"
import {
  getEntanglementByAddress,
  getPlacementByAddress,
  getPlacementsByMeta,
  getPlacementsByObject,
  getReferencesBySource,
} from "../gravity/query.ts"
import { dark$ } from "../store.ts"
import { gravity$ } from "../gravity/store.ts"
import { strong$ } from "./store.ts"
import { indexPlacement } from "@dark/strong"
import { resetAll, resetStrong, snapshotStrong, restoreStrong } from "../tests/fixtures"

describe("@dark/strong — индексация и lookup", () => {
  beforeEach(() => {
    resetAll()
  })

  describe("placement address index", () => {
    test("индексирует placement по адресу и позволяет найти по адресу", () => {
      const meta = MetaFor("address-test")
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
      const result = ingestFragment(dark$, gravity$, strong$, "address-test/meta", fragment, {})

      const rootPlacement = dark$.getPlacement(result.rootPlacementIds[0]!)
      expect(rootPlacement).toBeDefined()

      // Lookup по адресу через strong index
      const placementId = strong$.placementAddressIndex.get(rootPlacement!.address)
      expect(placementId).toBe(rootPlacement!.id)

      const lookedUp = getPlacementByAddress(dark$, rootPlacement!.address)
      expect(lookedUp?.id).toBe(rootPlacement?.id)
    })

    test("проверяет что placement ещё не индексирован", () => {
      const isIndexed = strong$.isPlacementIndexed("/non-existent")
      expect(isIndexed).toBe(false)
    })
  })

  describe("object placements index", () => {
    test("индексирует multiple placements для одного object", () => {
      const rootMeta = MetaFor("root-multi")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`
          ${state === "idle" && html`
            <meta-for src="child/shared"></meta-for>
            <meta-for src="child/shared"></meta-for>
          `}
        `)
        .bulk()

      const childMeta = MetaFor("child")
        .fields((field) => ({
          ready: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Child</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      const rootIngest = ingestFragment(dark$, gravity$, strong$, "root-multi/meta", rootFragment, {})

      // Ингест child через два references
      for (const referenceId of rootIngest.referenceIds) {
        const reference = dark$.getReference(referenceId)!
        ingestFragment(dark$, gravity$, strong$, "child/shared", childFragment, {
          parentPlacementId: reference.placementId,
          viaReferenceId: reference.id,
        })
      }

      // Проверка что один object имеет multiple placements
      // NodeLogical -> axion, поэтому objectId использует префикс "a"
      const childObjectId = "child/shared#a0"
      const placementIds = strong$.objectPlacementsIndex.get(childObjectId)
      expect(placementIds).toHaveLength(2)

      const placements = getPlacementsByObject(dark$, childObjectId)
      expect(placements).toHaveLength(2)
      expect(new Set(placements.map((p) => p.address)).size).toBe(2)
    })
  })

  describe("source meta index", () => {
    test("индексирует все сущности по meta", () => {
      const meta = MetaFor("meta-index")
        .fields((field) => ({
          mode: field.enum("a", "b").required("a"),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`
          ${value.mode && html`<meta-for src="child/a"></meta-for>`}
        `)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const result = ingestFragment(dark$, gravity$, strong$, "meta-index/root", fragment, {})

      const metaIndex = strong$.sourceMetaIndex.get("meta-index/root")
      expect(metaIndex).toBeDefined()
      expect(metaIndex?.placementIds).toHaveLength(result.placementIds.length)
      expect(metaIndex?.referenceIds).toHaveLength(result.referenceIds.length)
    })

    test("getPlacementsByMeta возвращает placements для meta", () => {
      const meta = MetaFor("meta-lookup")
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
      ingestFragment(dark$, gravity$, strong$, "meta-lookup/root", fragment, {})

      const placements = getPlacementsByMeta(dark$, "meta-lookup/root")
      expect(placements.length).toBeGreaterThan(0)
    })
  })

  describe("reference source lookup", () => {
    test("индексирует references по source и позволяет найти", () => {
      const meta = MetaFor("ref-lookup")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`
          ${state === "idle" && html`
            <meta-for src="child/a"></meta-for>
            <meta-for src="child/b"></meta-for>
          `}
        `)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      ingestFragment(dark$, gravity$, strong$, "ref-lookup/root", fragment, {})

      // Проверка lookup по source
      const refsA = getReferencesBySource(dark$, "child/a")
      expect(refsA).toHaveLength(1)

      const refsB = getReferencesBySource(dark$, "child/b")
      expect(refsB).toHaveLength(1)

      // Проверка через strong index
      const refIdsA = strong$.metaSourceLookup.get("child/a")
      expect(refIdsA).toHaveLength(1)
    })

    test("проверяет что reference уже индексирован по source", () => {
      const hasRef = strong$.hasReferenceBySource("non-existent", "ref-1")
      expect(hasRef).toBe(false)
    })
  })

  describe("entanglement address index", () => {
    test("индексирует entanglement по адресу и позволяет найти", () => {
      const meta = MetaFor("ent-lookup")
        .fields((field) => ({
          value: field.number.required(0),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, value, html }) => html`${state === "idle" && html`<div>${value.value}</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const result = ingestFragment(dark$, gravity$, strong$, "ent-lookup/root", fragment, {})

      // Получить первый entanglement
      if (result.entanglementIds.length > 0) {
        const entanglement = dark$.getEntanglement(result.entanglementIds[0]!)
        expect(entanglement).toBeDefined()

        // Lookup по entanglement address
        const entId = strong$.entanglementAddressIndex.get(entanglement!.entanglementAddress)
        expect(entId).toBe(entanglement!.id)

        const lookedUp = getEntanglementByAddress(dark$, entanglement!.entanglementAddress)
        expect(lookedUp?.id).toBe(entanglement?.id)
      }
    })
  })

  describe("snapshot и restore", () => {
    test("snapshot сохраняет индексы и restore восстанавливает", () => {
      // Индексируем placement напрямую
      const mockPlacement = {
        id: "gp0",
        meta: "test",
        objectId: "test#f0",
        localPlacementId: "p0",
        localAddress: "/f0",
        address: "/w:test-0/f0",
        relation: "root" as const,
      }

      indexPlacement(mockPlacement, "test")
      expect(strong$.placementAddressIndex.size).toBeGreaterThan(0)

      // Сделать snapshot
      const snapshot = snapshotStrong()
      expect(snapshot.placementAddressIndex.size).toBeGreaterThan(0)

      // Reset и restore
      resetStrong()
      expect(strong$.placementAddressIndex.size).toBe(0)

      restoreStrong(snapshot)
      expect(strong$.placementAddressIndex.size).toBeGreaterThan(0)
    })
  })
})
