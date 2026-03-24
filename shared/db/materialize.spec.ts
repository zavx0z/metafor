import { describe, expect, test } from "bun:test"
import { assembleSharedDbData } from "../../dark/db.ts"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import { openSharedDbMemoryBackend } from "./memory.ts"
import { normalizeSharedDbData, readSharedDbData } from "./backend.ts"
import { createSharedDbDataFromWimpBundles, openSharedDbMaterializationWriter } from "./materialize.ts"

describe("shared db materialization writer", () => {
  test("сохраняет canonical relational snapshot по мере завершения Wimp", () => {
    const fixture = createSharedDbFixture()
    const backend = openSharedDbMemoryBackend()
    const writer = openSharedDbMaterializationWriter(backend)

    try {
      fixture.root.save(writer)
      fixture.child.save(writer)

      const roundTrip = readSharedDbData(backend)
      const expected = createSharedDbDataFromWimpBundles([
        fixture.root.toSharedDbBundle(),
        fixture.child.toSharedDbBundle(),
      ])

      expect(normalizeSharedDbData(roundTrip)).toEqual(normalizeSharedDbData(expected))
      expect(roundTrip.fieldSources.map((row) => row.childWimpFieldId).sort()).toEqual(
        [fixture.fields.childAlias.id, fixture.fields.childItems.id, fixture.fields.childMode.id].sort(),
      )
    } finally {
      backend.close()
    }
  })

  test("повторное сохранение того же Wimp обновляет canonical row data без дублей", () => {
    const fixture = createSharedDbFixture()
    const backend = openSharedDbMemoryBackend()
    const writer = openSharedDbMaterializationWriter(backend)

    try {
      fixture.root.save(writer)
      fixture.child.save(writer)
      fixture.child.fields.alias.value = "Alias after resave"
      fixture.child.save(writer)

      const roundTrip = readSharedDbData(backend)
      expect(roundTrip.wimps).toHaveLength(2)
      expect(roundTrip.wimpFields).toHaveLength(6)
      expect(roundTrip.fieldValues.find((row) => row.ownerWimpFieldId === fixture.fields.childAlias.id)?.value).toBe(
        "Alias after resave",
      )
      expect(roundTrip.entanglementFieldMembers).toHaveLength(6)
      expect(normalizeSharedDbData(roundTrip)).toEqual(normalizeSharedDbData(assembleSharedDbData(fixture.root)))
    } finally {
      backend.close()
    }
  })
})
