import { describe, expect, test } from "bun:test"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import { openSharedDbMemoryBackend } from "./memory.ts"
import { normalizeSharedDbData, sharedDbRequiredBackendIndexes } from "./backend.ts"
import { openSharedDbMaterializationWriter } from "./materialize.ts"

describe("shared db canonical relational data", () => {
  test("materializes only entity and relation tables through row-group writes", () => {
    const fixture = createSharedDbFixture()
    const backend = openSharedDbMemoryBackend()
    const writer = openSharedDbMaterializationWriter(backend)

    try {
      fixture.root.save(writer)
      fixture.child.save(writer)

      const data = normalizeSharedDbData(backend.readData())

      expect(Object.hasOwn(data, "braneIndexByDarkId")).toBe(false)
      expect(Object.hasOwn(data, "fieldIndexByDarkId")).toBe(false)
      expect(Object.hasOwn(data, "fieldWindowByBraneIndex")).toBe(false)

      expect(data.metas).toHaveLength(2)
      expect(data.metaFields).toHaveLength(6)
      expect(data.metaStates).toHaveLength(4)
      expect(data.metaTransitions).toHaveLength(2)
      expect(data.metaTransitionConditions).toHaveLength(2)
      expect(data.metaProcesses).toHaveLength(2)
      expect(data.metaProcessReads).toHaveLength(2)
      expect(data.metaProcessWrites).toHaveLength(1)
      expect(data.metaReactions).toHaveLength(1)
      expect(data.metaReactionStates).toHaveLength(1)
      expect(data.metaReactionReads).toHaveLength(1)
      expect(data.metaReactionWrites).toHaveLength(1)
      expect(data.metaMatterNodes).toHaveLength(2)
      expect(data.metaMatterEdges).toHaveLength(2)
      expect(data.wimps).toHaveLength(2)
      expect(data.wimpFields).toHaveLength(6)
      expect(data.wimpEdges).toHaveLength(2)
      expect(data.fieldValues).toHaveLength(6)
      expect(data.fieldSources).toHaveLength(3)
      expect(data.wimpStates).toHaveLength(2)
      expect(data.entanglements).toHaveLength(3)
      expect(data.entanglementMembers).toHaveLength(6)
      expect(data.entanglementFields).toHaveLength(3)
      expect(data.entanglementFieldMembers).toHaveLength(6)

      expect(data.wimps.every((row) => typeof row.id === "string" && row.id.length > 10)).toBe(true)
      expect(data.metaFields.every((row) => row.fieldKey.length > 0)).toBe(true)
      expect(data.metaTransitions.every((row) => "transitionOrder" in row)).toBe(true)
    } finally {
      backend.close()
    }
  })

  test("фиксирует новую backend-index спецификацию поверх UUID/FK ontology, а не projection keys", () => {
    expect(sharedDbRequiredBackendIndexes).toEqual(
      expect.arrayContaining([
        { name: "metas_by_src", table: "metas", columns: ["src"], unique: true },
        { name: "meta_fields_by_owner_and_field_key", table: "meta_fields", columns: ["ownerMetaId", "fieldKey"], unique: true },
        { name: "wimp_fields_by_owner_and_meta_field", table: "wimp_fields", columns: ["ownerWimpId", "metaFieldId"], unique: true },
        { name: "field_values_by_owner_wimp_field", table: "field_values", columns: ["ownerWimpFieldId"], unique: true },
      ]),
    )
    expect(sharedDbRequiredBackendIndexes.some((index) => index.columns.includes("darkWimpId"))).toBe(false)
    expect(sharedDbRequiredBackendIndexes.some((index) => index.columns.includes("darkFieldId"))).toBe(false)
    expect(sharedDbRequiredBackendIndexes.some((index) => index.columns.includes("braneIndex"))).toBe(false)
  })
})
