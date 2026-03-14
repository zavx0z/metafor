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
import { gravity$ } from "./store.ts"
import { strong$ } from "../strong/store.ts"

describe("@dark/gravity — world assembly", () => {
  beforeEach(() => {
    gravity$.reset()
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
        .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const result = gravity$.ingestFragment("ingest-single/meta", fragment)

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

      const rootIngest = gravity$.ingestFragment("root-identity/meta", rootFragment)
      expect(rootIngest.referenceIds).toHaveLength(2)

      for (const referenceId of rootIngest.referenceIds) {
        const reference = gravity$.getReference(referenceId)!
        gravity$.ingestFragment("child/shared", childFragment, {
          parentPlacementId: reference.placementId,
          viaReferenceId: reference.id,
        })
      }

      const childObjectId = "child/shared#f0"
      const childPlacements = gravity$.getPlacementsByObject(childObjectId)

      expect(gravity$.getObject(childObjectId)).toBeDefined()
      expect(childPlacements).toHaveLength(2)
      expect(new Set(childPlacements.map((placement) => placement.address)).size).toBe(2)
      expect(gravity$.getReferencesBySource("child/shared")).toHaveLength(2)

      const entanglementAddresses = childPlacements.map(
        (placement) => `ent:${childObjectId}@${placement.address}`,
      )
      expect(gravity$.getEntanglementByAddress(entanglementAddresses[0]!)).toBeDefined()
      expect(gravity$.getEntanglementByAddress(entanglementAddresses[1]!)).toBeDefined()
      expect(entanglementAddresses[0]).not.toBe(entanglementAddresses[1])
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
      const result = gravity$.ingestFragment("placement-create/root", fragment)

      const placement = gravity$.getPlacement(result.placementIds[0]!)
      expect(placement).toBeDefined()
      expect(placement?.id).toMatch(/^gp\d+$/)
      expect(placement?.meta).toBe("placement-create/root")
      expect(placement?.objectId).toMatch(/^placement-create\/root#f\d+$/)
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
        .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      const ingested = gravity$.ingestFragment("address-stitch/root", fragment)

      const rootPlacement = gravity$.getPlacement(ingested.rootPlacementIds[0]!)
      expect(rootPlacement).toBeDefined()
      expect(rootPlacement?.address.startsWith("/w:address-stitch-root-0")).toBe(true)
      expect(rootPlacement?.localAddress.startsWith("/f")).toBe(true)
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
      const ingested = gravity$.ingestFragment("address-lookup/root", fragment)

      const rootPlacement = gravity$.getPlacement(ingested.rootPlacementIds[0]!)
      expect(rootPlacement).toBeDefined()

      const lookedUp = gravity$.getPlacementByAddress(rootPlacement!.address)
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
        .gravity(({ value, html }) => html`
          ${value.enabled && html`<meta-for src="link/child"></meta-for>`}
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
        .gravity(({ value, html }) => html`${value.value > 0 && html`<div>Child</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const childFragment = compileLocalTopologyFragment(childMeta)

      const rootResult = gravity$.ingestFragment("link-root/meta", rootFragment)

      const reference = gravity$.getReference(rootResult.referenceIds[0]!)!
      gravity$.ingestFragment("link/child", childFragment, {
        parentPlacementId: reference.placementId,
        viaReferenceId: reference.id,
      })

      // Проверка что link создан
      const childPlacements = gravity$.getPlacementsByMeta("link/child")
      expect(childPlacements.length).toBeGreaterThan(0)

      const childPlacement = childPlacements[0]!
      expect(childPlacement.parentId).toBeDefined()

      const link = Array.from(gravity$.links.values()).find(
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
        .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)

      // Первый ingest
      const result1 = gravity$.ingestFragment("root-occur/meta", fragment)
      const addr1 = gravity$.getPlacement(result1.rootPlacementIds[0]!)?.address

      // Второй ingest того же meta
      const result2 = gravity$.ingestFragment("root-occur/meta", fragment)
      const addr2 = gravity$.getPlacement(result2.rootPlacementIds[0]!)?.address

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
        .gravity(({ value, html }) => html`
          ${value.enabled && html`
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
        .gravity(({ value, html }) => html`${value.value > 0 && html`<div>Shared</div>`}`)
        .bulk()

      const rootFragment = compileLocalTopologyFragment(rootMeta)
      const sharedFragment = compileLocalTopologyFragment(sharedMeta)

      const rootResult = gravity$.ingestFragment("multi-context/root", rootFragment)

      // Ингест shared fragment дважды через разные references
      const contexts: string[] = []
      for (const referenceId of rootResult.referenceIds) {
        const reference = gravity$.getReference(referenceId)!
        const result = gravity$.ingestFragment("shared/fragment", sharedFragment, {
          parentPlacementId: reference.placementId,
          viaReferenceId: reference.id,
        })
        const placement = gravity$.getPlacement(result.placementIds[0]!)
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
        .gravity(({ value, html }) => html`${value.enabled && html`<div>Content</div>`}`)
        .bulk()

      const fragment = compileLocalTopologyFragment(meta)
      gravity$.ingestFragment("snapshot-gravity/root", fragment)

      const snapshot = gravity$.snapshot()
      expect(snapshot.placements.size).toBeGreaterThan(0)

      gravity$.reset()
      expect(gravity$.placements.size).toBe(0)

      gravity$.restore(snapshot)
      expect(gravity$.placements.size).toBeGreaterThan(0)
    })
  })
})
