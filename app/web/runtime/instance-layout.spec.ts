import { describe, expect, test } from "bun:test"
import {
	createDbWorldSnapshotFromParticleDescriptors,
	scaleDbWorldSnapshotToRootOuterDiameter,
	type DbWorldParticleDescriptor,
} from "./instance-layout.ts"
import { appWebLayoutConfig } from "../settings.ts"

const createField = (id: string) => ({
	id,
	fieldKey: id,
	fieldLabel: id,
	fieldValueKind: "text" as const,
	valueText: id,
	colorR: 1,
	colorG: 1,
	colorB: 1,
})

const createParticle = (
	particleId: string,
	children: DbWorldParticleDescriptor[] = [],
	fieldIds: string[] = [],
): DbWorldParticleDescriptor => ({
	particleId,
	kind: "wimp",
	src: particleId,
	metaSrc: particleId,
	label: particleId,
	colorR: 0.4,
	colorG: 0.45,
	colorB: 0.98,
	fields: fieldIds.map(createField),
	children,
})

describe("app/web instance layout", () => {
	test("строит planar nested layout top-down в мм и фиксирует deepest sphere radius в 50 мм", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [
				createParticle("child", [
					createParticle("leaf", [], ["leaf-field"]),
				], ["child-field"]),
			], ["root-field"]),
		])

		const particlesById = new Map(snapshot.particles.map((particle) => [particle.particleId, particle]))
		const fieldsById = new Map(snapshot.fields.map((field) => [field.id, field]))

		const root = particlesById.get("root")
		const child = particlesById.get("child")
		const leaf = particlesById.get("leaf")
		const rootField = fieldsById.get("root-field")
		const childField = fieldsById.get("child-field")
		const leafField = fieldsById.get("leaf-field")

		expect(root).toBeDefined()
		expect(child).toBeDefined()
		expect(leaf).toBeDefined()
		expect(rootField).toBeDefined()
		expect(childField).toBeDefined()
		expect(leafField).toBeDefined()

		expect((root?.shellRadius ?? 0) + (root?.shellTube ?? 0)).toBeGreaterThan(
			(child?.shellRadius ?? 0) + (child?.shellTube ?? 0),
		)
		expect((child?.shellRadius ?? 0) + (child?.shellTube ?? 0)).toBeGreaterThan(
			(leaf?.shellRadius ?? 0) + (leaf?.shellTube ?? 0),
		)
		expect(rootField?.sphereRadius).toBeGreaterThan(childField?.sphereRadius ?? 0)
		expect(childField?.sphereRadius).toBeGreaterThan(leafField?.sphereRadius ?? 0)
		expect(snapshot.fields.every((field) => field.localZ === 0)).toBe(true)
		expect(snapshot.particles.every((particle) => particle.localZ === 0)).toBe(true)
		expect(Math.hypot(leafField?.localX ?? 0, leafField?.localY ?? 0)).toBeGreaterThan(0)
	})

	test("увеличивает raw parent torus когда children и orbit rings не помещаются", () => {
		const compact = createDbWorldSnapshotFromParticleDescriptors("compact", [
			createParticle("root", [createParticle("child-a", [], ["leaf-a"])], []),
		])
		const expanded = createDbWorldSnapshotFromParticleDescriptors("expanded", [
			createParticle("root", [
				createParticle("child-a", [], ["leaf-a"]),
				createParticle("child-b", [], ["leaf-b"]),
				createParticle("child-c", [], ["leaf-c"]),
				createParticle("child-d", [], ["leaf-d"]),
				createParticle("child-e", [], ["leaf-e"]),
				createParticle("child-f", [], ["leaf-f"]),
				createParticle("child-g", [], ["leaf-g"]),
				createParticle("child-h", [], ["leaf-h"]),
				createParticle("child-i", [], ["leaf-i"]),
				createParticle("child-j", [], ["leaf-j"]),
				createParticle("child-k", [], ["leaf-k"]),
				createParticle("child-l", [], ["leaf-l"]),
			], []),
		])

		const compactRoot = compact.particles.find((particle) => particle.particleId === "root")
		const expandedRoot = expanded.particles.find((particle) => particle.particleId === "root")

		expect(compactRoot).toBeDefined()
		expect(expandedRoot).toBeDefined()
		expect((expandedRoot?.shellRadius ?? 0) + (expandedRoot?.shellTube ?? 0)).toBeGreaterThan(
			(compactRoot?.shellRadius ?? 0) + (compactRoot?.shellTube ?? 0),
		)
	})

	test("одна орбита распределяется по центру доступной толщины тора", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [], ["field-a", "field-b", "field-c"]),
		])

		const root = snapshot.particles.find((particle) => particle.particleId === "root")
		const fields = snapshot.fields.filter((field) => field.particleId === "root")

		expect(root).toBeDefined()
		expect(fields.length).toBe(3)

		const innerRadius = (root?.shellRadius ?? 0) - (root?.shellTube ?? 0)
		const ringRadius = Math.hypot(fields[0]?.localX ?? 0, fields[0]?.localY ?? 0)
		const outerRadius = (root?.shellRadius ?? 0) + (root?.shellTube ?? 0)
		expect(ringRadius).toBeCloseTo((innerRadius + outerRadius) / 2, 6)
	})

	test("несколько орбит распределяются равномерными зазорами по толщине тора", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [], [
				"f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10",
				"f11", "f12", "f13", "f14", "f15", "f16", "f17", "f18", "f19", "f20",
				"f21", "f22", "f23", "f24", "f25", "f26", "f27", "f28", "f29", "f30",
				"f31", "f32", "f33", "f34", "f35", "f36", "f37", "f38", "f39", "f40",
			]),
		], { rootSphereRadiusMm: 1200 })

		const fields = snapshot.fields
			.filter((field) => field.particleId === "root")
			.map((field) => ({
				radius: Math.hypot(field.localX, field.localY),
				extent: field.sphereRadius,
			}))
			.sort((left, right) => left.radius - right.radius)

		const uniqueRings = [...new Set(fields.map((field) => field.radius.toFixed(6)))]
		expect(uniqueRings.length).toBeGreaterThan(1)

		const root = snapshot.particles.find((particle) => particle.particleId === "root")
		expect(root).toBeDefined()
		const innerRadius = (root?.shellRadius ?? 0) - (root?.shellTube ?? 0)
		const outerRadius = (root?.shellRadius ?? 0) + (root?.shellTube ?? 0)
		const firstRingRadius = Number(uniqueRings[0]!)
		const secondRingRadius = Number(uniqueRings[1]!)
		const firstRingExtent = fields.find((field) => field.radius.toFixed(6) === uniqueRings[0])?.extent ?? 0
		const secondRingExtent = fields.find((field) => field.radius.toFixed(6) === uniqueRings[1])?.extent ?? 0
		const lastRingRadius = Number(uniqueRings[uniqueRings.length - 1]!)
		const lastRingExtent =
			fields.find((field) => field.radius.toFixed(6) === uniqueRings[uniqueRings.length - 1])?.extent ?? 0

		const innerGap = firstRingRadius - firstRingExtent - innerRadius
		const middleGap = secondRingRadius - secondRingExtent - (firstRingRadius + firstRingExtent)
		const outerGap = outerRadius - (lastRingRadius + lastRingExtent)

		expect(innerGap).toBeCloseTo(middleGap, 5)
		expect(innerGap).toBeCloseTo(outerGap, 5)
	})

	test("уважает корневой внутренний диаметр тора в мм", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors(
			"root",
			[createParticle("root", [], ["field-a"])],
			{ rootInnerDiameterMm: 1800 },
		)

		const root = snapshot.particles.find((particle) => particle.particleId === "root")
		expect(root).toBeDefined()

		const innerRadius = (root?.shellRadius ?? 0) - (root?.shellTube ?? 0)
		expect(innerRadius * 2).toBeCloseTo(1800, 6)
	})

	test("сдвигает первую орбиту при увеличении root inner diameter", () => {
		const compact = createDbWorldSnapshotFromParticleDescriptors(
			"root",
			[createParticle("root", [], ["field-a", "field-b", "field-c", "field-d"])],
			{ rootInnerDiameterMm: 800 },
		)
		const wide = createDbWorldSnapshotFromParticleDescriptors(
			"root",
			[createParticle("root", [], ["field-a", "field-b", "field-c", "field-d"])],
			{ rootInnerDiameterMm: 1800 },
		)

		const compactField = compact.fields.find((field) => field.id === "field-a")
		const wideField = wide.fields.find((field) => field.id === "field-a")

		expect(compactField).toBeDefined()
		expect(wideField).toBeDefined()
		expect(Math.hypot(wideField?.localX ?? 0, wideField?.localY ?? 0)).toBeGreaterThan(
			Math.hypot(compactField?.localX ?? 0, compactField?.localY ?? 0),
		)
	})

	test("держит одинаковый размер торов на одном уровне", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [
				createParticle("child-a", [createParticle("grand-a", [], ["leaf-a"])]),
				createParticle("child-b", [], ["field-b", "field-c", "field-d", "field-e", "field-f"]),
			]),
		])

		const particlesById = new Map(snapshot.particles.map((particle) => [particle.particleId, particle]))
		const childA = particlesById.get("child-a")
		const childB = particlesById.get("child-b")

		expect(childA).toBeDefined()
		expect(childB).toBeDefined()
		expect((childA?.shellRadius ?? 0) + (childA?.shellTube ?? 0)).toBeCloseTo(
			(childB?.shellRadius ?? 0) + (childB?.shellTube ?? 0),
			6,
		)
	})

	test("уменьшает размер сфер по тем же уровням, что и torus layout", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [
				createParticle("child-a", [], ["leaf-a"]),
				createParticle("child-b", [], ["leaf-b"]),
			], ["field-a", "field-b"]),
		], { rootSphereRadiusMm: 400, levelSizeMultiplier: 2 })

		const field = snapshot.fields.find((orbit) => orbit.id === "field-a")
		const leaf = snapshot.fields.find((orbit) => orbit.id === "leaf-a")

		expect(field).toBeDefined()
		expect(leaf).toBeDefined()
		expect(field?.sphereRadius).toBeCloseTo(200, 6)
		expect(leaf?.sphereRadius).toBeCloseTo(100, 6)
	})

	test("распределяет объекты по орбитам по емкости окружности, а не фиксированными пачками", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [], [
				"f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10",
				"f11", "f12", "f13", "f14", "f15", "f16", "f17", "f18", "f19", "f20",
				"f21", "f22", "f23", "f24", "f25", "f26", "f27", "f28",
				"f29", "f30", "f31", "f32", "f33", "f34", "f35", "f36",
			]),
		], { rootSphereRadiusMm: 1200 })

		const ringCounts = [...snapshot.fields]
			.filter((field) => field.particleId === "root")
			.reduce((rings, field) => {
				const key = Math.hypot(field.localX, field.localY).toFixed(6)
				rings.set(key, (rings.get(key) ?? 0) + 1)
				return rings
			}, new Map<string, number>())

		const counts = [...ringCounts.entries()]
			.sort((left, right) => Number(left[0]) - Number(right[0]))
			.map((entry) => entry[1])

		expect(counts.length).toBeGreaterThan(1)
		expect(counts[0]).toBeLessThan(counts[1] ?? 0)
	})

	test("сначала пытается уложить все элементы на одну орбиту внутри доступного родительского диаметра", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [], ["f1", "f2", "f3", "f4"]),
		], { rootInnerDiameterMm: 1200 })

		const ringKeys = [
			...new Set(
				snapshot.fields
					.filter((field) => field.particleId === "root")
					.map((field) => Math.hypot(field.localX, field.localY).toFixed(6)),
			),
		]

		expect(ringKeys).toHaveLength(1)
	})

	test("не дает children и fields вылезать за внешний диаметр parent torus", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [
				createParticle("child-a", [], ["leaf-a"]),
				createParticle("child-b", [], ["leaf-b"]),
				createParticle("child-c", [], ["leaf-c"]),
				createParticle("child-d", [], ["leaf-d"]),
				createParticle("child-e", [], ["leaf-e"]),
				createParticle("child-f", [], ["leaf-f"]),
			], ["root-field-a", "root-field-b", "root-field-c"]),
		])

		for (const parent of snapshot.particles) {
			const outerRadius = (parent.shellRadius ?? 0) + (parent.shellTube ?? 0)
			for (const child of snapshot.particles.filter((particle) => particle.parentParticleId === parent.particleId)) {
				expect(Math.hypot(child.localX, child.localY) + child.shellRadius + child.shellTube).toBeLessThanOrEqual(
					outerRadius + 1e-6,
				)
			}

			for (const field of snapshot.fields.filter((orbit) => orbit.particleId === parent.particleId)) {
				expect(Math.hypot(field.localX, field.localY) + field.sphereRadius).toBeLessThanOrEqual(
					outerRadius + 1e-6,
				)
			}
		}
	})

	test("нормализует root torus к outer diameter 4000 мм", () => {
		const raw = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [
				createParticle("child-a", [], ["leaf-a", "leaf-b", "leaf-c", "leaf-d", "leaf-e", "leaf-f", "leaf-g"]),
				createParticle("child-b", [], ["leaf-h", "leaf-i", "leaf-j", "leaf-k", "leaf-l", "leaf-m", "leaf-n"]),
			], ["root-field"]),
		])

		const normalized = scaleDbWorldSnapshotToRootOuterDiameter(raw)
		const root = normalized.particles.find((particle) => particle.parentParticleId === null)
		expect(root).toBeDefined()
		expect(((root?.shellRadius ?? 0) + (root?.shellTube ?? 0)) * 2).toBeCloseTo(
			appWebLayoutConfig.snapshot.rootOuterDiameterMm,
			6,
		)
	})

	test("сохраняет root inner diameter после нормализации внешнего диаметра", () => {
		const raw = createDbWorldSnapshotFromParticleDescriptors("root", [
			createParticle("root", [
				createParticle("child-a", [], ["leaf-a", "leaf-b"]),
				createParticle("child-b", [], ["leaf-c", "leaf-d"]),
			], ["field-a", "field-b", "field-c", "field-d"]),
		], { rootInnerDiameterMm: 1800 })

		const normalized = scaleDbWorldSnapshotToRootOuterDiameter(raw)
		const root = normalized.particles.find((particle) => particle.parentParticleId === null)

		expect(root).toBeDefined()
		expect(((root?.shellRadius ?? 0) - (root?.shellTube ?? 0)) * 2).toBeCloseTo(1800, 6)
		expect(((root?.shellRadius ?? 0) + (root?.shellTube ?? 0)) * 2).toBeCloseTo(
			appWebLayoutConfig.snapshot.rootOuterDiameterMm,
			6,
		)
	})

	test("держит одинаковый inner ratio для shell-ов после нормализации", () => {
		const normalized = scaleDbWorldSnapshotToRootOuterDiameter(
			createDbWorldSnapshotFromParticleDescriptors(
				"root",
				[
					createParticle("root", [
						createParticle("child-a", [createParticle("grand-a", [], ["leaf-a", "leaf-b", "leaf-c"])]),
						createParticle("child-b", [], ["field-b", "field-c", "field-d", "field-e", "field-f", "field-g"]),
					]),
				],
				{ rootInnerDiameterMm: 1200 },
			),
		)

		const particles = normalized.particles
		const ratios = particles.map((particle) => {
			const outer = particle.shellRadius + particle.shellTube
			const inner = particle.shellRadius - particle.shellTube
			return inner / outer
		})

		for (const ratio of ratios) {
			expect(ratio).toBeCloseTo(1200 / appWebLayoutConfig.snapshot.rootOuterDiameterMm, 6)
		}
	})

	test("после нормализации держит одинаковый outer size для shell-ов на одном depth", () => {
		const normalized = scaleDbWorldSnapshotToRootOuterDiameter(
			createDbWorldSnapshotFromParticleDescriptors("root", [
				createParticle("root", [
					createParticle("child-a", [createParticle("grand-a", [], ["leaf-a", "leaf-b", "leaf-c"])]),
					createParticle("child-b", [], [
						"field-b", "field-c", "field-d", "field-e", "field-f", "field-g", "field-h", "field-i",
					]),
				]),
			]),
		)

		const depthOne = normalized.particles.filter((particle) => particle.depth === 1)
		expect(depthOne).toHaveLength(2)
		expect((depthOne[0]?.shellRadius ?? 0) + (depthOne[0]?.shellTube ?? 0)).toBeCloseTo(
			(depthOne[1]?.shellRadius ?? 0) + (depthOne[1]?.shellTube ?? 0),
			6,
		)
	})

	test("держит первый root-shell в центре сцены", () => {
		const snapshot = createDbWorldSnapshotFromParticleDescriptors("multi-root", [
			createParticle("root-a", [createParticle("child-a")], ["field-a"]),
			createParticle("root-b", [createParticle("child-b")], ["field-b"]),
		])

		const roots = snapshot.particles.filter((particle) => particle.parentParticleId === null)
		const rootA = roots.find((particle) => particle.particleId === "root-a")
		const rootB = roots.find((particle) => particle.particleId === "root-b")

		expect(rootA).toBeDefined()
		expect(rootB).toBeDefined()
		expect(rootA?.localX).toBe(0)
		expect(rootA?.localY).toBe(0)
		expect(Math.hypot(rootB?.localX ?? 0, rootB?.localY ?? 0)).toBeGreaterThan(0)
	})
})
