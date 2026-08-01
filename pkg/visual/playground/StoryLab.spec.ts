import {describe, expect, test} from "bun:test"
import {CenteredNested} from "../CenteredNested.ts"
import {OutsideIn} from "../OutsideIn.ts"
import {buildVisualScenePayload} from "../ScenePayload.ts"
import {buildVisualPayloadRenderPlan} from "../VisualSceneViewport.ts"
import {ladaLayoutInput} from "../testing/lada-fixture.ts"
import {
  createVisualStoryStand,
  visualStoryScenarios,
} from "./StoryLab.ts"

const REAL_SCENE_TIMEOUT_MS = 60_000

const standInput = () => {
  const input = ladaLayoutInput()
  return {manifest: input.manifest, owners: input.owners}
}

describe("Visual story stand", () => {
  test("declares every scenario with a distinct id", () => {
    const ids = visualStoryScenarios.map((scenario) => scenario.id)

    expect(ids.length).toBeGreaterThanOrEqual(3)
    expect(new Set(ids).size).toBe(ids.length)
    for (const scenario of visualStoryScenarios) {
      expect(scenario.label.length).toBeGreaterThan(0)
      expect(scenario.description.length).toBeGreaterThan(0)
    }
  })

  for (const scenario of visualStoryScenarios) {
    test(`runs the ${scenario.id} scenario end to end`, () => {
      const {manifest, owners} = standInput()
      const stand = createVisualStoryStand(
        scenario,
        CenteredNested,
        manifest,
        owners,
      )

      expect(stand.state.status).toBe("idle")
      expect(stand.state.index).toBe(0)
      expect(stand.summary).toContain("статус")
      expect(stand.trace).toContain("initial")

      stand.player.finish()
      const finished = stand.state
      expect(finished.status).toBe("finished")
      expect(finished.remaining).toBe(0)
      expect(stand.player.frames().length).toBeGreaterThan(1)
    }, REAL_SCENE_TIMEOUT_MS)
  }

  test("keeps the label scenario off the geometry path", () => {
    const {manifest, owners} = standInput()
    const scenario = visualStoryScenarios.find((entry) =>
      entry.id === "labels"
    )!
    const stand = createVisualStoryStand(
      scenario,
      CenteredNested,
      manifest,
      owners,
    )
    stand.player.finish()

    // A pause moves virtual time and nothing else; every other step is a label.
    expect(stand.player.frames().map((frame) => frame.invalidation))
      .toEqual(["structure", "appearance", "none", "appearance", "appearance"])
    for (const frame of stand.player.frames().slice(1)) {
      expect(frame.patch.kind).not.toBe("visual-replace-patch")
      expect(frame.summary.total).toBeLessThan(20)
    }
  }, REAL_SCENE_TIMEOUT_MS)

  test("lets the strategy price the Field Value scenario", () => {
    const {manifest, owners} = standInput()
    const scenario = visualStoryScenarios.find((entry) =>
      entry.id === "field-values"
    )!

    // The same declared scenario, priced by each strategy's own placement law:
    // `centered-nested` reads a Value rebinding as placement input, while
    // `outside-in` carries the Value as data and only repaints.
    const centered = createVisualStoryStand(
      scenario,
      CenteredNested,
      manifest,
      owners,
    )
    centered.player.finish()
    expect(centered.player.frames().map((frame) => frame.invalidation))
      .toEqual(["structure", "geometry", "none", "geometry"])

    const outside = createVisualStoryStand(scenario, OutsideIn, manifest, owners)
    outside.player.finish()
    expect(outside.player.frames().map((frame) => frame.invalidation))
      .toEqual(["structure", "appearance", "none", "appearance"])
    for (const frame of outside.player.frames().slice(1)) {
      expect(frame.patch.kind).not.toBe("visual-replace-patch")
      expect(frame.summary.tori).toBe(0)
    }
  }, REAL_SCENE_TIMEOUT_MS)

  test("rebuilds the scene for the topology scenario", () => {
    const {manifest, owners} = standInput()
    const scenario = visualStoryScenarios.find((entry) =>
      entry.id === "topology"
    )!
    const stand = createVisualStoryStand(
      scenario,
      CenteredNested,
      manifest,
      owners,
    )
    stand.player.finish()
    const frames = stand.player.frames()
    const last = frames.at(-1)!

    expect(last.invalidation).toBe("structure")
    expect(last.patch.kind).toBe("visual-replace-patch")
    expect(last.payload.tori.length)
      .toBeLessThan(frames[0]!.payload.tori.length)
  }, REAL_SCENE_TIMEOUT_MS)

  test("reports divergence between the two configurations", () => {
    const {manifest, owners} = standInput()
    const stand = createVisualStoryStand(
      visualStoryScenarios[0]!,
      CenteredNested,
      manifest,
      owners,
    )

    expect(stand.compare(OutsideIn)).toContain("расходятся")
    expect(stand.compare(CenteredNested)).toContain("совпадают")
  }, REAL_SCENE_TIMEOUT_MS)
})

describe("Visual payload render plan", () => {
  test("resolves owner-local coordinates back to world space", () => {
    const input = ladaLayoutInput()
    const scene = CenteredNested.buildScene(input)
    const payload = buildVisualScenePayload(CenteredNested, input)
    const plan = buildVisualPayloadRenderPlan(payload)

    const planById = new Map(plan.meshes.map((mesh) => [mesh.id, mesh]))
    for (const torus of scene.tori) {
      const mesh = planById.get(`dark:${torus.darkParticleId}`)
      expect(mesh).toBeDefined()
      expect(mesh!.x).toBeCloseTo(torus.x, 9)
      expect(mesh!.y).toBeCloseTo(torus.y, 9)
      expect(mesh!.z).toBeCloseTo(torus.z, 9)
    }
    for (const orbital of scene.orbitals) {
      const mesh = planById.get(`orbital:${orbital.orbitalParticleId}`)
      expect(mesh).toBeDefined()
      expect(mesh!.x).toBeCloseTo(orbital.x, 9)
      expect(mesh!.y).toBeCloseTo(orbital.y, 9)
      expect(mesh!.z).toBeCloseTo(orbital.z, 9)
    }
  }, REAL_SCENE_TIMEOUT_MS)

  test("covers every payload entity and sampled path", () => {
    const payload = buildVisualScenePayload(CenteredNested, ladaLayoutInput())
    const plan = buildVisualPayloadRenderPlan(payload)

    expect(plan.meshes.length).toBe(
      payload.tori.length +
        payload.fields.length +
        payload.orbitals.length +
        payload.fieldProxies.length,
    )
    expect(plan.lineBatches.length).toBe(
      payload.transitionBatches.length + payload.relationBatches.length,
    )
    for (const batch of plan.lineBatches) {
      for (const path of batch.paths) {
        expect(path.points.length).toBeGreaterThanOrEqual(2)
        for (const point of path.points) {
          expect(Number.isFinite(point.x)).toBe(true)
          expect(Number.isFinite(point.y)).toBe(true)
          expect(Number.isFinite(point.z)).toBe(true)
        }
      }
    }
  }, REAL_SCENE_TIMEOUT_MS)

  test("survives a JSON round trip unchanged", () => {
    const payload = buildVisualScenePayload(CenteredNested, ladaLayoutInput())
    const transported = JSON.parse(
      JSON.stringify(payload),
    ) as typeof payload

    expect(JSON.stringify(buildVisualPayloadRenderPlan(transported)))
      .toBe(JSON.stringify(buildVisualPayloadRenderPlan(payload)))
  }, REAL_SCENE_TIMEOUT_MS)
})
