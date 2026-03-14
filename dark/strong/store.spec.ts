/**
 * Тесты `@dark/strong` — graph cohesion и lookup.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { MetaFor, compileLocalTopologyFragment } from "../../metafor/dsl/metafor.ts"
import { strong$, indexPlacement } from "./store.ts"
import { gravity$ } from "../gravity/store.ts"

describe("@dark/strong — индексация и lookup", () => {
  beforeEach(() => {
    strong$.resetIndexes()
    gravity$.reset()
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
        .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const result = gravity$.ingestFragment("address-test/meta", fragment)

      const rootPlacement = gravity$.getPlacement(result.rootPlacementIds[0]!)
      expect(rootPlacement).toBeDefined()

      // Lookup по адресу через strong index
      const placementId = strong$.placementAddressIndex.get(rootPlacement!.address)
      expect(placementId).toBe(rootPlacement!.id)

      // Lookup через gravity store (делегирование strong)
      const lookedUp = gravity$.getPlacementByAddress(rootPlacement!.address)
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
        .gravity(({ value, html }) => html`
          ${value.enabled && html`
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
        .gravity(({ value, html }) => html`${value.ready && html`<div>Child</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      const rootIngest = gravity$.ingestFragment("root-multi/meta", rootFragment)

      // Ингест child через два references
      for (const referenceId of rootIngest.referenceIds) {
        const reference = gravity$.getReference(referenceId)!
        gravity$.ingestFragment("child/shared", childFragment, {
          parentPlacementId: reference.placementId,
          viaReferenceId: reference.id,
        })
      }

      // Проверка что один object имеет multiple placements
      const childObjectId = "child/shared#f0"
      const placementIds = strong$.objectPlacementsIndex.get(childObjectId)
      expect(placementIds).toHaveLength(2)

      // Проверка через gravity store
      const placements = gravity$.getPlacementsByObject(childObjectId)
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
      const result = gravity$.ingestFragment("meta-index/root", fragment)

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
        .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      gravity$.ingestFragment("meta-lookup/root", fragment)

      const placements = gravity$.getPlacementsByMeta("meta-lookup/root")
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
        .gravity(({ value, html }) => html`
          ${value.enabled && html`
            <meta-for src="child/a"></meta-for>
            <meta-for src="child/b"></meta-for>
          `}
        `)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      gravity$.ingestFragment("ref-lookup/root", fragment)

      // Проверка lookup по source
      const refsA = gravity$.getReferencesBySource("child/a")
      expect(refsA).toHaveLength(1)

      const refsB = gravity$.getReferencesBySource("child/b")
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
        .gravity(({ value, html }) => html`${value.value > 0 && html`<div>${value.value}</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const result = gravity$.ingestFragment("ent-lookup/root", fragment)

      // Получить первый entanglement
      if (result.entanglementIds.length > 0) {
        const entanglement = gravity$.getEntanglement(result.entanglementIds[0]!)
        expect(entanglement).toBeDefined()

        // Lookup по entanglement address
        const entId = strong$.entanglementAddressIndex.get(entanglement!.entanglementAddress)
        expect(entId).toBe(entanglement!.id)

        // Lookup через gravity store
        const lookedUp = gravity$.getEntanglementByAddress(entanglement!.entanglementAddress)
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
      const snapshot = strong$.snapshotIndexes()
      expect(snapshot.placementAddressIndex.size).toBeGreaterThan(0)

      // Reset и restore
      strong$.resetIndexes()
      expect(strong$.placementAddressIndex.size).toBe(0)

      strong$.restoreIndexes(snapshot)
      expect(strong$.placementAddressIndex.size).toBeGreaterThan(0)
    })
  })
})
