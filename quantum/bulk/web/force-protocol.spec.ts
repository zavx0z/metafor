import { describe, expect, test } from "bun:test"
import { materializedRootSrc, observedRootSrc, resolveForceFieldId, resolveForceFieldsPayload, resolveForceImpulseRadius, resolveForceImpulseTiming, resolveForceImpulseVisual } from "./force-protocol"

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

	test("derives the agent, Dark and Boundary stages from the same minimal Particle fields", () => {
		const ts = 1_700_000_000_000
		const agent = resolveForceImpulseVisual({part: "inflaton", op: "add", path: "wimp", by: "agent", ts, value: {src: "capsule", name: "Capsule"}})
		const dark = resolveForceImpulseVisual({part: "inflaton", op: "add", path: "wimp", by: "dark", ts, value: {src: "capsule", name: "Capsule"}})
		const boundary = resolveForceImpulseVisual({part: "graviton", op: "add", path: "atom/7", by: "boundary", ts, value: {atom: {id: 7, wimp: "capsule"}}})

		expect(agent.targetOffset).toEqual(dark.startOffset)
		expect(dark.targetOffset).toEqual([0, 0, 0])
		expect(boundary.targetOffset).toEqual([0, 0, 0])
		expect(agent.color).toEqual(dark.color)
		expect(boundary.color).not.toEqual(dark.color)
	})

	test("continues only an active phase and never replays a completed Particle", () => {
		const part = {part: "inflaton", op: "add", path: "wimp", by: "dark", ts: 1_000, value: {src: "capsule", name: "Capsule"}} as const
		expect(resolveForceImpulseTiming(part, 1_000)).toEqual({elapsedMs: -120, remainingMs: 840})
		expect(resolveForceImpulseTiming(part, 1_220)).toEqual({elapsedMs: 100, remainingMs: 620})
		expect(resolveForceImpulseTiming(part, 1_840)).toBeNull()
	})

	test("scales a transient to the manifested target instead of a fixed tiny radius", () => {
		expect(resolveForceImpulseRadius(50)).toBe(6)
		expect(resolveForceImpulseRadius(1_000)).toBe(20)
		expect(resolveForceImpulseRadius(Number.NaN)).toBe(2)
	})

	test("selects only a newly materialized root Atom as the next observed scene", () => {
		expect(materializedRootSrc({
			part: "graviton",
			op: "add",
			path: "atom/7",
			by: "boundary",
			ts: 1,
			value: {atom: {id: 7, wimp: "capsule", parentAtom: null, parentTopology: null}},
		})).toBe("capsule")
		expect(materializedRootSrc({
			part: "graviton",
			op: "add",
			path: "atom/8",
			by: "boundary",
			ts: 1,
			value: {atom: {id: 8, wimp: "child", parentAtom: 7, parentTopology: null}},
		})).toBeNull()
		expect(materializedRootSrc({
			part: "graviton",
			op: "replace",
			path: "atom/2",
			by: "boundary",
			ts: 2,
			value: {atom: {id: 2, wimp: "zavx0z/lada", parentAtom: null, parentTopology: null}},
		})).toBe("zavx0z/lada")
		expect(observedRootSrc({
			part: "graviton",
			op: "add",
			path: "wimp",
			by: "boundary",
			ts: 2,
			value: {src: "capsule", name: "Capsule"},
		}, new Set(["capsule"]))).toBe("capsule")
	})
})
