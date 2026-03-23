import { describe, expect, test } from "bun:test"
import { assembleSharedDbProjection } from "../../dark/db.ts"
import { createSharedDbFixture } from "../../dark/db.fixture.ts"
import { prepareSharedDbTabularData, readSharedDbProjection, sharedDbRequiredBackendIndexes } from "./backend.ts"
import type { SharedDbBackend } from "./backend.t.ts"

/**
 * Регистрирует общий contract suite для любого shared/db backend.
 *
 * @param name Имя backend-реализации в describe-блоке.
 * @param openBackend Фабрика backend-handle.
 */
export const describeSharedDbBackendContract = (
  name: string,
  openBackend: () => SharedDbBackend,
): void => {
  describe(name, () => {
    test("поддерживает запись проекции и все обязательные lookup-операции", () => {
      const fixture = createSharedDbFixture()
      const projection = assembleSharedDbProjection(fixture.root)
      const backend = openBackend()

      try {
        backend.writeProjection(projection)

        expect(backend.requiredIndexes).toEqual(sharedDbRequiredBackendIndexes)
        expect(backend.getRootBraneIndex()).toBe(0)
        expect(backend.getBrane(1)?.darkWimpId).toBe(fixture.child.id)
        expect(backend.getBraneByDarkId(fixture.root.id)?.fieldCount).toBe(3)
        expect(backend.getField(3)?.darkFieldId).toBe(fixture.fields.childAlias.id)
        expect(backend.getFieldByDarkId(fixture.fields.rootTitle.id)?.ownerBraneIndex).toBe(0)
        expect(backend.getFieldByKey(1, "alias")?.darkFieldId).toBe(fixture.fields.childAlias.id)
        expect(backend.getFieldValue(3)?.value).toBe("Root title")
        expect(backend.getFieldSource(3)).toEqual({ childFieldIndex: 3, parentFieldIndex: 0 })
        expect(backend.getDependentFields(0).map((field) => field.darkFieldId)).toEqual([fixture.fields.childAlias.id])
      } finally {
        backend.close()
      }
    })

    test("поддерживает replace/reset и минимальное обновление значения поля", () => {
      const fixture = createSharedDbFixture()
      const projection = assembleSharedDbProjection(fixture.root)
      const backend = openBackend()

      try {
        backend.replaceData(prepareSharedDbTabularData(projection))
        backend.setFieldValue(3, "Child override")
        expect(backend.getFieldValue(3)?.value).toBe("Child override")

        const roundTrip = readSharedDbProjection(backend)
        expect(prepareSharedDbTabularData(roundTrip)).toEqual({
          ...prepareSharedDbTabularData(projection),
          fieldValues: prepareSharedDbTabularData(projection).fieldValues.map((fieldValue, fieldIndex) =>
            fieldIndex === 3 ? { fieldIndex, value: "Child override" } : fieldValue,
          ),
        })

        backend.reset()
        expect(backend.getBrane(0)).toBeUndefined()
        expect(backend.getField(0)).toBeUndefined()
        expect(backend.getFieldValue(0)).toBeUndefined()
      } finally {
        backend.close()
      }
    })
  })
}
