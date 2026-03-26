import { describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { createSharedDbFixture } from "fixture/db.fixture"
import { normalizeSharedDbData, readSharedDbData, sharedDbRequiredBackendIndexes } from "./backend"
import { inspectSharedDbIndexedDbSchema, openSharedDbIndexedDbBackend } from "./idb"
import { openSharedDbMaterializationWriter } from "./materialize"
import { assembleSharedDbData } from "fixture/dark"

const createIndexedDbTarget = () => ({
  indexedDb: new IDBFactory(),
  databaseName: `metafor-shared-db-${crypto.randomUUID()}`,
})

describe("shared db indexeddb backend", () => {
  test("создаёт canonical relational stores и indexes поверх того же backend-контракта", async () => {
    const target = createIndexedDbTarget()
    const backend = await openSharedDbIndexedDbBackend(target)

    try {
      const schema = await inspectSharedDbIndexedDbSchema(target)
      expect(schema.map((entry) => entry.store)).toEqual([
        "metas",
        "meta_fields",
        "meta_states",
        "meta_transitions",
        "meta_transition_conditions",
        "meta_processes",
        "meta_process_reads",
        "meta_process_writes",
        "meta_reactions",
        "meta_reaction_states",
        "meta_reaction_reads",
        "meta_reaction_writes",
        "meta_matter_nodes",
        "meta_matter_edges",
        "wimps",
        "wimp_fields",
        "wimp_edges",
        "field_values",
        "field_sources",
        "wimp_states",
        "entanglements",
        "entanglement_members",
        "entanglement_fields",
        "entanglement_field_members",
      ])

      const allIndexes = schema.flatMap((entry) => entry.indexes)
      expect(allIndexes).toEqual(expect.arrayContaining(sharedDbRequiredBackendIndexes.map((index) => index.name)))
    } finally {
      backend.close()
    }
  })

  test("сохраняет canonical relational rows через row-group writes и перечитывает их после повторного открытия", async () => {
    const target = createIndexedDbTarget()
    const fixture = createSharedDbFixture()
    const expected = await assembleSharedDbData(fixture.root)

    const writer = await openSharedDbIndexedDbBackend(target)
    try {
      const materializer = openSharedDbMaterializationWriter(writer)
      await fixture.root.save(materializer)
      await fixture.child.save(materializer)
      await writer.flush()
    } finally {
      writer.close()
    }

    const reader = await openSharedDbIndexedDbBackend(target)
    try {
      const restored = readSharedDbData(reader)
      expect(normalizeSharedDbData(restored)).toEqual(normalizeSharedDbData(expected))

      await reader.setFieldValue(fixture.fields.childAlias!.id, "Alias via indexeddb")
      await reader.flush()
    } finally {
      reader.close()
    }

    const reopened = await openSharedDbIndexedDbBackend(target)
    try {
      expect(
        readSharedDbData(reopened).fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.childAlias!.id)?.value,
      ).toBe("Alias via indexeddb")
    } finally {
      reopened.close()
    }
  })
})
