import { describe, expect, test } from "bun:test"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import { openSharedDbMemoryBackend } from "./memory.ts"
import { prepareSharedDbTabularData, readSharedDbProjection } from "./backend.ts"
import { createSharedDbProjectionFromWimpTraces, openSharedDbMaterializationWriter } from "./materialize.ts"

describe("shared db materialization writer", () => {
  test("сохраняет DB-shaped след fully-formed Wimp в существующую shared/db схему", () => {
    const fixture = createSharedDbFixture()
    const backend = openSharedDbMemoryBackend()
    const writer = openSharedDbMaterializationWriter(backend)

    try {
      fixture.root.save(writer)
      fixture.child.save(writer)

      const roundTrip = readSharedDbProjection(backend)
      const expected = createSharedDbProjectionFromWimpTraces([
        fixture.root.toSharedDbTrace(),
        fixture.child.toSharedDbTrace(),
      ])

      expect(prepareSharedDbTabularData(roundTrip)).toEqual(prepareSharedDbTabularData(expected))
      expect(backend.getFieldSource(3)).toEqual({ childFieldIndex: 3, parentFieldIndex: 0 })
      expect(backend.getRuntimeSeedData().stateSeedConditions.map((condition) => condition.darkFieldId)).toEqual([
        fixture.fields.rootMode.id,
        fixture.fields.childMode.id,
      ])
    } finally {
      backend.close()
    }
  })

  test("повторное сохранение того же Wimp не создаёт дублей в shared/db", () => {
    const fixture = createSharedDbFixture()
    const backend = openSharedDbMemoryBackend()
    const writer = openSharedDbMaterializationWriter(backend)

    try {
      fixture.root.save(writer)
      fixture.child.save(writer)
      fixture.child.fields.alias.value = "Alias after resave"
      fixture.child.save(writer)

      const roundTrip = readSharedDbProjection(backend)

      expect(roundTrip.branes).toHaveLength(2)
      expect(roundTrip.fields).toHaveLength(6)
      expect(roundTrip.fieldValues[3]?.value).toBe("Alias after resave")
      expect(roundTrip.entanglementFieldMembers.map((member) => member.darkFieldId)).toEqual([
        fixture.fields.rootTitle.id,
        fixture.fields.childAlias.id,
        fixture.fields.rootMode.id,
        fixture.fields.childMode.id,
        fixture.fields.rootItems.id,
        fixture.fields.childItems.id,
      ])
    } finally {
      backend.close()
    }
  })
})
