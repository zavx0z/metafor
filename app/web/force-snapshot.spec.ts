import {describe, expect, test} from "bun:test"
import type {BoundaryBulkRuntimeSnapshot, Particle} from "boundary"
import {applyForcePartToSnapshot} from "./force-snapshot.ts"

const SRC = "zavx0z/linux"

const createSnapshot = (): BoundaryBulkRuntimeSnapshot => ({
	version: 1,
	actors: [
		{id: 17, parentActor: null, parentTopology: null, wimp: SRC, position: 0},
	],
	topologies: [],
	wimps: [{src: SRC, name: "Full screen"}],
	fields: [
		{id: 1, wimp: SRC, key: "method", type: "enum", label: "Метод"},
		{id: 2, wimp: SRC, key: "title", type: "string", label: "Title"},
	],
	fieldEnumVariants: [
		{id: 1, field: 1, position: 0, itemValue: "native"},
		{id: 2, field: 1, position: 1, itemValue: "css"},
	],
	actorValues: [],
	values: [],
	valueItems: [],
	matterParticles: [],
	matterTopologyBindingPaths: [],
	matterChildWimpBindingPaths: [],
})

describe("app/web нормализатор Force snapshot", () => {
	test("higgs-патч класса адресует field по ID и обновляет key как метаданные", () => {
		const snapshot = createSnapshot()
		const part: Particle = {
			part: "higgs",
			op: "replace",
			path: SRC,
			value: {
				fields: {
					"1": {
						key: "mode",
						type: "enum",
						values: ["native", "css", "screenfull"],
						label: "Режим",
					},
				},
			},
		}

		expect(applyForcePartToSnapshot(snapshot, part)).toBe("partial")
		expect(snapshot.fields.find((field) => field.id === 1)).toMatchObject({
			id: 1,
			wimp: SRC,
			key: "mode",
			type: "enum",
			label: "Режим",
		})
		expect(snapshot.fieldEnumVariants.filter((variant) => variant.field === 1).map((variant) => variant.itemValue)).toEqual([
			"native",
			"css",
			"screenfull",
		])
	})

	test("higgs-патч класса создаёт новое поле с ID из value.fields", () => {
		const snapshot = createSnapshot()
		const part: Particle = {
			part: "higgs",
			op: "replace",
			path: SRC,
			value: {
				fields: {
					"3": {key: "status", type: "string", label: "Статус"},
				},
			},
		}

		expect(applyForcePartToSnapshot(snapshot, part)).toBe("rebuild")
		expect(snapshot.fields.find((field) => field.id === 3)).toMatchObject({
			id: 3,
			wimp: SRC,
			key: "status",
			type: "string",
			label: "Статус",
		})
	})

	test("key не является каноническим адресом для higgs-патча", () => {
		const snapshot = createSnapshot()
		const part: Particle = {
			part: "higgs",
			op: "replace",
			path: SRC,
			value: {
				fields: {
					method: {key: "mode"},
				},
			},
		}

		expect(applyForcePartToSnapshot(snapshot, part)).toBe("none")
		expect(snapshot.fields.find((field) => field.id === 1)?.key).toBe("method")
	})

	test("gluon-патч экземпляра адресует value по области actor и field ID", () => {
		const snapshot = createSnapshot()
		const part: Particle = {
			part: "gluon",
			op: "replace",
			path: 17,
			value: {
				fields: {
					"2": "request failed",
				},
			},
		}

		expect(applyForcePartToSnapshot(snapshot, part)).toBe("partial")
		expect(snapshot.actorValues).toEqual([{actor: 17, field: 2, value: 1}])
		expect(snapshot.values).toMatchObject([
			{id: 1, kind: "string", textValue: "request failed"},
		])
	})

	test("key не является каноническим адресом для gluon-патча", () => {
		const snapshot = createSnapshot()
		const part: Particle = {
			part: "gluon",
			op: "replace",
			path: 17,
			value: {
				fields: {
					title: "request failed",
				},
			},
		}

		expect(applyForcePartToSnapshot(snapshot, part)).toBe("none")
		expect(snapshot.actorValues).toEqual([])
	})

	test("числовой адрес не является порядковым номером с единицы", () => {
		const snapshot = createSnapshot()
		snapshot.fields = [
			{id: 10, wimp: SRC, key: "first", type: "string", label: "First"},
			{id: 20, wimp: SRC, key: "second", type: "string", label: "Second"},
		]
		const part: Particle = {
			part: "gluon",
			op: "replace",
			path: 17,
			value: {
				fields: {
					"1": "не должно попасть в первое поле",
				},
			},
		}

		expect(applyForcePartToSnapshot(snapshot, part)).toBe("none")
		expect(snapshot.actorValues).toEqual([])
	})
})
