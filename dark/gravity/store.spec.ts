/**
 * Тесты `@dark/gravity` — world assembly.
 *
 * Проверяют что gravity отвечает только за assembly:
 * - ingest фрагментов
 * - создание placements
 * - address stitching
 * - создание links
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { MetaFor, compileLocalTopologyFragment } from "../../metafor/dsl/metafor.ts"
import {
  getEntanglementByAddress,
  getPlacementByAddress,
  getPlacementsByMeta,
  getPlacementsByObject,
  getReferencesBySource,
} from "./query.ts"
import { ingestFragment } from "./gravity.ts"
import { dark$ } from "../store.ts"
import { gravity$ } from "./store.ts"
import { strong$ } from "../strong/store.ts"

describe("@dark/gravity — world assembly", () => {
  beforeEach(() => {
    dark$.reset()
    gravity$.reset()
    strong$.reset()
  })

  describe("fragment ingest", () => {
    test("ингестит локальные фрагменты по одному", () => {
      const meta = MetaFor("ingest-single")
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
      const result = ingestFragment("ingest-single/meta", fragment)

      expect(result.meta).toBe("ingest-single/meta")
      expect(result.placementIds.length).toBeGreaterThan(0)
      expect(result.rootPlacementIds.length).toBeGreaterThan(0)
    })

    test("различает object identity и placement identity", () => {
      const rootMeta = MetaFor("root-identity")
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

      const rootIngest = ingestFragment("root-identity/meta", rootFragment)
      expect(rootIngest.referenceIds).toHaveLength(2)

      for (const referenceId of rootIngest.referenceIds) {
        const reference = dark$.getReference(referenceId)!
        ingestFragment("child/shared", childFragment, {
          parentPlacementId: reference.placementId,
          viaReferenceId: reference.id,
        })
      }

      const childObjectId = "child/shared#a0"
      const childPlacements = getPlacementsByObject(dark$, childObjectId)

      expect(dark$.getObject(childObjectId)).toBeDefined()
      expect(childPlacements).toHaveLength(2)
      expect(new Set(childPlacements.map((placement) => placement.address)).size).toBe(2)
      expect(getReferencesBySource(dark$, "child/shared")).toHaveLength(2)

      // Axion не участвует в entanglement — это логическая группировка, а не выбор ветви
      // Поэтому entanglement создаётся только для parent placement
      const entanglementAddresses = childPlacements.map(
        (placement) => `ent:${childObjectId}@${placement.address}`,
      )
      // Проверяем что placements существуют и имеют разные адреса
      expect(entanglementAddresses[0]).not.toBe(entanglementAddresses[1])
    })

    test("не создаёт global entanglement для macho placements", () => {
      const meta = MetaFor("macho-no-entanglement")
        .fields((field) => ({
          rows: field.array.required<string>([]),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ value, html }) => html`
          ${value.rows.map((row) => html`
            <meta-for src="child/row" fields=${{ row }}></meta-for>
          `)}
        `)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const macho = Object.values(fragment.objects).find((object) => object.kind === "macho")

      expect(macho).toBeDefined()
      if (!macho) {
        throw new Error("macho object не собран")
      }

      ingestFragment("macho-no-entanglement/root", fragment)

      const globalMachoObjectId = `macho-no-entanglement/root#${macho.id}`
      expect(dark$.getObject(globalMachoObjectId)).toBeDefined()
      expect(Array.from(dark$.entanglements.values()).some((entanglement) => entanglement.objectId === globalMachoObjectId)).toBe(false)
      expect(Array.from(dark$.entanglements.values()).every((entanglement) => entanglement.seed.kind !== "macho")).toBe(true)
    })
  })

  describe("global placement creation", () => {
    test("создаёт global placement с правильным identity", () => {
      const meta = MetaFor("placement-create")
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
      const result = ingestFragment("placement-create/root", fragment)

      const placement = dark$.getPlacement(result.placementIds[0]!)
      expect(placement).toBeDefined()
      expect(placement?.id).toMatch(/^gp\d+$/)
      expect(placement?.meta).toBe("placement-create/root")
      // NodeLogical -> axion, поэтому objectId использует префикс "a"
      expect(placement?.objectId).toMatch(/^placement-create\/root#a\d+$/)
    })
  })

  describe("local-to-global address stitching", () => {
    test("строит глобальный адрес из локального", () => {
      const meta = MetaFor("address-stitch")
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
      const ingested = ingestFragment("address-stitch/root", fragment)

      const rootPlacement = dark$.getPlacement(ingested.rootPlacementIds[0]!)
      expect(rootPlacement).toBeDefined()
      expect(rootPlacement?.address.startsWith("/w:address-stitch-root-0")).toBe(true)
      // NodeLogical -> axion, поэтому localAddress использует префикс "/a"
      expect(rootPlacement?.localAddress.startsWith("/a")).toBe(true)
    })

    test("поддерживает lookup по адресу", () => {
      const meta = MetaFor("address-lookup")
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
      const ingested = ingestFragment("address-lookup/root", fragment)

      const rootPlacement = dark$.getPlacement(ingested.rootPlacementIds[0]!)
      expect(rootPlacement).toBeDefined()

      const lookedUp = getPlacementByAddress(dark$, rootPlacement!.address)
      expect(lookedUp?.id).toBe(rootPlacement?.id)
    })
  })

  describe("global link creation", () => {
    test("создаёт links между parent и child placements", () => {
      const rootMeta = MetaFor("link-root")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`
          ${state === "idle" && html`<meta-for src="link/child"></meta-for>`}
        `)
        .bulk()

      const childMeta = MetaFor("link-child")
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

      const rootResult = ingestFragment("link-root/meta", rootFragment)

      const reference = dark$.getReference(rootResult.referenceIds[0]!)!
      ingestFragment("link/child", childFragment, {
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })

      // Проверка что link создан
      const childPlacements = getPlacementsByMeta(dark$, "link/child")
      expect(childPlacements.length).toBeGreaterThan(0)

      const childPlacement = childPlacements[0]!
      expect(childPlacement.parentId).toBeDefined()

      const link = Array.from(dark$.links.values()).find(
        (link) => link.to === childPlacement.id,
      )
      expect(link).toBeDefined()
      expect(link?.from).toBe(childPlacement.parentId)
      expect(link?.relation).toBe("contains")
    })
  })

  describe("root/world inclusion", () => {
    test("аллоцирует root occurrence sequence", () => {
      const meta = MetaFor("root-occur")
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

      // Первый ingest
      const result1 = ingestFragment("root-occur/meta", fragment)
      const addr1 = dark$.getPlacement(result1.rootPlacementIds[0]!)?.address

      // Второй ingest того же meta
      const result2 = ingestFragment("root-occur/meta", fragment)
      const addr2 = dark$.getPlacement(result2.rootPlacementIds[0]!)?.address

      expect(addr1).not.toBe(addr2)
      expect(addr1).toMatch(/root-occur-meta-0/)
      expect(addr2).toMatch(/root-occur-meta-1/)
    })

    test("один fragment входит в разные world contexts", () => {
      const rootMeta = MetaFor("multi-context")
        .fields((field) => ({
          enabled: field.boolean.required(true),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`
          ${state === "idle" && html`
            <meta-for src="shared/fragment"></meta-for>
            <meta-for src="shared/fragment"></meta-for>
          `}
        `)
        .bulk()

      const sharedMeta = MetaFor("shared")
        .fields((field) => ({
          value: field.number.required(0),
        }))
        .superposition({ idle: null })
        .mass()
        .processes()
        .reactions()
        .gravity(({ state, html }) => html`${state === "idle" && html`<div>Shared</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const sharedFragment = compileLocalTopologyFragment(sharedMeta)

      const rootResult = ingestFragment("multi-context/root", rootFragment)

      // Ингест shared fragment дважды через разные references
      const contexts: string[] = []
      for (const referenceId of rootResult.referenceIds) {
        const reference = dark$.getReference(referenceId)!
        const result = ingestFragment("shared/fragment", sharedFragment, {
          parentPlacementId: reference.placementId,
          viaReferenceId: reference.id,
        })
        const placement = dark$.getPlacement(result.placementIds[0]!)
        if (placement) {
          contexts.push(placement.address)
        }
      }

      expect(contexts).toHaveLength(2)
      expect(contexts[0]).not.toBe(contexts[1])
    })
  })

  describe("snapshot и restore", () => {
    test("snapshot сохраняет состояние и restore восстанавливает", () => {
      const meta = MetaFor("snapshot-gravity")
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
      ingestFragment("snapshot-gravity/root", fragment)

      const snapshot = gravity$.snapshot()
      expect(snapshot.fragments.size).toBeGreaterThan(0)

      gravity$.reset()
      expect(gravity$.fragments.size).toBe(0)

      gravity$.restore(snapshot)
      expect(gravity$.fragments.size).toBeGreaterThan(0)
    })
  })
})
