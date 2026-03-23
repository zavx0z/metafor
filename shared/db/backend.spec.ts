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
    expect(tabular.rootBraneIndex).toBe(projection.rootBraneIndex)
    expect(tabular.branes).toEqual(projection.branes)
    expect(tabular.fields).toEqual(projection.fields)
    expect(tabular.fieldValues).toEqual(projection.fieldValues)
    expect(tabular.fieldSources).toEqual(projection.fieldSources)
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
    ])
  })
})

describeSharedDbBackendContract("shared db memory backend", () => openSharedDbMemoryBackend())
