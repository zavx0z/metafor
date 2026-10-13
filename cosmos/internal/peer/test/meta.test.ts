import "@metafor/dsl"
import {expect, test} from "bun:test"
import meta from "@internal/peer/meta"

test("root export is the same Meta declaration and creates no transport factory", async () => {
  expect((await import("@internal/peer")).default).toBe(meta)
})

test("network Meta declares ordinary correlated inputs and real public Process wrappers without secret Fields", () => {
  expect(meta.fields.map(field => field.key)).toEqual(["request", "requestId", "ack", "ackId", "status", "error", "role", "oracleReady", "oracleError"])
  expect(meta.fields.every(field => field.type === "string" || field.type === "boolean")).toBeTrue()
  expect(meta.mass).toEqual([{key: "configuration", format: "directory"}])
  const fields = new Set(meta.fields.map(field => field.key))
  const actions = meta.processes?.filter(process => process.declaration.type === "action") ?? []
  expect(actions).toHaveLength(3)
  for (const process of actions) {
    if (process.declaration.type !== "action") throw new Error("Expected action declaration")
    expect(process.declaration.action.read).toContain("requestId")
    expect(process.declaration.action.read?.every(field => fields.has(field))).toBeTrue()
    expect(process.declaration.action.src).toBe(process.key === "starting" ? "@internal/network-start" : process.key === "preparing" ? "@internal/network-provision" : "@internal/network-stop")
  }
  const destroy = meta.processes?.find(process => process.declaration.type === "finally")
  expect(destroy?.key).toBe("stopped")
  expect(meta.processes?.some(process => process.key === "running")).toBeFalse()
  const bytes = JSON.stringify(meta)
  expect(bytes).not.toContain("tokenFile")
  expect(bytes).not.toContain("COSMOS_NODE_CONFIG")
  expect(bytes).not.toContain("network:")
})
