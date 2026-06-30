import {describe, expect, test} from "bun:test"
import type {BoundaryBulkRuntimeSnapshot} from "boundary"
import {buildBoundaryBulkManifest} from "./world.ts"

const SRC = "zavx0z/linux"

const createSnapshot = (): BoundaryBulkRuntimeSnapshot => ({
	version: 1,
	actors: [
		{id: 17, parentActor: null, parentTopology: null, wimp: SRC, position: 0},
	],
	topologies: [],
	wimps: [{src: SRC, name: "Full screen"}],
	fields: [
		{id: 2, wimp: SRC, key: "title", type: "string", label: "Title"},
	],
	fieldEnumVariants: [],
	actorValues: [],
	values: [],
	valueItems: [],
	matterParticles: [],
	matterTopologyBindingPaths: [],
	matterChildWimpBindingPaths: [],
})

describe("app/web мост Boundary -> Bulk manifest", () => {
	test("передаёт Boundary field ID отдельно от Bulk field particle ID", () => {
		const manifest = buildBoundaryBulkManifest(createSnapshot(), SRC)
		const fieldParticle = manifest.fieldParticles[0]

		expect(fieldParticle).toBeDefined()
		expect(fieldParticle?.fieldId).toBe(2)
		expect(fieldParticle?.fieldKey).toBe("title")
		expect(fieldParticle?.fieldParticleId).not.toBe(fieldParticle?.fieldId)
	})
})
