import { describe, expect, test } from "bun:test"
import { assembleSharedDbProjection } from "../../dark/db.ts"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import {
  createSharedDbProjection,
  prepareSharedDbTabularData,
  sharedDbRequiredBackendIndexes,
} from "./backend.ts"
import { describeSharedDbBackendContract } from "./backend.contract.ts"
import { openSharedDbMemoryBackend } from "./memory.ts"

describe("shared db tabular contract", () => {
  test("отделяет канонические таблицы от derived indexes проекции", () => {
    const fixture = createSharedDbFixture()
    const projection = assembleSharedDbProjection(fixture.root)
    const tabular = prepareSharedDbTabularData(projection)
    const rebuilt = createSharedDbProjection(tabular)

    expect(Object.hasOwn(tabular, "braneIndexByDarkId")).toBe(false)
    expect(Object.hasOwn(tabular, "fieldIndexByDarkId")).toBe(false)
    expect(Object.hasOwn(tabular, "rootBraneIndex")).toBe(false)
    expect(Object.hasOwn(tabular.branes[0]!, "fieldOffset")).toBe(false)
    expect(Object.hasOwn(tabular.branes[0]!, "fieldCount")).toBe(false)
    expect(tabular.branes).toEqual(projection.branes)
    expect(tabular.fields).toEqual(projection.fields)
    expect(tabular.fieldValues).toEqual(projection.fieldValues)
    expect(tabular.fieldSources).toEqual(projection.fieldSources)
    expect(tabular.entanglementBlocks).toEqual(projection.entanglementBlocks)
    expect(tabular.entanglementFields).toEqual(projection.entanglementFields)
    expect(tabular.stateSeedStates).toEqual(projection.stateSeedStates)
    expect(rebuilt.rootBraneIndex).toBe(0)
    expect(rebuilt.fieldWindowByBraneIndex).toEqual([
      { fieldOffset: 0, fieldCount: 3 },
      { fieldOffset: 3, fieldCount: 3 },
    ])
    expect(rebuilt.braneIndexByDarkId.get(fixture.root.id)).toBe(0)
    expect(rebuilt.fieldIndexByDarkId.get(fixture.fields.childAlias.id)).toBe(3)
  })

  test("фиксирует обязательные backend secondary indexes", () => {
    expect(sharedDbRequiredBackendIndexes).toEqual([
      { name: "branes_by_dark_wimp_id", table: "branes", columns: ["darkWimpId"], unique: true },
      { name: "fields_by_dark_field_id", table: "fields", columns: ["darkFieldId"], unique: true },
      { name: "fields_by_owner_brane_and_key", table: "fields", columns: ["ownerBraneIndex", "key"], unique: true },
      { name: "field_values_by_field_index", table: "field_values", columns: ["fieldIndex"], unique: true },
      { name: "field_sources_by_child_field_index", table: "field_sources", columns: ["childFieldIndex"], unique: true },
      { name: "field_sources_by_parent_field_index", table: "field_sources", columns: ["parentFieldIndex"], unique: false },
      {
        name: "entanglement_seed_block_members_by_block_index",
        table: "entanglement_seed_block_members",
        columns: ["blockIndex", "memberIndex"],
        unique: true,
      },
      {
        name: "entanglement_seed_fields_by_block_index_and_block_field_index",
        table: "entanglement_seed_fields",
        columns: ["blockIndex", "blockFieldIndex"],
        unique: true,
      },
      {
        name: "entanglement_seed_field_members_by_entanglement_field_index_and_member_index",
        table: "entanglement_seed_field_members",
        columns: ["entanglementFieldIndex", "memberIndex"],
        unique: true,
      },
      {
        name: "state_seed_states_by_owner_brane_and_state_index",
        table: "state_seed_states",
        columns: ["ownerBraneIndex", "stateIndex"],
        unique: true,
      },
      {
        name: "state_seed_transitions_by_owner_brane_and_from_state_and_transition_index",
        table: "state_seed_transitions",
        columns: ["ownerBraneIndex", "fromStateIndex", "transitionIndex"],
        unique: true,
      },
      {
        name: "state_seed_conditions_by_transition_seed_index_and_condition_index",
        table: "state_seed_conditions",
        columns: ["transitionSeedIndex", "conditionIndex"],
        unique: true,
      },
    ])
  })
})

describeSharedDbBackendContract("shared db memory backend", () => openSharedDbMemoryBackend())
