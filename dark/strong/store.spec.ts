/**
 * Тесты `@dark/strong` — graph cohesion и lookup.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { MetaFor, compileLocalTopologyFragment } from "../../metafor/dsl/metafor.ts"
import { createStrongIndexStore, strongIndex$, indexPlacement } from "./store.ts"
import { createGravityStore } from "../gravity/store.ts"
import type { GlobalTopologyPlacement, GlobalTopologyReference, GlobalTopologyEntanglement } from "../gravity/store.t.ts"

describe("@dark/strong — индексация и lookup", () => {
  let strongIndex = createStrongIndexStore()
  let gravityStore = createGravityStore(strongIndex)

  beforeEach(() => {
    strongIndex = createStrongIndexStore()
    gravityStore = createGravityStore(strongIndex)
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
      const result = gravityStore.ingestFragment("address-test/meta", fragment)

      const rootPlacement = gravityStore.getPlacement(result.rootPlacementIds[0]!)
      expect(rootPlacement).toBeDefined()

      // Lookup по адресу через strong index
      const placementId = strongIndex.placementAddressIndex.get(rootPlacement!.address)
      expect(placementId).toBe(rootPlacement!.id)

      // Lookup через gravity store (делегирование strong)
      const lookedUp = gravityStore.getPlacementByAddress(rootPlacement!.address)
      expect(lookedUp?.id).toBe(rootPlacement?.id)
    })

    test("проверяет что placement ещё не индексирован", () => {
      const isIndexed = strongIndex.isPlacementIndexed("/non-existent")
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

      const rootIngest = gravityStore.ingestFragment("root-multi/meta", rootFragment)

      // Ингест child через два references
      for (const referenceId of rootIngest.referenceIds) {
        const reference = gravityStore.getReference(referenceId)!
        gravityStore.ingestFragment("child/shared", childFragment, {
          parentPlacementId: reference.placementId,
          viaReferenceId: reference.id,
        })
      }

      // Проверка что один object имеет multiple placements
      const childObjectId = "child/shared#f0"
      const placementIds = strongIndex.objectPlacementsIndex.get(childObjectId)
      expect(placementIds).toHaveLength(2)

      // Проверка через gravity store
      const placements = gravityStore.getPlacementsByObject(childObjectId)
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
      const result = gravityStore.ingestFragment("meta-index/root", fragment)

      const metaIndex = strongIndex.sourceMetaIndex.get("meta-index/root")
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
      gravityStore.ingestFragment("meta-lookup/root", fragment)

      const placements = gravityStore.getPlacementsByMeta("meta-lookup/root")
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
      gravityStore.ingestFragment("ref-lookup/root", fragment)

      // Проверка lookup по source
      const refsA = gravityStore.getReferencesBySource("child/a")
      expect(refsA).toHaveLength(1)

      const refsB = gravityStore.getReferencesBySource("child/b")
      expect(refsB).toHaveLength(1)

      // Проверка через strong index
      const refIdsA = strongIndex.metaSourceLookup.get("child/a")
      expect(refIdsA).toHaveLength(1)
    })

    test("проверяет что reference уже индексирован по source", () => {
      const hasRef = strongIndex.hasReferenceBySource("non-existent", "ref-1")
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
      const result = gravityStore.ingestFragment("ent-lookup/root", fragment)

      // Получить первый entanglement
      if (result.entanglementIds.length > 0) {
        const entanglement = gravityStore.getEntanglement(result.entanglementIds[0]!)
        expect(entanglement).toBeDefined()

        // Lookup по entanglement address
        const entId = strongIndex.entanglementAddressIndex.get(entanglement!.entanglementAddress)
        expect(entId).toBe(entanglement!.id)

        // Lookup через gravity store
        const lookedUp = gravityStore.getEntanglementByAddress(entanglement!.entanglementAddress)
        expect(lookedUp?.id).toBe(entanglement?.id)
      }
    })
  })

  describe("snapshot и restore", () => {
    test("snapshot сохраняет индексы и restore восстанавливает", () => {
      // Создаём отдельный strong index для теста snapshot
      const testStrongIndex = createStrongIndexStore()

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

      indexPlacement(testStrongIndex, mockPlacement, "test")
      expect(testStrongIndex.placementAddressIndex.size).toBeGreaterThan(0)

      // Сделать snapshot
      const snapshot = testStrongIndex.snapshotIndexes()
      expect(snapshot.placementAddressIndex.size).toBeGreaterThan(0)

      // Reset и restore
      testStrongIndex.resetIndexes()
      expect(testStrongIndex.placementAddressIndex.size).toBe(0)

      testStrongIndex.restoreIndexes(snapshot)
      expect(testStrongIndex.placementAddressIndex.size).toBeGreaterThan(0)
    })
  })
})
