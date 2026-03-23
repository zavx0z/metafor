import { describe, expect, test } from "bun:test"
import type { SharedDbProjection } from "./db.t.ts"
import {
  getSharedDbBraneByDarkId,
  getSharedDbBraneByIndex,
  getSharedDbBraneFields,
  getSharedDbDependentFields,
  getSharedDbFieldByDarkId,
  getSharedDbFieldByKey,
  getSharedDbFieldSource,
  getSharedDbFieldValue,
} from "./index.ts"

const createProjection = (): SharedDbProjection => {
  const branes = [
    { index: 0, darkWimpId: "root", src: "meta/root", name: "root", fieldOffset: 0, fieldCount: 3 },
    { index: 1, darkWimpId: "child", src: "meta/child", name: "child", fieldOffset: 3, fieldCount: 3 },
  ] as SharedDbProjection["branes"]

  const fields = [
    {
      index: 0,
      darkFieldId: "root-title",
      ownerBraneIndex: 0,
      key: "title",
      schema: { type: "string", required: true, topology: false, label: "Заголовок" },
    },
    {
      index: 1,
      darkFieldId: "root-mode",
      ownerBraneIndex: 0,
      key: "mode",
      schema: { type: "enum<string>", required: true, topology: true, values: ["idle", "ready"] },
    },
    {
      index: 2,
      darkFieldId: "root-items",
      ownerBraneIndex: 0,
      key: "items",
      schema: { type: "array<string>", required: true, topology: true, values: [] },
    },
    {
      index: 3,
      darkFieldId: "child-alias",
      ownerBraneIndex: 1,
      key: "alias",
      schema: { type: "string", required: true, topology: false },
    },
    {
      index: 4,
      darkFieldId: "child-mode",
      ownerBraneIndex: 1,
      key: "mode",
      schema: { type: "enum<string>", required: true, topology: true, values: ["idle", "ready"] },
    },
    {
      index: 5,
      darkFieldId: "child-items",
      ownerBraneIndex: 1,
      key: "items",
      schema: { type: "array<string>", required: true, topology: true, values: [] },
    },
  ] as SharedDbProjection["fields"]

  return {
    rootBraneIndex: 0,
    branes,
    fields,
    fieldValues: [
      { fieldIndex: 0, value: "Root title" },
      { fieldIndex: 1, value: "idle" },
      { fieldIndex: 2, value: ["a", "b"] },
      { fieldIndex: 3, value: "Root title" },
      { fieldIndex: 4, value: "idle" },
      { fieldIndex: 5, value: ["a", "b"] },
    ],
    fieldSources: [{ childFieldIndex: 3, parentFieldIndex: 0 }],
    braneIndexByDarkId: new Map([
      ["root", 0],
      ["child", 1],
    ]),
    fieldIndexByDarkId: new Map([
      ["root-title", 0],
      ["root-mode", 1],
      ["root-items", 2],
      ["child-alias", 3],
      ["child-mode", 4],
      ["child-items", 5],
    ]),
    fieldIndexByBraneAndKey: new Map([
      [0, new Map([["title", 0], ["mode", 1], ["items", 2]])],
      [1, new Map([["alias", 3], ["mode", 4], ["items", 5]])],
    ]),
    fieldSourceByChildFieldIndex: [undefined, undefined, undefined, { childFieldIndex: 3, parentFieldIndex: 0 }],
    dependentFieldIndexesByParentFieldIndex: new Map([[0, [3]]]),
  }
}

describe("shared db helper api", () => {
  test("читает brane и field записи по индексам и ключам", () => {
    const projection = createProjection()

    expect(getSharedDbBraneByIndex(projection, 1)?.darkWimpId).toBe("child")
    expect(getSharedDbBraneByDarkId(projection, "root")?.index).toBe(0)
    expect(getSharedDbBraneFields(projection, 0).map((field) => field.key)).toEqual(["title", "mode", "items"])
    expect(getSharedDbFieldByDarkId(projection, "child-alias")?.ownerBraneIndex).toBe(1)
    expect(getSharedDbFieldByKey(projection, 1, "alias")?.darkFieldId).toBe("child-alias")
    expect(getSharedDbFieldValue(projection, 3)?.value).toBe("Root title")
  })

  test("читает ordinary source-links и обратные зависимости без обхода графа", () => {
    const projection = createProjection()

    expect(getSharedDbFieldSource(projection, 3)).toEqual({ childFieldIndex: 3, parentFieldIndex: 0 })
    expect(getSharedDbFieldSource(projection, 4)).toBeUndefined()
    expect(getSharedDbFieldSource(projection, 5)).toBeUndefined()
    expect(getSharedDbDependentFields(projection, 0).map((field) => field.darkFieldId)).toEqual(["child-alias"])
  })
})
