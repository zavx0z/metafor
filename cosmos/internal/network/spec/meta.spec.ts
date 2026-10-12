import "@metafor/dsl"
import {expect, test} from "bun:test"
import meta from "@internal/network/meta"
import * as root from "@internal/network"

test("device network composition has one Meta entry and only its declared network participant", () => {
  expect(Object.keys(root)).toEqual(["default"])
  expect(root.default).toBe(meta)
  expect(meta.lifecycle).toEqual({started: {field: "input", value: "started"}, stopping: {field: "input", value: "stopping"}})
  expect(meta.fields.find(field => field.key === "prepareOnBirth")?.type).toBe("boolean")
  expect(meta.matter?.filter(node => node.kind === "wimp").map(node => node.src)).toEqual(["@internal/peer"])
  expect(JSON.stringify(meta).toLowerCase()).not.toContain("capsule")
})
