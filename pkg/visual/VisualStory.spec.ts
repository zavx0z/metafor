import {describe, expect, test} from "bun:test"
import {CenteredNested} from "./CenteredNested.ts"
import {OutsideIn} from "./OutsideIn.ts"
import {
  compareVisualStoryRuns,
  createVisualStoryPlayer,
  formatVisualStoryTrace,
  runVisualStory,
  type VisualStoryDefinition,
} from "./VisualStory.ts"
import {
  visualStoryMoveAtom,
  visualStoryMoveCurrentState,
  visualStoryRelabelTorus,
  visualStoryRemoveAtom,
  visualStorySetFieldValue,
  visualStorySetOrbitalActivity,
  visualStoryWait,
} from "./VisualStoryEvents.ts"
import {ladaLayoutInput} from "./testing/lada-fixture.ts"

/**
 * A story frame runs one real layout build over the full Lada scene, so a test
 * that completes several runs needs more than the default per-test budget.
 */
const REAL_SCENE_TIMEOUT_MS = 60_000

const ladaConditions = () => {
  const input = ladaLayoutInput()
  return {manifest: input.manifest, owners: input.owners}
}

const firstFieldParticleId = (): string => {
  const field = ladaConditions().manifest.fieldParticles[0]
  if (!field) throw new Error("fixture has no Field")
  return field.fieldParticleId
}

const leafAtomId = (): number => {
  const manifest = ladaConditions().manifest
  const parentIds = new Set(
    manifest.darkParticles
      .map((particle) => particle.parentDarkParticleId)
      .filter((id): id is number => id !== null),
  )
  const leaf = manifest.darkParticles
    .filter((particle) =>
      particle.darkParticleKind === "atom" &&
      particle.parentDarkParticleId !== null &&
      !parentIds.has(particle.darkParticleId)
    )
    .toSorted((left, right) => right.depth - left.depth)[0]
  if (!leaf) throw new Error("fixture has no leaf Atom")
  return leaf.darkParticleId
}

const rootAtomId = (): number =>
  ladaConditions().manifest.darkParticles[0]!.darkParticleId

/**
 * A story made only of facts no strategy reads for placement: labels, and one
 * pause. What each frame must cost is stated once, next to the story, because
 * that is the whole claim the story exists to make.
 */
const appearanceStory = (): VisualStoryDefinition => ({
  description: "Labels change and time passes; nothing moves.",
  events: [
    visualStoryRelabelTorus(rootAtomId(), "Story root"),
    visualStoryWait(16),
    visualStoryRelabelTorus(leafAtomId(), "Story leaf"),
    visualStoryRelabelTorus(rootAtomId(), "Story root again"),
  ],
  initial: ladaConditions,
  name: "lada-appearance",
})

const APPEARANCE_SCOPES = [
  "structure", // the initial frame is always the whole scene
  "appearance",
  "none", // a pause moves virtual time and nothing else
  "appearance",
  "appearance",
] as const

const structuralStory = (): VisualStoryDefinition => ({
  events: [
    visualStoryRelabelTorus(rootAtomId(), "before-removal"),
    visualStoryRemoveAtom(leafAtomId()),
  ],
  initial: ladaConditions,
  name: "lada-structure",
})

describe("Visual story engine", () => {
  test("records an initial frame as a full scene before any event", () => {
    const player = createVisualStoryPlayer({
      layout: CenteredNested,
      story: appearanceStory(),
    })
    const state = player.state()

    expect(state.status).toBe("idle")
    expect(state.index).toBe(0)
    expect(state.timeMs).toBe(0)
    expect(state.remaining).toBe(4)
    expect(state.frame.label).toBe("initial")
    expect(state.frame.invalidation).toBe("structure")
    expect(state.frame.patch.kind).toBe("visual-replace-patch")
    expect(state.frame.payload.layoutSlug).toBe("centered-nested")
    expect(state.frame.payload.tori.length).toBeGreaterThanOrEqual(5)
  })

  test("advances one event per step and reports remaining work", () => {
    const player = createVisualStoryPlayer({
      layout: CenteredNested,
      story: appearanceStory(),
    })

    expect(player.start().status).toBe("running")
    const first = player.step()
    expect(first.index).toBe(1)
    expect(first.remaining).toBe(3)
    expect(first.frame.label).toContain("Story root")

    const second = player.step()
    expect(second.index).toBe(2)
    expect(second.timeMs).toBe(16)
    expect(second.frame.label).toBe("wait 16ms")
    expect(second.frame.patch.kind).toBe("visual-none-patch")
  })

  test("holds position while paused and continues after resume", () => {
    const player = createVisualStoryPlayer({
      layout: CenteredNested,
      story: appearanceStory(),
    })
    player.start()
    player.step()
    const paused = player.pause()

    expect(paused.status).toBe("paused")
    expect(player.step().index).toBe(paused.index)
    expect(player.state().status).toBe("paused")

    expect(player.resume().status).toBe("running")
    expect(player.step().index).toBe(paused.index + 1)
  })

  test("finishes every remaining event and reports a complete run", () => {
    const run = runVisualStory({
      layout: CenteredNested,
      story: appearanceStory(),
    })

    expect(run.name).toBe("lada-appearance")
    expect(run.layoutSlug).toBe("centered-nested")
    expect(run.frames.length).toBe(5)
    expect(run.trace.length).toBe(5)
    expect(run.frames.at(-1)?.label).toContain("Story root again")
  })

  test("returns to the initial condition on reset", () => {
    const player = createVisualStoryPlayer({
      layout: CenteredNested,
      story: appearanceStory(),
    })
    const initial = player.state()
    player.finish()
    expect(player.state().status).toBe("finished")

    const reset = player.reset()
    expect(reset.status).toBe("idle")
    expect(reset.index).toBe(0)
    expect(reset.timeMs).toBe(0)
    expect(JSON.stringify(reset.frame.payload))
      .toBe(JSON.stringify(initial.frame.payload))
  })

  test("replays deterministically frame for frame", () => {
    const player = createVisualStoryPlayer({
      layout: CenteredNested,
      story: appearanceStory(),
    })
    const first = player.finish()
    player.replay()
    const second = player.finish()

    expect(second.frames.length).toBe(first.frames.length)
    for (const [index, frame] of second.frames.entries()) {
      expect(JSON.stringify(frame.payload))
        .toBe(JSON.stringify(first.frames[index]!.payload))
      expect(frame.timeMs).toBe(first.frames[index]!.timeMs)
      expect(frame.summary.total).toBe(first.frames[index]!.summary.total)
    }
  }, REAL_SCENE_TIMEOUT_MS)

  test("produces identical runs across independent players", () => {
    const left = runVisualStory({
      layout: CenteredNested,
      story: appearanceStory(),
    })
    const right = runVisualStory({
      layout: CenteredNested,
      story: appearanceStory(),
    })
    const comparison = compareVisualStoryRuns(left, right)

    expect(comparison.identical).toBe(true)
    expect(comparison.firstDivergedIndex).toBeNull()
    expect(comparison.frameCount).toBe(left.frames.length)
  }, REAL_SCENE_TIMEOUT_MS)

  test("reports where two layout configurations diverge", () => {
    const comparison = compareVisualStoryRuns(
      runVisualStory({layout: CenteredNested, story: appearanceStory()}),
      runVisualStory({layout: OutsideIn, story: appearanceStory()}),
    )

    expect(comparison.identical).toBe(false)
    expect(comparison.firstDivergedIndex).toBe(0)
  }, REAL_SCENE_TIMEOUT_MS)

  test("keeps appearance events off the geometry path", () => {
    const run = runVisualStory({
      layout: CenteredNested,
      story: appearanceStory(),
    })

    expect(run.frames.map((frame) => frame.invalidation))
      .toEqual([...APPEARANCE_SCOPES])
    for (const frame of run.frames.slice(1)) {
      expect(frame.patch.kind).not.toBe("visual-replace-patch")
    }

    const relabelFrame = run.frames.find((frame) =>
      frame.label.endsWith("Story leaf")
    )!
    expect(relabelFrame.summary.tori).toBe(1)
    expect(relabelFrame.summary.fields).toBe(0)
    expect(relabelFrame.summary.transitionBatches).toBe(0)
  })

  test("lets the strategy decide what a Field Value rebinding costs", () => {
    // `centered-nested` groups Fields by their canonical Value and lifts a
    // shared group to the highest common owner, so rebinding one Field is
    // placement input there. `outside-in` seats every Field against its own
    // owner's core and carries the Value as data, so the same edit repaints.
    // A story asserts what each strategy answers, never a single global answer.
    const story = (): VisualStoryDefinition => ({
      events: [
        visualStorySetFieldValue(firstFieldParticleId(), "story-value-1"),
      ],
      initial: ladaConditions,
      name: "lada-field-value",
    })

    expect(
      runVisualStory({layout: CenteredNested, story: story()})
        .frames.at(-1)?.invalidation,
    ).toBe("geometry")

    const repainted = runVisualStory({layout: OutsideIn, story: story()})
      .frames.at(-1)!
    expect(repainted.invalidation).toBe("appearance")
    expect(repainted.patch.kind).toBe("visual-appearance-patch")
    expect(repainted.summary.fields).toBe(1)
    expect(repainted.summary.tori).toBe(0)
  }, REAL_SCENE_TIMEOUT_MS)

  test("rebuilds the whole scene for a structural event", () => {
    const run = runVisualStory({
      layout: CenteredNested,
      story: structuralStory(),
    })
    const [, appearance, structural] = run.frames

    expect(appearance!.invalidation).toBe("appearance")
    expect(appearance!.patch.kind).toBe("visual-appearance-patch")
    expect(structural!.invalidation).toBe("structure")
    expect(structural!.patch.kind).toBe("visual-replace-patch")
    expect(structural!.payload.tori.length)
      .toBeLessThan(appearance!.payload.tori.length)
    expect(structural!.summary.total)
      .toBeGreaterThan(appearance!.summary.total)
  })

  test("moves one owner's current State without duplicating the marker", () => {
    const conditions = ladaConditions()
    const owner = conditions.manifest.darkParticles.find((particle) =>
      particle.darkParticleKind === "atom"
    )!
    const states = (conditions.manifest.orbitalParticles ?? []).filter(
      (particle) =>
        particle.orbitalParticleKind === "state" &&
        particle.parentDarkParticleId === owner.darkParticleId,
    )
    const target = states.find((particle) => !particle.current)
    if (!target) throw new Error("fixture has no non-current State")

    const run = runVisualStory({
      layout: CenteredNested,
      story: {
        events: [
          visualStoryMoveCurrentState(
            owner.darkParticleId,
            target.orbitalParticleId,
          ),
        ],
        initial: ladaConditions,
        name: "current-state",
      },
    })
    const frame = run.frames.at(-1)!
    const currentOfOwner = frame.payload.orbitals.filter((orbital) =>
      orbital.orbitalParticleKind === "state" &&
      orbital.ownerDarkParticleId === owner.darkParticleId &&
      orbital.current
    )

    expect(frame.invalidation).toBe("appearance")
    expect(currentOfOwner.length).toBe(1)
    expect(currentOfOwner[0]?.orbitalParticleId)
      .toBe(target.orbitalParticleId)
  })

  test("changes causal activity on the effects path", () => {
    const conditions = ladaConditions()
    const causal = (conditions.manifest.orbitalParticles ?? []).find(
      (particle) => particle.orbitalParticleKind === "process",
    )
    if (!causal) throw new Error("fixture has no Process occurrence")

    const run = runVisualStory({
      layout: CenteredNested,
      story: {
        events: [
          visualStorySetOrbitalActivity(
            causal.orbitalParticleId,
            !causal.active,
          ),
        ],
        initial: ladaConditions,
        name: "activity",
      },
    })
    const frame = run.frames.at(-1)!

    // Activity is animated overlay state on a placement nobody moved, so it
    // owns its own scope — narrower than paint, and nowhere near geometry.
    expect(frame.invalidation).toBe("effects")
    expect(frame.patch.kind).toBe("visual-appearance-patch")
    expect(frame.summary.orbitals).toBeGreaterThan(0)
    expect(
      frame.payload.orbitals.find((orbital) =>
        orbital.orbitalParticleId === causal.orbitalParticleId
      )?.active,
    ).toBe(!causal.active)
  })

  test("re-parents an Atom as a structural event", () => {
    const conditions = ladaConditions()
    const root = conditions.manifest.darkParticles.find((particle) =>
      particle.parentDarkParticleId === null
    )!
    const children = conditions.manifest.darkParticles.filter((particle) =>
      particle.parentDarkParticleId === root.darkParticleId &&
      particle.darkParticleKind === "atom"
    )
    if (children.length < 2) throw new Error("fixture has too few children")

    const run = runVisualStory({
      layout: CenteredNested,
      story: {
        events: [
          visualStoryMoveAtom(
            children[0]!.darkParticleId,
            children[1]!.darkParticleId,
          ),
        ],
        initial: ladaConditions,
        name: "reparent",
      },
    })
    const frame = run.frames.at(-1)!
    const moved = frame.payload.tori.find((torus) =>
      torus.darkParticleId === children[0]!.darkParticleId
    )!

    expect(frame.invalidation).toBe("structure")
    expect(frame.patch.kind).toBe("visual-replace-patch")
    expect(moved.parentDarkParticleId).toBe(children[1]!.darkParticleId)
    expect(moved.depth).toBe(children[1]!.depth + 1)
  })

  test("exposes an inspectable trace of the run", () => {
    const run = runVisualStory({
      layout: CenteredNested,
      story: appearanceStory(),
    })
    const text = formatVisualStoryTrace(run.trace)

    expect(run.trace[0]).toMatchObject({
      index: 0,
      invalidation: "structure",
      label: "initial",
      patchKind: "visual-replace-patch",
      timeMs: 0,
    })
    expect(run.trace.at(-1)?.touched).toBeGreaterThan(0)
    expect(text.split("\n").length).toBe(run.trace.length)
    expect(text).toContain("initial")
    expect(text).toContain("appearance")
  })

  test("runs the same story under both strategies", () => {
    for (const layout of [CenteredNested, OutsideIn]) {
      const run = runVisualStory({layout, story: appearanceStory()})

      expect(run.layoutSlug).toBe(layout.slug)
      expect(run.frames.length).toBe(5)
      expect(run.frames.map((frame) => frame.invalidation))
        .toEqual([...APPEARANCE_SCOPES])
      expect(run.frames[0]?.payload.tori.length).toBeGreaterThanOrEqual(5)
    }
  }, REAL_SCENE_TIMEOUT_MS)

  test("rejects a story pinned to a different strategy", () => {
    expect(() =>
      createVisualStoryPlayer({
        layout: CenteredNested,
        story: {...appearanceStory(), layoutSlug: "outside-in"},
      })
    ).toThrow("requires layout outside-in")
  })

  test("rejects an event that targets an absent entity", () => {
    expect(() =>
      runVisualStory({
        layout: CenteredNested,
        story: {
          events: [visualStorySetFieldValue("field:absent", "x")],
          initial: ladaConditions,
          name: "invalid",
        },
      })
    ).toThrow("field:absent")
    expect(() =>
      runVisualStory({
        layout: CenteredNested,
        story: {
          events: [visualStoryRemoveAtom(-1)],
          initial: ladaConditions,
          name: "invalid",
        },
      })
    ).toThrow()
  })

  test("refuses to remove the root or create a cycle", () => {
    const conditions = ladaConditions()
    const root = conditions.manifest.darkParticles.find((particle) =>
      particle.parentDarkParticleId === null
    )!
    const child = conditions.manifest.darkParticles.find((particle) =>
      particle.parentDarkParticleId === root.darkParticleId
    )!

    expect(() =>
      runVisualStory({
        layout: CenteredNested,
        story: {
          events: [visualStoryRemoveAtom(root.darkParticleId)],
          initial: ladaConditions,
          name: "remove-root",
        },
      })
    ).toThrow("cannot remove the root Atom")
    expect(() =>
      runVisualStory({
        layout: CenteredNested,
        story: {
          events: [
            visualStoryMoveAtom(root.darkParticleId, child.darkParticleId),
          ],
          initial: ladaConditions,
          name: "cycle",
        },
      })
    ).toThrow("cycle")
  })
})
