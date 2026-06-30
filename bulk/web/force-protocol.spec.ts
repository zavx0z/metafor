import { describe, expect, test } from "bun:test"
import { resolveForceFieldId, resolveForceFieldsPayload } from "./force-protocol"

describe("bulk/web Force protocol adapter", () => {
	test("accepts protocol field patches from value.fields", () => {
		const fields = {"1": {type: "string", label: "Title"}}

		expect(resolveForceFieldsPayload({fields})).toBe(fields)
	})

	test("does not accept Bulk manifest vocabulary as Force payload shape", () => {
		expect(resolveForceFieldsPayload({
			fieldParticles: {title: {type: "string", label: "Title"}},
		})).toBeNull()
	})

	test("normalizes positive numeric field IDs", () => {
		expect(resolveForceFieldId("1")).toBe(1)
		expect(resolveForceFieldId("42")).toBe(42)
	})

	test("rejects keys and non-positive addresses as field IDs", () => {
		expect(resolveForceFieldId("method")).toBeNull()
		expect(resolveForceFieldId("field-1")).toBeNull()
		expect(resolveForceFieldId("")).toBeNull()
		expect(resolveForceFieldId("0")).toBeNull()
		expect(resolveForceFieldId("-1")).toBeNull()
	})
})
