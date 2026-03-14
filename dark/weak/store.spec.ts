/**
 * Тесты `@dark/weak` — structural mutation.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { MetaFor, compileLocalTopologyFragment } from "../../metafor/dsl/metafor.ts"
import { getPlacementsByMeta } from "../gravity/query.ts"
import { ingestFragment } from "../gravity/gravity.ts"
import { gravity$ } from "../gravity/store.ts"
import { dark$ } from "../store.ts"
import { strong$ } from "../strong/store.ts"
import {
  detachSubtree,
  insertFragmentAtPlacement,
  movePlacement,
  remapPlacementAddresses,
  removePlacementSubtree,
  replaceFragment,
} from "./weak.ts"

describe("@dark/weak — мутации topology", () => {
  beforeEach(() => {
    dark$.reset()
    gravity$.reset()
    strong$.reset()
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
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const result = ingestFragment("remove-test/root", fragment)

      const rootPlacementId = result.rootPlacementIds[0]!
      const initialPlacements = dark$.placements.size
      const initialIndexes = strong$.placementAddressIndex.size

      expect(initialPlacements).toBeGreaterThan(0)
      expect(initialIndexes).toBeGreaterThan(0)

      // Удалить subtree
      const mutationResult = removePlacementSubtree(rootPlacementId)

      expect(mutationResult.removedPlacementIds).toContain(rootPlacementId)
      expect(dark$.placements.size).toBe(0)
      expect(strong$.placementAddressIndex.size).toBe(0)
      expect(strong$.objectPlacementsIndex.size).toBe(0)
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
        .gravity(({ state, html }) => html`
          ${state === "idle" && html`<meta-for src="child/cascade"></meta-for>`}
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
        .gravity(({ state, value, html }) => html`${state === "idle" && html`<div>${value.value}</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      const rootResult = ingestFragment("remove-cascade/root", rootFragment)

      // Ингест child
      const reference = dark$.getReference(rootResult.referenceIds[0]!)!
      ingestFragment("child/cascade", childFragment, {
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })

      const initialReferences = dark$.references.size
      const initialEntanglements = dark$.entanglements.size

      expect(initialReferences).toBeGreaterThan(0)
      expect(initialEntanglements).toBeGreaterThanOrEqual(0)

      // Удалить root subtree
      const rootPlacementId = rootResult.rootPlacementIds[0]!
      removePlacementSubtree(rootPlacementId, {
        cascadeReferences: true,
        cascadeEntanglements: true,
      })

      expect(dark$.references.size).toBe(0)
      expect(dark$.placements.size).toBe(0)
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
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>v1</div>`}`)
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
        .gravity(({ state, html }) => html`
          ${state === "idle" && html`<div>v2</div>`}
          ${state === "idle" && html`<span>New</span>`}
        `)
        .bulk()

      const fragmentV1 = compileLocalTopologyFragment(metaV1)
      const fragmentV2 = compileLocalTopologyFragment(metaV2)

      // Ingest v1
      const v1Result = ingestFragment("replace-test/meta", fragmentV1)
      const initialPlacements = dark$.placements.size

      expect(initialPlacements).toBeGreaterThan(0)

      // Replace на v2
      const replaceResult = replaceFragment("replace-test/meta", fragmentV2)

      expect(replaceResult.meta).toBe("replace-test/meta")
      expect(replaceResult.removedPlacementIds.length).toBeGreaterThan(0)
      expect(replaceResult.placementIds.length).toBeGreaterThan(0)

      // Проверка что v1 placements удалены
      for (const placementId of v1Result.placementIds) {
        expect(dark$.getPlacement(placementId)).toBeUndefined()
      }

      // Проверка что v2 placements существуют
      const newPlacements = getPlacementsByMeta(dark$, "replace-test/meta")
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
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Parent</div>`}`)
        .bulk()

      const childMeta = MetaFor("child-insert")
        .fields((field) => ({
          value: field.number.required(0),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Child</div>`}`)
        .bulk()

      const parentFragment = compileLocalTopologyFragment(parentMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      // Ingest parent
      const parentResult = ingestFragment("parent-insert/meta", parentFragment)
      const parentPlacementId = parentResult.rootPlacementIds[0]!

      const initialPlacements = dark$.placements.size

      // Insert child
      const insertResult = insertFragmentAtPlacement(
        parentPlacementId,
        childFragment,
        "child-insert/meta",
      )

      expect(insertResult.placementIds.length).toBeGreaterThan(0)
      expect(dark$.placements.size).toBeGreaterThan(initialPlacements)

      // Проверка что child имеет parent
      const childPlacement = dark$.getPlacement(insertResult.placementIds[0]!)
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
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const result = ingestFragment("remap-test/root", fragment)

      const rootPlacementId = result.rootPlacementIds[0]!
      const rootPlacement = dark$.getPlacement(rootPlacementId)!
      const oldAddress = rootPlacement.address

      expect(oldAddress).toBeDefined()

      // Remap адреса
      const newPrefix = "/w:new-prefix-0"
      const addressMap = remapPlacementAddresses(rootPlacementId, newPrefix)

      expect(addressMap.size).toBeGreaterThan(0)
      expect(addressMap.get(oldAddress)).toBe(newPrefix)

      // Проверка что индекс обновлён
      const newPlacementId = strong$.placementAddressIndex.get(newPrefix)
      expect(newPlacementId).toBe(rootPlacementId)

      // Проверка что старый адрес удалён из индекса
      const oldPlacementId = strong$.placementAddressIndex.get(oldAddress)
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
        .gravity(({ state, html }) => html`
          ${state === "idle" && html`<meta-for src="detach/child"></meta-for>`}
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
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Child</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      // Ingest root
      const rootResult = ingestFragment("detach-root/meta", rootFragment)

      // Ingest child
      const reference = dark$.getReference(rootResult.referenceIds[0]!)!
      ingestFragment("detach/child", childFragment, {
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })

      // Найти child placement
      const childPlacements = getPlacementsByMeta(dark$, "detach/child")
      expect(childPlacements.length).toBeGreaterThan(0)

      const childPlacement = childPlacements[0]!
      expect(childPlacement.parentId).toBeDefined()

      // Detach
      const detached = detachSubtree(childPlacement.id)

      expect(detached).toContain(childPlacement.id)

      // Проверка что parent удалён
      const updatedChild = dark$.getPlacement(childPlacement.id)
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
        .gravity(({ state, html }) => html`
          ${state === "idle" && html`
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
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Child</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      // Ingest root
      const rootResult = ingestFragment("move-root/meta", rootFragment)

      // Ingest child
      const reference = dark$.getReference(rootResult.referenceIds[0]!)!
      ingestFragment("move/child", childFragment, {
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })

      // Получить root и child placements
      const rootPlacements = getPlacementsByMeta(dark$, "move-root/meta")
      const childPlacements = getPlacementsByMeta(dark$, "move/child")

      expect(rootPlacements.length).toBeGreaterThan(0)
      expect(childPlacements.length).toBeGreaterThan(0)

      const sourcePlacement = childPlacements[0]!
      const targetPlacement = rootPlacements[0]!

      // Move child под root
      const moveResult = movePlacement(sourcePlacement.id, {
        newParentPlacementId: targetPlacement.id,
        rebuildAddresses: false,
      })

      expect(moveResult.movedPlacementId).toBe(sourcePlacement.id)

      // Проверка что parent обновлён
      const updated = dark$.getPlacement(sourcePlacement.id)
      expect(updated?.parentId).toBe(targetPlacement.id)
      expect(updated?.relation).toBe("contains")
    })
  })
})
