import {describe, expect, test} from "bun:test"
import type { BulkRuntimeProjection } from "@metafor/types/bulk/runtime"
import {buildBoundaryBulkManifest} from "./world.ts"

const SRC = "owner/project"

const createProjection = (): BulkRuntimeProjection => ({
	atoms: [
		{id: 17, parentAtom: null, parentTopology: null, wimp: SRC, position: 0},
	],
	topologies: [],
	wimps: [{src: SRC, name: "Full screen"}],
	fields: [
		{id: 2, wimp: SRC, key: "title", type: "string", label: "Title"},
	],
	states: [],
	transitions: [],
	conditions: [],
	processes: [],
	reactions: [],
	atomStates: [],
	fieldEnumVariants: [],
	atomValues: [],
	values: [],
	valueItems: [],
	matterParticles: [],
	matterTopologyBindingPaths: [],
	matterChildWimpBindingPaths: [],
})

describe("bulk мост Boundary -> Bulk manifest", () => {
	test("передаёт Boundary field ID отдельно от Bulk field particle ID", () => {
		const manifest = buildBoundaryBulkManifest(createProjection(), SRC)
		const fieldParticle = manifest.fieldParticles[0]

		expect(manifest.darkParticles[0]).toMatchObject({
			darkParticleKind: "atom",
			src: SRC,
			metaSrc: SRC,
		})
		expect(fieldParticle).toBeDefined()
		expect(fieldParticle?.fieldId).toBe(2)
		expect(fieldParticle?.fieldKey).toBe("title")
		expect(fieldParticle?.fieldParticleId).not.toBe(fieldParticle?.fieldId)
	})

	test("keeps topology Fields in the nucleus and manifests State sleeves from declarations", () => {
		const projection = createProjection()
		projection.fields.push(
			{id: 3, wimp: SRC, key: "mode", type: "enum", label: "Mode"},
			{id: 4, wimp: SRC, key: "items", type: "array", label: "Items"},
		)
		projection.states.push(
			{id: 21, wimp: SRC, name: "idle", position: 0},
			{id: 22, wimp: SRC, name: "ready", position: 1},
		)
		projection.transitions.push({id: 31, wimp: SRC, fromState: 21, toState: 22, position: 0})
		projection.conditions.push({id: 41, wimp: SRC, transition: 31, field: 2, position: 0, predicate: {eq: "go"}})
		projection.atomStates.push({atom: 17, state: 21})

		const manifest = buildBoundaryBulkManifest(projection, SRC)

		expect(manifest.fieldParticles.map((field) => field.fieldParticleKind)).toContain("enum")
		expect(manifest.fieldParticles.map((field) => field.fieldParticleKind)).toContain("array")
		expect(manifest.orbitalParticles?.filter((particle) => particle.orbitalParticleKind === "state").length).toBe(3)
		const stateParticles = manifest.orbitalParticles?.filter((particle) => particle.orbitalParticleKind === "state") ?? []
		const fieldRadius = manifest.fieldParticles[0]?.sphereRadius ?? 0
		expect(stateParticles.every((particle) => particle.sphereRadius <= fieldRadius)).toBe(true)
		expect(stateParticles.some((particle) => particle.sphereRadius < fieldRadius)).toBe(true)
		expect(manifest.orbitalParticles?.some((particle) => particle.sourceId === 21 && particle.current)).toBe(true)
		expect(manifest.transitionChannels?.some((channel) => channel.sourceId === 31 && channel.conditionFieldIds[0] === 2)).toBe(true)
	})

	test("строит сцену только из выбранного root WIMP и его реальных descendants", () => {
		const projection = createProjection()
		projection.wimps.push(
			{src: "owner/project/tree", name: "Git tree"},
			{src: "zavx0z/other", name: "Other root"},
		)
		projection.atoms.push(
			{id: 18, parentAtom: 17, parentTopology: null, wimp: "owner/project/tree", position: 0},
			{id: 99, parentAtom: null, parentTopology: null, wimp: "zavx0z/other", position: 1},
		)
		projection.topologies.push({id: 77, parentAtom: null, parentTopology: null, kind: "macho", position: 0})

		const manifest = buildBoundaryBulkManifest(projection, SRC)

		expect(manifest.darkParticles.map((particle) => particle.src)).toEqual([SRC, "owner/project/tree"])
		expect(manifest.darkParticles.some((particle) => particle.darkParticleId === 99 * 2)).toBe(false)
		expect(manifest.darkParticles.some((particle) => particle.darkParticleId === 77 * 2 + 1)).toBe(false)
	})

	test("не подменяет отсутствующий requested root посторонними root-сценами", () => {
		const manifest = buildBoundaryBulkManifest(createProjection(), "zavx0z/missing")

		expect(manifest.rootSrc).toBe("zavx0z/missing")
		expect(manifest.darkParticles).toEqual([])
		expect(manifest.fieldParticles).toEqual([])
	})

	test("именует Fuzzy по enum-протону, а state Axion проявляет одной орбитальной частицей", () => {
		const projection = createProjection()
		projection.fields.push(
			{id: 3, wimp: SRC, key: "mode", type: "enum", label: "Режим"},
			{id: 4, wimp: SRC, key: "error", type: "string", label: "Ошибка"},
		)
		projection.states.push({id: 21, wimp: SRC, name: "ошибка", position: 0})
		projection.topologies.push(
			{id: 51, parentAtom: 17, parentTopology: null, kind: "fuzzy", position: 0},
			{id: 52, parentAtom: 17, parentTopology: null, kind: "axion", position: 1},
		)
		projection.matterParticles.push(
			{id: 61, wimp: SRC, parentParticle: null, particleKind: "fuzzy", edgeSlot: "root", particleOrder: 0},
			{
				id: 62,
				wimp: SRC,
				parentParticle: null,
				particleKind: "axion",
				edgeSlot: "root",
				particleOrder: 1,
				predicateBinding: {data: "/state", expr: 'data === "\\u043e\\u0448\\u0438\\u0431\\u043a\\u0430"'},
			},
			{
				id: 63,
				wimp: SRC,
				parentParticle: 62,
				particleKind: "wimp",
				edgeSlot: "child",
				particleOrder: 0,
				fieldsBinding: {data: "error", expr: "{ message: _[0] }"},
			},
		)
		projection.matterTopologyBindingPaths.push({wimp: SRC, particle: 61, depOrder: 0, path: "mode"})

		const manifest = buildBoundaryBulkManifest(projection, SRC)
		const fuzzy = manifest.darkParticles.find((particle) => particle.darkParticleKind === "fuzzy")
		const axionAnchor = manifest.darkParticles.find((particle) => particle.darkParticleKind === "axion")
		const axions = manifest.orbitalParticles?.filter((particle) => particle.orbitalParticleKind === "axion") ?? []

		expect(fuzzy?.label).toBe("Режим")
		expect(axionAnchor?.label).toBe("Axion · ошибка")
		expect(axions).toHaveLength(1)
		expect(axions[0]?.label).toBe("Axion · ошибка")
		expect(axions[0]?.relatedStateIds).toEqual([21])
		expect(manifest.relationChannels?.some((channel) =>
			channel.relationKind === "axion-read" &&
			channel.toId === axions[0]?.orbitalParticleId &&
			channel.fromKind === "field-proxy",
		)).toBe(true)
	})

	test("раскладывает ветвящиеся State-occurrences без совпадающих координат", () => {
		const projection = createProjection()
		projection.states.push(
			{id: 21, wimp: SRC, name: "a", position: 0},
			{id: 22, wimp: SRC, name: "b", position: 1},
			{id: 23, wimp: SRC, name: "c", position: 2},
			{id: 24, wimp: SRC, name: "d", position: 3},
		)
		projection.transitions.push(
			{id: 31, wimp: SRC, fromState: 21, toState: 22, position: 0},
			{id: 32, wimp: SRC, fromState: 21, toState: 23, position: 1},
			{id: 33, wimp: SRC, fromState: 22, toState: 24, position: 2},
			{id: 34, wimp: SRC, fromState: 23, toState: 24, position: 3},
			{id: 35, wimp: SRC, fromState: 24, toState: 21, position: 4},
		)

		const manifest = buildBoundaryBulkManifest(projection, SRC)
		const states = manifest.orbitalParticles?.filter((particle) => particle.orbitalParticleKind === "state") ?? []
		const positions = new Set(states.map((particle) =>
			`${particle.localX.toFixed(6)}:${particle.localY.toFixed(6)}:${particle.localZ.toFixed(6)}`,
		))

		expect(states.length).toBeGreaterThan(projection.states.length)
		expect(positions.size).toBe(states.length)
	})
})
