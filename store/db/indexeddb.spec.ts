import { describe, expect, test } from "bun:test"
import { IDBFactory } from "fake-indexeddb"
import { createDbFixture } from "fixture/db.fixture.ts"
import { dbRequiredBackendIndexes, normalizeDbData } from "./backend.ts"
import { selectDbFieldValue, selectDbMetaRows, selectDbWimpRows } from "./fixture.ts"
import { inspectDbIndexedDbSchema, openDbIndexedDbBackend } from "./idb.ts"
import { openDbMaterializationWriter } from "../materialize.ts"
import { assembleDbData } from "fixture/dark.ts"

const createIndexedDbTarget = () => ({
  indexedDb: new IDBFactory(),
  databaseName: `metafor-db-${crypto.randomUUID()}`,
})

describe("db indexeddb backend", () => {
  test("создаёт canonical relational stores и indexes поверх того же backend-контракта", async () => {
    const target = createIndexedDbTarget()
    const backend = await openDbIndexedDbBackend(target)

    try {
      const schema = await inspectDbIndexedDbSchema(target)
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
        "view_wimps",
        "view_wimp_fields",
        "view_wimp_edges",
        "view_field_values",
        "view_field_sources",
        "view_wimp_states",
        "view_entanglements",
        "view_entanglement_members",
        "view_entanglement_fields",
        "view_entanglement_field_members",
      ])

      const allIndexes = schema.flatMap((entry) => entry.indexes)
      expect(allIndexes).toEqual(expect.arrayContaining(dbRequiredBackendIndexes.map((index) => index.name)))
    } finally {
      backend.close()
    }
  })

  test("сохраняет canonical relational rows через row-group writes и перечитывает их после повторного открытия", async () => {
    const target = createIndexedDbTarget()
    const fixture = createDbFixture()
    const expected = await assembleDbData(fixture.root)

    const writer = await openDbIndexedDbBackend(target)
    try {
      const materializer = openDbMaterializationWriter(writer)
      await fixture.root.save(materializer)
      await fixture.child.save(materializer)
      await writer.flush()
    } finally {
      writer.close()
    }

    const reader = await openDbIndexedDbBackend(target)
    try {
      const normalizedExpected = normalizeDbData(expected)
      expect(await reader.readMetaRows(fixture.root.meta!.id)).toEqual(
        selectDbMetaRows(normalizedExpected, fixture.root.meta!.id),
      )
      expect(await reader.readMetaRows(fixture.child.meta!.id)).toEqual(
        selectDbMetaRows(normalizedExpected, fixture.child.meta!.id),
      )
      expect(await reader.readWimpRows(fixture.root.id)).toEqual(selectDbWimpRows(normalizedExpected, fixture.root.id))
      expect(await reader.readWimpRows(fixture.child.id)).toEqual(
        selectDbWimpRows(normalizedExpected, fixture.child.id),
      )

      await reader.setFieldValue(fixture.fields.childAlias!.id, "Alias via indexeddb")
      await reader.flush()
    } finally {
      reader.close()
    }

    const reopened = await openDbIndexedDbBackend(target)
    try {
      expect((await reopened.readFieldValue(fixture.fields.childAlias!.id))?.value).toBe("Alias via indexeddb")
      expect((await reopened.readFieldValue(fixture.fields.rootTitle!.id))?.value).toEqual(
        selectDbFieldValue(normalizeDbData(expected), fixture.fields.rootTitle!.id)?.value,
      )
    } finally {
      reopened.close()
    }
  })
})
