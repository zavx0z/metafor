import { describe, expect, test } from "bun:test"
import { resolveForceFieldsPayload } from "./force-protocol"

describe("bulk/web Force protocol adapter", () => {
	test("accepts protocol field patches from value.fields", () => {
		const fields = {title: {type: "string", label: "Title"}}

		expect(resolveForceFieldsPayload({fields})).toBe(fields)
	})

	test("does not accept Bulk manifest vocabulary as Force payload shape", () => {
		expect(resolveForceFieldsPayload({
			fieldParticles: {title: {type: "string", label: "Title"}},
		})).toBeNull()
	})
})
