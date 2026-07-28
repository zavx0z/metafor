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
