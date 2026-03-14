/**
 * Тесты `@dark/weak` — structural mutation.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { MetaFor, compileLocalTopologyFragment } from "../../metafor/dsl/metafor.ts"
import { createStrongIndexStore } from "../strong/store.ts"
import { createGravityStore } from "../gravity/store.ts"
import { createWeakMutationStore } from "./store.ts"

describe("@dark/weak — мутации topology", () => {
  let strongIndex = createStrongIndexStore()
  let gravityStore = createGravityStore(strongIndex)
  let weakStore = createWeakMutationStore(gravityStore, strongIndex)

  beforeEach(() => {
    strongIndex = createStrongIndexStore()
    gravityStore = createGravityStore(strongIndex)
    weakStore = createWeakMutationStore(gravityStore, strongIndex)
  })

  describe("removePlacementSubtree", () => {
    test("удаляет placement subtree и очищает индексы", () => {
      const meta = MetaFor("remove-test")
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
      const result = gravityStore.ingestFragment("remove-test/root", fragment)

      const rootPlacementId = result.rootPlacementIds[0]!
      const initialPlacements = gravityStore.placements.size
      const initialIndexes = strongIndex.placementAddressIndex.size

      expect(initialPlacements).toBeGreaterThan(0)
      expect(initialIndexes).toBeGreaterThan(0)

      // Удалить subtree
      const mutationResult = weakStore.removePlacementSubtree(rootPlacementId)

      expect(mutationResult.removedPlacementIds).toContain(rootPlacementId)
      expect(gravityStore.placements.size).toBe(0)
      expect(strongIndex.placementAddressIndex.size).toBe(0)
      expect(strongIndex.objectPlacementsIndex.size).toBe(0)
    })

    test("удаляет связанные references и entanglements", () => {
      const rootMeta = MetaFor("remove-cascade")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`
          ${value.enabled && html`<meta-for src="child/cascade"></meta-for>`}
        `)
        .bulk()

      const childMeta = MetaFor("child")
        .fields((field) => ({
          value: field.number.required(0),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`${value.value > 0 && html`<div>${value.value}</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      const rootResult = gravityStore.ingestFragment("remove-cascade/root", rootFragment)

      // Ингест child
      const reference = gravityStore.getReference(rootResult.referenceIds[0]!)!
      gravityStore.ingestFragment("child/cascade", childFragment, {
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })

      const initialReferences = gravityStore.references.size
      const initialEntanglements = gravityStore.entanglements.size

      expect(initialReferences).toBeGreaterThan(0)

      // Удалить root subtree
      const rootPlacementId = rootResult.rootPlacementIds[0]!
      weakStore.removePlacementSubtree(rootPlacementId, {
        cascadeReferences: true,
        cascadeEntanglements: true,
      })

      expect(gravityStore.references.size).toBe(0)
      expect(gravityStore.placements.size).toBe(0)
    })
  })

  describe("replaceFragment", () => {
    test("заменяет существующий фрагмент на новый", () => {
      const metaV1 = MetaFor("replace-test")
        .fields((field) => ({
          version: field.string.required("v1"),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`${value.version && html`<div>v1</div>`}`)
        .bulk()

      const metaV2 = MetaFor("replace-test")
        .fields((field) => ({
          version: field.string.required("v2"),
          newField: field.boolean.optional(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`
          ${value.version && html`<div>v2</div>`}
          ${value.newField && html`<span>New</span>`}
        `)
        .bulk()

      const fragmentV1 = compileLocalTopologyFragment(metaV1)
      const fragmentV2 = compileLocalTopologyFragment(metaV2)

      // Ingest v1
      const v1Result = gravityStore.ingestFragment("replace-test/meta", fragmentV1)
      const initialPlacements = gravityStore.placements.size

      expect(initialPlacements).toBeGreaterThan(0)

      // Replace на v2
      const replaceResult = weakStore.replaceFragment("replace-test/meta", fragmentV2)

      expect(replaceResult.meta).toBe("replace-test/meta")
      expect(replaceResult.removedPlacementIds.length).toBeGreaterThan(0)
      expect(replaceResult.placementIds.length).toBeGreaterThan(0)

      // Проверка что v1 placements удалены
      for (const placementId of v1Result.placementIds) {
        expect(gravityStore.getPlacement(placementId)).toBeUndefined()
      }

      // Проверка что v2 placements существуют
      const newPlacements = gravityStore.getPlacementsByMeta("replace-test/meta")
      expect(newPlacements.length).toBeGreaterThan(0)
    })
  })

  describe("insertFragmentAtPlacement", () => {
    test("вставляет фрагмент в существующий placement", () => {
      const parentMeta = MetaFor("parent-insert")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`${value.enabled && html`<div>Parent</div>`}`)
        .bulk()

      const childMeta = MetaFor("child-insert")
        .fields((field) => ({
          value: field.number.required(0),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`${value.value > 0 && html`<div>Child</div>`}`)
        .bulk()

      const parentFragment = compileLocalTopologyFragment(parentMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      // Ingest parent
      const parentResult = gravityStore.ingestFragment("parent-insert/meta", parentFragment)
      const parentPlacementId = parentResult.rootPlacementIds[0]!

      const initialPlacements = gravityStore.placements.size

      // Insert child
      const insertResult = weakStore.insertFragmentAtPlacement(
        parentPlacementId,
        childFragment,
        "child-insert/meta",
      )

      expect(insertResult.placementIds.length).toBeGreaterThan(0)
      expect(gravityStore.placements.size).toBeGreaterThan(initialPlacements)

      // Проверка что child имеет parent
      const childPlacement = gravityStore.getPlacement(insertResult.placementIds[0]!)
      expect(childPlacement?.parentId).toBe(parentPlacementId)
    })
  })

  describe("remapPlacementAddresses", () => {
    test("перестраивает адреса placements после перемещения", () => {
      const meta = MetaFor("remap-test")
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
      const result = gravityStore.ingestFragment("remap-test/root", fragment)

      const rootPlacementId = result.rootPlacementIds[0]!
      const rootPlacement = gravityStore.getPlacement(rootPlacementId)!
      const oldAddress = rootPlacement.address

      expect(oldAddress).toBeDefined()

      // Remap адреса
      const newPrefix = "/w:new-prefix-0"
      const addressMap = weakStore.remapPlacementAddresses(rootPlacementId, newPrefix)

      expect(addressMap.size).toBeGreaterThan(0)
      expect(addressMap.get(oldAddress)).toBe(newPrefix)

      // Проверка что индекс обновлён
      const newPlacementId = strongIndex.placementAddressIndex.get(newPrefix)
      expect(newPlacementId).toBe(rootPlacementId)

      // Проверка что старый адрес удалён из индекса
      const oldPlacementId = strongIndex.placementAddressIndex.get(oldAddress)
      expect(oldPlacementId).toBeUndefined()
    })
  })

  describe("detachSubtree", () => {
    test("отсоединяет subtree от parent", () => {
      const rootMeta = MetaFor("detach-root")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`
          ${value.enabled && html`<meta-for src="detach/child"></meta-for>`}
        `)
        .bulk()

      const childMeta = MetaFor("detach-child")
        .fields((field) => ({
          value: field.number.required(0),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`${value.value > 0 && html`<div>Child</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      // Ingest root
      const rootResult = gravityStore.ingestFragment("detach-root/meta", rootFragment)

      // Ingest child
      const reference = gravityStore.getReference(rootResult.referenceIds[0]!)!
      gravityStore.ingestFragment("detach/child", childFragment, {
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })

      // Найти child placement
      const childPlacements = gravityStore.getPlacementsByMeta("detach/child")
      expect(childPlacements.length).toBeGreaterThan(0)

      const childPlacement = childPlacements[0]!
      expect(childPlacement.parentId).toBeDefined()

      // Detach
      const detached = weakStore.detachSubtree(childPlacement.id)

      expect(detached).toContain(childPlacement.id)

      // Проверка что parent удалён
      const updatedChild = gravityStore.getPlacement(childPlacement.id)
      expect(updatedChild?.parentId).toBeUndefined()
    })
  })

  describe("movePlacement", () => {
    test("перемещает placement в новое место", () => {
      const rootMeta = MetaFor("move-root")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`
          ${value.enabled && html`
            <meta-for src="move/child"></meta-for>
          `}
        `)
        .bulk()

      const childMeta = MetaFor("move-child")
        .fields((field) => ({
          value: field.number.required(0),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`${value.value > 0 && html`<div>Child</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      // Ingest root
      const rootResult = gravityStore.ingestFragment("move-root/meta", rootFragment)

      // Ingest child
      const reference = gravityStore.getReference(rootResult.referenceIds[0]!)!
      gravityStore.ingestFragment("move/child", childFragment, {
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })

      // Получить root и child placements
      const rootPlacements = gravityStore.getPlacementsByMeta("move-root/meta")
      const childPlacements = gravityStore.getPlacementsByMeta("move/child")

      expect(rootPlacements.length).toBeGreaterThan(0)
      expect(childPlacements.length).toBeGreaterThan(0)

      const sourcePlacement = childPlacements[0]!
      const targetPlacement = rootPlacements[0]!

      // Move child под root
      const moveResult = weakStore.movePlacement(sourcePlacement.id, {
        newParentPlacementId: targetPlacement.id,
        rebuildAddresses: false,
      })

      expect(moveResult.movedPlacementId).toBe(sourcePlacement.id)

      // Проверка что parent обновлён
      const updated = gravityStore.getPlacement(sourcePlacement.id)
      expect(updated?.parentId).toBe(targetPlacement.id)
      expect(updated?.relation).toBe("contains")
    })
  })
})
