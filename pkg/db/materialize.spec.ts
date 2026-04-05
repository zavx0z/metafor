import { describe, expect, test } from "bun:test"
import { createDbFixture } from "fixture/db.fixture.ts"
import { normalizeDbData, readDbData } from "./backend.ts"
import { openDbMaterializationWriter } from "./materialize.ts"
import { openDbSqliteBackend } from "./sqlite.ts"
import { assembleDbData } from "fixture/dark.ts"

describe("db materialization writer", () => {
  test("сохраняет canonical relational rows по мере завершения Wimp", async () => {
    const fixture = createDbFixture()
    const backend = openDbSqliteBackend()
    const writer = openDbMaterializationWriter(backend)

    try {
      await fixture.root.save(writer)
      await fixture.child.save(writer)

      const roundTrip = readDbData(backend)
      const expected = await assembleDbData(fixture.root)

      expect(normalizeDbData(roundTrip)).toEqual(normalizeDbData(expected))
      expect(roundTrip.fieldSources.map((row) => row.childWimpFieldId).sort()).toEqual(
        [fixture.fields.childAlias!.id, fixture.fields.childItems!.id, fixture.fields.childMode!.id].sort(),
      )
    } finally {
      backend.close()
    }
  })

  test("повторное сохранение того же Wimp обновляет canonical row data без дублей", async () => {
    const fixture = createDbFixture()
    const backend = openDbSqliteBackend()
    const writer = openDbMaterializationWriter(backend)

    try {
      await fixture.root.save(writer)
      await fixture.child.save(writer)
      fixture.child.fields!.alias!.value = "Alias after resave"
      await fixture.child.save(writer)

      const roundTrip = readDbData(backend)
      expect(roundTrip.wimps).toHaveLength(2)
      expect(roundTrip.wimpFields).toHaveLength(6)
      expect(roundTrip.fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.childAlias!.id)?.value).toBe(
        "Alias after resave",
      )
      expect(roundTrip.entanglementFieldMembers).toHaveLength(6)
      expect(roundTrip.entanglements).toHaveLength(3)
      expect(roundTrip.entanglementMembers).toHaveLength(6)
      expect(roundTrip.entanglementFields.map((row) => row.fieldName).sort()).toEqual(["items", "mode", "title"])
    } finally {
      backend.close()
    }
  })

  test("saveWimpBundle требует предварительно materialized meta bundle той же меты", async () => {
    const fixture = createDbFixture()
    const backend = openDbSqliteBackend()
    const writer = openDbMaterializationWriter(backend)

    try {
      await expect(writer.saveWimpBundle(fixture.root.toDbBundle())).rejects.toThrow(
        `DB meta ${fixture.root.meta!.id} must be materialized before Wimp ${fixture.root.id}`,
      )
    } finally {
      backend.close()
    }
  })

  test("meta bundle можно сохранить до Wimp и потом адресно обновлять без полной пересборки", async () => {
    const fixture = createDbFixture()
    const backend = openDbSqliteBackend()
    const writer = openDbMaterializationWriter(backend)

    try {
      await writer.saveMetaBundle(fixture.root.toDbMetaBundle())
      await writer.saveMetaBundle(fixture.child.toDbMetaBundle())

      let roundTrip = readDbData(backend)
      expect(roundTrip.metas).toHaveLength(2)
      expect(roundTrip.wimps).toHaveLength(0)

      await writer.saveWimpBundle(fixture.root.toDbBundle())
      await writer.saveWimpBundle(fixture.child.toDbBundle())

      ;(fixture.root.meta as unknown as { name?: string }).name = "root-renamed"
      await writer.saveMetaBundle(fixture.root.toDbMetaBundle())

      roundTrip = readDbData(backend)
      expect(roundTrip.metas.find((row) => row.id === fixture.root.meta!.id)?.name).toBe("root-renamed")
      expect(roundTrip.wimps).toHaveLength(2)
      expect(roundTrip.metaFields).toHaveLength(6)
      expect(roundTrip.entanglementFields.map((row) => row.fieldName).sort()).toEqual(["items", "mode", "title"])
    } finally {
      backend.close()
    }
  })
})
