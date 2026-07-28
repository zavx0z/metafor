import {describe, expect, test} from "bun:test"
import type {BulkDarkParticle, BulkManifest} from "@metafor/types/bulk/manifest"
import {
	LADA_ROOT_SRC,
	ladaTopologyManifestFixture,
	ladaTopologyProjectionFixture,
} from "./lada-topology.fixture"

type Point = readonly [number, number, number]
type WorldFrame = Readonly<{
	origin: Point
	scale: number
}>

const add = (left: Point, right: Point): Point => [
	left[0] + right[0],
	left[1] + right[1],
	left[2] + right[2],
]

const scale = (point: Point, factor: number): Point => [
	point[0] * factor,
	point[1] * factor,
	point[2] * factor,
]

const distance = (left: Point, right: Point): number =>
	Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])

const localOrigin = (particle: BulkDarkParticle): Point =>
	[particle.localX, particle.localY, particle.localZ]

const outerRadius = (particle: BulkDarkParticle): number =>
	particle.torusRadius + particle.torusTube

const innerRadius = (particle: BulkDarkParticle): number =>
	particle.torusRadius - particle.torusTube

const particleBySrc = (manifest: BulkManifest, src: string): BulkDarkParticle => {
	const particle = manifest.darkParticles.find((candidate) => candidate.src === src)
	expect(particle).toBeDefined()
	return particle!
}

/**
 * Pure coordinate oracle for the current manifest contract:
 * childWorld = parentWorld ∘ childLocal, with translation + uniform scale.
 */
const worldFrame = (
	manifest: BulkManifest,
	particle: BulkDarkParticle,
	cache = new Map<number, WorldFrame>(),
): WorldFrame => {
	const cached = cache.get(particle.darkParticleId)
	if (cached) return cached
	const parent = particle.parentDarkParticleId === null
		? null
		: manifest.darkParticles.find(({darkParticleId}) =>
			darkParticleId === particle.parentDarkParticleId)
	if (particle.parentDarkParticleId !== null) expect(parent).toBeDefined()
	const parentFrame = parent
		? worldFrame(manifest, parent, cache)
		: {origin: [0, 0, 0] as Point, scale: 1}
	const frame = {
		origin: add(parentFrame.origin, scale(localOrigin(particle), parentFrame.scale)),
		scale: parentFrame.scale * particle.torusScale,
	}
	cache.set(particle.darkParticleId, frame)
	return frame
}

const expectPointClose = (actual: Point, expected: Point): void => {
	actual.forEach((value, index) => {
		expect(value).toBeCloseTo(expected[index]!, 12)
	})
}

describe("Lada three-level coordinate contract", () => {
	test("uses the accepted Lada projection instead of an alternate topology", () => {
		const projection = ladaTopologyProjectionFixture()
		expect(projection.atoms).toEqual([
			{id: 2, parentAtom: null, parentTopology: null, wimp: "zavx0z/lada", position: 0},
			{id: 3, parentAtom: 2, parentTopology: null, wimp: "zavx0z/lada-auth", position: 0},
			{id: 4, parentAtom: 2, parentTopology: null, wimp: "zavx0z/lada-chat", position: 1},
			{id: 5, parentAtom: 2, parentTopology: null, wimp: "zavx0z/lada-model", position: 2},
			{id: 6, parentAtom: 4, parentTopology: null, wimp: "zavx0z/lada-chat-send", position: 0},
		])

		const manifest = ladaTopologyManifestFixture()
		expect(manifest.rootSrc).toBe(LADA_ROOT_SRC)
		expect(manifest.darkParticles.map(({darkParticleId, parentDarkParticleId, src}) => ({
			id: darkParticleId,
			parent: parentDarkParticleId,
			src,
		}))).toEqual([
			{id: 4, parent: null, src: "zavx0z/lada"},
			{id: 6, parent: 4, src: "zavx0z/lada-auth"},
			{id: 8, parent: 4, src: "zavx0z/lada-chat"},
			{id: 12, parent: 8, src: "zavx0z/lada-chat-send"},
			{id: 10, parent: 4, src: "zavx0z/lada-model"},
		])
	})

	test("composes ChatSend through Chat and never directly through the Lada frame", () => {
		const manifest = ladaTopologyManifestFixture()
		const lada = particleBySrc(manifest, "zavx0z/lada")
		const chat = particleBySrc(manifest, "zavx0z/lada-chat")
		const chatSend = particleBySrc(manifest, "zavx0z/lada-chat-send")
		const ladaWorld = worldFrame(manifest, lada)
		const chatWorld = worldFrame(manifest, chat)
		const chatSendWorld = worldFrame(manifest, chatSend)

		expectPointClose(
			chatWorld.origin,
			add(ladaWorld.origin, scale(localOrigin(chat), ladaWorld.scale)),
		)
		expectPointClose(
			chatSendWorld.origin,
			add(chatWorld.origin, scale(localOrigin(chatSend), chatWorld.scale)),
		)
		expect(chatSendWorld.scale).toBeCloseTo(
			ladaWorld.scale * chat.torusScale * chatSend.torusScale,
			12,
		)

		const skippedChatOrigin = add(
			ladaWorld.origin,
			scale(localOrigin(chatSend), ladaWorld.scale),
		)
		expect(distance(chatSendWorld.origin, skippedChatOrigin)).toBeGreaterThan(1e-6)
		expect(distance(chatSendWorld.origin, chatWorld.origin)).toBeGreaterThan(1e-6)
		expect(distance(chatSendWorld.origin, ladaWorld.origin)).toBeGreaterThan(1e-6)
	})

	test("allocates only direct children on one parent-local planar orbit without row or spherical packing", () => {
		const manifest = ladaTopologyManifestFixture()
		const lada = particleBySrc(manifest, "zavx0z/lada")
		const chat = particleBySrc(manifest, "zavx0z/lada-chat")
		const directChildren = manifest.darkParticles
			.filter(({parentDarkParticleId}) => parentDarkParticleId === lada.darkParticleId)
			.toSorted((left, right) => left.darkParticleOrder - right.darkParticleOrder)

		expect(directChildren.map(({src}) => src)).toEqual([
			"zavx0z/lada-auth",
			"zavx0z/lada-chat",
			"zavx0z/lada-model",
		])
		expect(directChildren.every(({localZ}) => localZ === 0)).toBe(true)
		const localRadii = directChildren.map(({localX, localY}) => Math.hypot(localX, localY))
		expect(localRadii[1]!).toBeCloseTo(localRadii[0]!, 12)
		expect(localRadii[2]!).toBeCloseTo(localRadii[0]!, 12)
		expect(new Set(directChildren.map(({localX}) => localX.toFixed(9))).size).toBeGreaterThan(1)
		expect(new Set(directChildren.map(({localY}) => localY.toFixed(9))).size).toBeGreaterThan(1)
		expect(Math.abs(
			directChildren[0]!.localX * directChildren[1]!.localY -
			directChildren[0]!.localY * directChildren[1]!.localX,
		)).toBeGreaterThan(1e-6)

		const chatSend = particleBySrc(manifest, "zavx0z/lada-chat-send")
		expect(chatSend.parentDarkParticleId).toBe(chat.darkParticleId)
		expect(directChildren).not.toContain(chatSend)
	})

	test("keeps the real Lada and ChatSend toruses visually legible in their owning frames", () => {
		const manifest = ladaTopologyManifestFixture()
		const lada = particleBySrc(manifest, "zavx0z/lada")
		const chat = particleBySrc(manifest, "zavx0z/lada-chat")
		const chatSend = particleBySrc(manifest, "zavx0z/lada-chat-send")
		const directChildren = manifest.darkParticles
			.filter(({parentDarkParticleId}) => parentDarkParticleId === lada.darkParticleId)
		const directChildDiameters = directChildren.map((child) =>
			outerRadius(child) * child.torusScale * 2)

		// The accepted 100 mm Lada fixture must keep each first-level Atom large
		// enough to read as a torus, rather than as a marker in the root core.
		expect(directChildDiameters).toHaveLength(3)
		expect(Math.min(...directChildDiameters)).toBeGreaterThanOrEqual(14)

		// ChatSend is authored in Chat's local frame. A sparse one-child level
		// receives its allocation from Chat's envelope, not a fixed depth cap.
		const chatSendOwnerLocalDiameter =
			outerRadius(chatSend) * chatSend.torusScale * 2
		expect(chatSendOwnerLocalDiameter).toBeGreaterThanOrEqual(15)

		const ladaWorld = worldFrame(manifest, lada)
		const chatWorld = worldFrame(manifest, chat)
		const chatSendWorld = worldFrame(manifest, chatSend)
		const chatSendWorldDiameter = outerRadius(chatSend) * chatSendWorld.scale * 2
		const rootWorldDiameter = outerRadius(lada) * ladaWorld.scale * 2

		// At the initial Lada fit, the second-level torus still has a material
		// world extent and a distinct owner-local center.
		expect(chatSendWorldDiameter).toBeGreaterThanOrEqual(2)
		expect(chatSendWorldDiameter / rootWorldDiameter).toBeGreaterThanOrEqual(0.02)
		expect(distance(chatSendWorld.origin, chatWorld.origin)).toBeGreaterThanOrEqual(
			chatSendWorldDiameter / 2 - 1e-9,
		)

		const chatSendLocalBound =
			Math.hypot(chatSend.localX, chatSend.localY, chatSend.localZ) +
			outerRadius(chatSend) * chatSend.torusScale
		expect(chatSendLocalBound).toBeLessThanOrEqual(innerRadius(chat) + 1e-9)
	})

	test("does not collapse ChatSend into a root-authored global coordinate", () => {
		const manifest = ladaTopologyManifestFixture()
		const lada = particleBySrc(manifest, "zavx0z/lada")
		const chat = particleBySrc(manifest, "zavx0z/lada-chat")
		const chatSend = particleBySrc(manifest, "zavx0z/lada-chat-send")
		const ladaWorld = worldFrame(manifest, lada)
		const chatWorld = worldFrame(manifest, chat)
		const chatSendWorld = worldFrame(manifest, chatSend)
		const chatRelativeWorldOrigin = scale(
			[
				chatSendWorld.origin[0] - chatWorld.origin[0],
				chatSendWorld.origin[1] - chatWorld.origin[1],
				chatSendWorld.origin[2] - chatWorld.origin[2],
			],
			1 / chatWorld.scale,
		)
		const rootRelativeWorldOrigin = scale(
			[
				chatSendWorld.origin[0] - ladaWorld.origin[0],
				chatSendWorld.origin[1] - ladaWorld.origin[1],
				chatSendWorld.origin[2] - ladaWorld.origin[2],
			],
			1 / ladaWorld.scale,
		)

		expectPointClose(chatRelativeWorldOrigin, localOrigin(chatSend))
		expect(distance(rootRelativeWorldOrigin, localOrigin(chatSend))).toBeGreaterThan(1e-6)
		expect(chatSendWorld.scale).toBeCloseTo(chatWorld.scale * chatSend.torusScale, 12)
	})

	test("keeps each direct Matter child inside its owning local frame in local and world coordinates", () => {
		const manifest = ladaTopologyManifestFixture()
		const byId = new Map(manifest.darkParticles.map((particle) =>
			[particle.darkParticleId, particle] as const))

		for (const child of manifest.darkParticles) {
			if (child.parentDarkParticleId === null) continue
			const parent = byId.get(child.parentDarkParticleId)
			expect(parent).toBeDefined()
			const localBound =
				Math.hypot(child.localX, child.localY, child.localZ) +
				outerRadius(child) * child.torusScale
			expect(localBound).toBeLessThanOrEqual(innerRadius(parent!) + 1e-9)

			const parentWorld = worldFrame(manifest, parent!)
			const childWorld = worldFrame(manifest, child)
			const worldBound =
				distance(parentWorld.origin, childWorld.origin) +
				outerRadius(child) * childWorld.scale
			expect(worldBound).toBeLessThanOrEqual(
				innerRadius(parent!) * parentWorld.scale + 1e-9,
			)
		}
	})
})
