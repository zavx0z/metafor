import {describe, expect, test} from "bun:test"
import type {Part} from "shared/protocol/force/particle"
import {VISUAL_INACTIVE_STATE_BRANCH_OPACITY} from "../src/VisualMaterialSpec.ts"
import {
  buildVisualSceneRenderPlan,
  visualSceneProfileAxes,
} from "./VisualSceneViewport.ts"
import {
  FORCE_STORY_LAYOUTS,
  FORCE_STORY_PARTS,
  FORCE_STORY_VIEWS,
  ForceStories,
  createForceStorySession,
  forceStoryModalText,
  forceStoryRouteSlug,
  formatForceStoryPatch,
} from "./ForceStories.ts"

const actualForceParts: readonly Part[] = [
  "inflaton",
  "graviton",
  "photon",
  "gluon",
  "higgs",
  "w+",
  "w-",
  "z",
]

const geometry = (
  snapshot: ReturnType<ReturnType<typeof createForceStorySession>["snapshot"]>,
) => ({
  dark: snapshot.representation.visual.manifest.darkParticles.map((particle) => ({
    id: particle.darkParticleId,
    radius: particle.torusRadius,
    tube: particle.torusTube,
    x: particle.localX,
    y: particle.localY,
    z: particle.localZ,
  })),
  fields: snapshot.representation.visual.manifest.fieldParticles.map(
    (particle) => ({
      id: particle.fieldParticleId,
      radius: particle.sphereRadius,
      x: particle.localX,
      y: particle.localY,
      z: particle.localZ,
    }),
  ),
  orbitals: snapshot.representation.visual.manifest.orbitalParticles.map(
    (particle) => ({
      form: particle.orbitalParticleKind,
      id: particle.orbitalParticleId,
      x: particle.localX,
      y: particle.localY,
      z: particle.localZ,
    }),
  ),
  orbitalSpheres: snapshot.representation.visual.orbitalSpheres,
  orbitalTori: snapshot.representation.visual.orbitalTori,
  proxies: snapshot.representation.visual.manifest.fieldProxies.map(
    (proxy) => ({
      id: proxy.fieldProxyId,
      x: proxy.localX,
      y: proxy.localY,
      z: proxy.localZ,
    }),
  ),
  relations: snapshot.representation.visual.relationPaths.map((path) => ({
    id: path.relationChannelId,
    points: path.points,
  })),
  transitions: snapshot.representation.visual.transitionPaths.map((path) => ({
    id: path.transitionChannelId,
    points: path.points,
  })),
})

const sceneGeometry = (
  snapshot: ReturnType<ReturnType<typeof createForceStorySession>["snapshot"]>,
  layoutId: "centered-nested" | "outside-in",
) => {
  const layout = snapshot.representation.layouts.find((candidate) =>
    candidate.id === layoutId
  )!
  const plan = buildVisualSceneRenderPlan(layout.scene)
  return {
    labels: plan.labels,
    linePaths: plan.lineBatches.flatMap((batch) => batch.paths.map((path) => ({
      id: path.id,
      kind: batch.kind,
      ownerDarkParticleId: batch.ownerDarkParticleId,
      points: path.points,
    }))).sort((left, right) => left.id.localeCompare(right.id)),
    meshes: plan.meshes.map(({material: _, ...mesh}) => mesh),
  }
}

const sceneAppearance = (
  snapshot: ReturnType<ReturnType<typeof createForceStorySession>["snapshot"]>,
  layoutId: "centered-nested" | "outside-in",
) => {
  const layout = snapshot.representation.layouts.find((candidate) =>
    candidate.id === layoutId
  )!
  const plan = buildVisualSceneRenderPlan(layout.scene)
  return {
    lines: plan.lineBatches.flatMap((batch) => batch.paths.map((path) => ({
      id: path.id,
      kind: batch.kind,
      material: batch.material,
      ownerDarkParticleId: batch.ownerDarkParticleId,
    }))).sort((left, right) => left.id.localeCompare(right.id)),
    meshes: plan.meshes.map((mesh) => ({
      id: mesh.id,
      material: mesh.material,
    })),
  }
}

describe("Force Stories catalog", () => {
  test("owns eight Force tabs in protocol order and no entity taxonomy", () => {
    expect([...FORCE_STORY_PARTS]).toEqual([...actualForceParts])
    expect(ForceStories.map((story) => story.part)).toEqual([...actualForceParts])
    expect(new Set(ForceStories.map((story) => story.part)).size).toBe(8)
    expect(ForceStories.map((story) => story.label)).toEqual([
      "Inflaton",
      "Graviton",
      "Photon",
      "Gluon",
      "Higgs",
      "W+",
      "W-",
      "Z",
    ])
    expect(ForceStories.map((story) => forceStoryRouteSlug(story.part)))
      .toEqual([
        "force-stories/inflaton",
        "force-stories/graviton",
        "force-stories/photon",
        "force-stories/gluon",
        "force-stories/higgs",
        "force-stories/w-plus",
        "force-stories/w-minus",
        "force-stories/z",
      ])
  })

  test("models Photon as two layouts by two camera views", () => {
    expect(FORCE_STORY_VIEWS).toEqual([
      {camera: "top", id: "top", label: "Вид сверху"},
      {camera: "side-profile", id: "side", label: "Вид сбоку"},
    ])
    expect(FORCE_STORY_LAYOUTS).toEqual([
      {id: "centered-nested", label: "Центрированно-вложенная"},
      {id: "outside-in", label: "Снаружи-внутрь"},
    ])
    for (const story of ForceStories) {
      expect(Array.isArray(story.representations)).toBe(true)
      expect(story.representations).toHaveLength(1)
      expect(story.representations[0]).toMatchObject({
        kind: "focused-visual-graph",
      })
      expect(story.representations[0]?.views).toEqual(FORCE_STORY_VIEWS)
      expect(story.representations[0]?.views).toHaveLength(2)
    }
    const photonRepresentation = ForceStories.find((story) =>
      story.part === "photon"
    )!.representations[0]!
    expect(photonRepresentation.status).toBe("verified")
    if (photonRepresentation.status !== "verified") {
      throw new Error("Photon representation must be verified")
    }
    expect(photonRepresentation.layouts).toEqual(FORCE_STORY_LAYOUTS)
    expect(photonRepresentation.layouts.flatMap((layout) =>
      photonRepresentation.views.map((view) => `${layout.id}:${view.id}`)
    )).toEqual([
      "centered-nested:top",
      "centered-nested:side",
      "outside-in:top",
      "outside-in:side",
    ])
    for (const story of ForceStories.filter((candidate) =>
      candidate.part !== "photon"
    )) {
      expect("layouts" in story.representations[0]!).toBe(false)
    }
  })

  test("keeps every modal concrete and Story-specific", () => {
    const modalTexts = ForceStories.map(forceStoryModalText)
    expect(new Set(modalTexts).size).toBe(actualForceParts.length)
    for (const [index, story] of ForceStories.entries()) {
      const text = modalTexts[index]!
      if (story.part !== "photon") {
        expect(text).toContain(`(${story.part})`)
        expect(text).toContain(formatForceStoryPatch(story))
        expect(text).toContain(story.scenario)
        expect(text).toContain(story.expectedVisualOutcome)
      }
      expect(text).not.toContain("как пользоваться")
      expect(text).not.toContain("Storybook")
    }
    const photon = ForceStories.find((story) => story.part === "photon")!
    const photonText = forceStoryModalText(photon)
    expect(photonText).toContain("частица Photon")
    expect(photonText).toContain("целевого Atom")
    expect(photonText).toContain("обращение к модели")
    expect(photonText).toContain("ошибка")
    expect(photonText).toContain("Inference prompt is empty.")
    expect(photonText).toContain("Condition")
    expect(photonText).toContain("Process")
    expect(photonText).toContain("Transition")
    expect(photonText).toContain("всех четырёх отображениях обеих раскладок")
    expect(photonText).toContain("Restart возвращает точный подготовленный срез")
    expect(photonText).not.toContain(formatForceStoryPatch(photon))
    expect(photonText).not.toContain("Входящий Force patch")
    expect(photonText).not.toContain("projection-срез")
    expect(photonText).not.toContain("idle")
    expect(photonText).not.toContain("ready")
  })

  test("extracts the exact sequence-411 causal and visual closure", () => {
    const photon = ForceStories.find((story) => story.part === "photon")!
    const session = createForceStorySession(photon)
    const prepared = session.snapshot()
    const runtime = prepared.projection.runtime
    const scene = session.representation.preparedScene

    expect(prepared.phase).toBe("prepared")
    expect(prepared.currentState).toBe("обращение к модели")
    expect(prepared.representation.layouts.map((layout) => ({
      id: layout.id,
      label: layout.label,
      sceneLayout: layout.scene.layoutSlug,
    }))).toEqual([
      {
        id: "centered-nested",
        label: "Центрированно-вложенная",
        sceneLayout: "centered-nested",
      },
      {
        id: "outside-in",
        label: "Снаружи-внутрь",
        sceneLayout: "outside-in",
      },
    ])
    expect(photon.patch).toEqual({
      part: "photon",
      op: "replace",
      path: 4,
      ts: 1785496429978,
      value: "ошибка",
      by: "matrix",
    })
    expect(scene.provenance).toEqual(expect.objectContaining({
      acceptedAt: "2026-07-31T11:13:49.993Z",
      historySegment:
        ".metafor/dark-force-history/v1/segments/00000000000000000001.ndjson",
      historySegmentSha256:
        "b22c61d7a63613c9ca31277f141337b970684885e81d69c6a1f52beb52916d0e",
      preparedThroughSequence: 411,
      patchSequence: 412,
      targetAtomId: 4,
      targetSrc: "zavx0z/lada-model",
    }))
    expect(scene.closure).toEqual({
      atomIds: [1, 4],
      conditionIds: [33, 34, 35, 36],
      fieldIds: [15, 16, 17, 45, 46, 47, 48, 49],
      parentSourceFieldIds: [15, 16, 17],
      processIds: [12],
      stateIds: [18, 19, 20],
      targetFieldIds: [45, 46, 47, 48, 49],
      transitionIds: [25, 26, 27, 28],
    })
    expect(runtime.atoms).toEqual([
      expect.objectContaining({id: 1, parentAtom: null, wimp: "zavx0z/lada"}),
      expect.objectContaining({id: 4, parentAtom: 1, wimp: "zavx0z/lada-model"}),
    ])
    expect(runtime.fields.map((field) => field.id))
      .toEqual([15, 16, 17, 45, 46, 47, 48, 49])
    expect(prepared.representation.graph.states.map((state) => state.name))
      .toEqual(["ожидание", "обращение к модели", "ошибка"])
    expect(runtime.transitions.map((transition) => transition.id))
      .toEqual([25, 26, 27, 28])
    expect(runtime.conditions.map((condition) => condition.id))
      .toEqual([33, 34, 35, 36])
    expect(runtime.conditions.find((condition) => condition.id === 34))
      .toEqual(expect.objectContaining({
        field: 49,
        predicate: {null: false},
        transition: 26,
      }))
    expect(runtime.processes).toEqual([
      expect.objectContaining({
        id: 12,
        state: "обращение к модели",
        descriptor: expect.objectContaining({
          action: {readFields: [
            [45, "prompt"],
            [46, "model"],
            [47, "response"],
            [48, "lastMessageId"],
            [49, "error"],
          ]},
          error: {writeFields: [
            [45, "prompt"],
            [49, "error"],
          ]},
          success: {writeFields: [
            [45, "prompt"],
            [47, "response"],
            [48, "lastMessageId"],
            [49, "error"],
          ]},
        }),
      }),
    ])
    expect(runtime.atomValues.filter((binding) => binding.value === 17))
      .toEqual([
        {atom: 1, field: 17, value: 17},
        {atom: 4, field: 49, value: 17},
      ])
    expect(runtime.values.find((value) => value.id === 17)?.textValue)
      .toBe("Inference prompt is empty.")
    expect(prepared.representation.sleeves).toEqual([
      expect.objectContaining({active: false, current: false, name: "ожидание"}),
      expect.objectContaining({
        active: true,
        current: true,
        name: "обращение к модели",
      }),
      expect.objectContaining({active: false, current: false, name: "ошибка"}),
    ])
    expect(prepared.representation.graph.sleeves.map((sleeve) =>
      sleeve.rootStateId
    )).toEqual([18, 18, 19, 19, 20, 20])
    expect(prepared.representation.manifest.darkParticles.map((particle) =>
      particle.src
    )).toEqual(["zavx0z/lada", "zavx0z/lada-model"])
    expect(prepared.representation.manifest.fieldParticles).toHaveLength(8)
    expect(prepared.representation.manifest.orbitalParticles).toHaveLength(13)
    expect(prepared.representation.manifest.transitionChannels).toHaveLength(13)
    expect(prepared.representation.manifest.fieldProxies).toHaveLength(22)
    expect(prepared.representation.manifest.relationChannels).toHaveLength(52)
    expect(prepared.representation.manifest.relationChannels?.filter(
      (relation) => relation.relationKind === "field-entanglement"
    )).toHaveLength(3)
    expect(prepared.representation.manifest.relationChannels).toContainEqual(
      expect.objectContaining({
        relationKind: "field-entanglement",
        fromId: "atom:1:field:17",
        toId: "atom:4:field:49",
      }),
    )
    expect(prepared.representation.manifest.relationChannels).toContainEqual(
      expect.objectContaining({relationKind: "process-read"}),
    )
    expect(prepared.representation.manifest.relationChannels).toContainEqual(
      expect.objectContaining({relationKind: "process-write"}),
    )
    expect(new Set(runtime.atoms.map((atom) => atom.id))).toEqual(new Set([1, 4]))
    expect(runtime.atoms.some((atom) => [2, 3, 5].includes(atom.id))).toBe(false)
  })

  test("applies the recorded Photon as a material-only update and restarts exactly", () => {
    const photon = ForceStories.find((story) => story.part === "photon")!
    const session = createForceStorySession(photon)
    const prepared = session.snapshot()

    const applied = session.apply()
    expect(applied.phase).toBe("applied")
    expect(applied.change).toEqual({
      changed: true,
      affectedAtomIds: [4],
      facet: "current-state",
      structural: false,
    })
    expect(applied.currentState).toBe("ошибка")
    expect(applied.representation.sleeves).toEqual([
      expect.objectContaining({active: false, current: false, name: "ожидание"}),
      expect.objectContaining({
        active: false,
        current: false,
        name: "обращение к модели",
      }),
      expect.objectContaining({active: true, current: true, name: "ошибка"}),
    ])

    const currentState = (snapshot: typeof prepared) =>
      snapshot.representation.visual.manifest.orbitalParticles.filter(
        (particle) =>
          particle.orbitalParticleKind === "state" && particle.current,
      )
    expect(currentState(prepared).map((particle) => particle.sourceId))
      .toEqual([19])
    expect(currentState(applied).map((particle) => particle.sourceId))
      .toEqual([20])
    const activeProcesses = (snapshot: typeof prepared) =>
      snapshot.representation.manifest.orbitalParticles?.filter((particle) =>
        particle.orbitalParticleKind === "process" && particle.active
      ) ?? []
    expect(activeProcesses(prepared).map((particle) => particle.sourceId))
      .toEqual([12])
    expect(activeProcesses(applied)).toHaveLength(0)
    expect(prepared.representation.manifest.transitionChannels?.filter(
      (channel) => channel.active
    )).toHaveLength(5)
    expect(applied.representation.manifest.transitionChannels?.filter(
      (channel) => channel.active
    )).toHaveLength(4)
    expect(prepared.representation.manifest.relationChannels?.filter(
      (channel) => channel.active
    )).toHaveLength(20)
    expect(applied.representation.manifest.relationChannels?.filter(
      (channel) => channel.active
    )).toHaveLength(10)
    expect(geometry(applied)).toEqual(geometry(prepared))
    for (const layout of FORCE_STORY_LAYOUTS) {
      expect(sceneGeometry(applied, layout.id))
        .toEqual(sceneGeometry(prepared, layout.id))
      expect(sceneAppearance(applied, layout.id))
        .not.toEqual(sceneAppearance(prepared, layout.id))
      expect(applied.representation.layouts.find((candidate) =>
        candidate.id === layout.id
      )?.scene).not.toBe(prepared.representation.layouts.find((candidate) =>
        candidate.id === layout.id
      )?.scene)
    }
    expect(applied.representation.visual.orbitalMaterials)
      .not.toEqual(prepared.representation.visual.orbitalMaterials)
    expect(applied.representation.visual.transitionPaths.map((path) =>
      path.material
    )).not.toEqual(prepared.representation.visual.transitionPaths.map((path) =>
      path.material
    ))
    expect(applied.representation.visual.relationPaths.map((path) =>
      path.material
    )).not.toEqual(prepared.representation.visual.relationPaths.map((path) =>
      path.material
    ))

    for (const layout of prepared.representation.layouts) {
      const profile = visualSceneProfileAxes(
        buildVisualSceneRenderPlan(layout.scene),
      )
      expect(
        profile.rowDirection.x * profile.cameraDirection.x +
          profile.rowDirection.y * profile.cameraDirection.y,
      ).toBeCloseTo(0)
    }

    const previousSleeveIds = applied.representation.visual.manifest
      .orbitalParticles.filter((particle) =>
        particle.orbitalParticleKind === "state" &&
        particle.sleeveRootStateId === 19
      ).map((particle) => particle.orbitalParticleId)
    const opacityById = new Map(
      applied.representation.visual.orbitalMaterials.map((entry) =>
        [entry.orbitalParticleId, entry.material.opacity] as const
      ),
    )
    expect(previousSleeveIds.every((id) =>
      opacityById.get(id) === VISUAL_INACTIVE_STATE_BRANCH_OPACITY
    )).toBe(true)

    const restarted = session.restart()
    expect(restarted.phase).toBe("prepared")
    expect(restarted.currentState).toBe("обращение к модели")
    expect(restarted.projection).toEqual(prepared.projection)
    expect(restarted.representation).toEqual(prepared.representation)
  })

  test("leaves every non-Photon representation honestly unavailable", () => {
    const templates = ForceStories.filter((story) => story.part !== "photon")
    expect(templates).toHaveLength(7)
    for (const story of templates) {
      expect(story.status).toBe("template")
      expect(story.representations).toEqual([
        expect.objectContaining({
          kind: "focused-visual-graph",
          status: "unavailable",
        }),
      ])
      expect(story.expectedVisualOutcome).toMatch(
        /не подтвержден|не проверен|требует отдельной подтверждённой fixture/,
      )
    }
  })

  test("contains neither synthetic diagrams nor timeline controls", async () => {
    const [lab, page] = await Promise.all([
      Bun.file(new URL("./ForceStoriesLab.ts", import.meta.url)).text(),
      Bun.file(new URL("./index.html", import.meta.url)).text(),
    ])
    for (const forbidden of [
      "force-story-atom",
      "force-story-carrier",
      "force-story-trajectory",
      "force-stories-grid",
      "Pause",
      "Timeline",
      "Queue",
      "Forward",
      "Back",
      "Replay",
      "Пауза",
      "Таймлайн",
      "Очередь",
    ]) {
      expect(lab).not.toContain(forbidden)
      expect(page).not.toContain(forbidden)
    }
    expect(lab).toContain(
      'canvas.id = `force-story-${layout.id}-${view.id}-canvas`',
    )
    expect(lab).toContain("photonRepresentation.layouts.flatMap((layout)")
    expect(lab).toContain("scene: layoutSnapshot.scene")
    expect(lab).toContain(
      "runtime.viewport.applyScene(layoutSnapshot.scene)",
    )
    expect(lab.match(/className = "force-story-sleeves"/g)).toHaveLength(1)
    expect(lab).toContain("renderSleeves(sharedSleeveLegend, snapshot)")
    expect(lab).toContain("header.dataset.currentState = snapshot.currentState")
    expect(lab).not.toContain("runtime.legend")
    expect(lab).not.toContain("createBulkViewport")
    expect(lab).not.toContain("drag — вращение · wheel — масштаб")
    expect(page).not.toContain("force-story-viewer-hint")
    expect(lab).toContain('"Incoming Force patch"')
    expect(lab).toContain('"Scene snapshot"')
    expect(lab).toContain("visualArea.append(views, unavailable)")
    expect(lab).toContain("review.append(visualArea, inspectors)")
    expect(lab).toContain("header.append(sharedSleeveLegend, actions, help)")
    expect(lab).toContain("representation.append(review)")
    expect(lab).toContain(
      "photonSession.representation.preparedScene.sourceSnapshot",
    )
    expect(lab).toContain("caption.append(label)")
    expect(lab).not.toContain("summary.textContent")
    expect(lab).not.toContain("force-story-eyebrow")
    expect(lab).not.toContain("force-story-title")
    expect(lab).not.toContain("force-story-status")
    expect(lab).not.toContain("force-story-shared-state")
    expect(lab).not.toContain("force-story-current-state")
    expect(lab).not.toContain("representationHeader")
    expect(lab).not.toContain("representationMeta")
    expect(lab).not.toContain("Shared scene state")
    expect(lab).not.toContain("Текущий State")
    expect(lab).not.toContain("камера ·")
    expect(lab).not.toContain("force-story-view-template")
    expect(lab).not.toContain('document.createElement("details")')
    expect(page).toContain(".force-story-header {\n        display: flex;")
    expect(page).toContain(".force-story-layout-row")
    expect(page).toContain(".force-story-layout-views")
    expect(page).not.toContain(".force-story-view-template")
    expect(page).not.toContain(".force-story-eyebrow")
    expect(page).not.toContain(".force-story-title")
    expect(page).not.toContain(".force-story-status")
    expect(page).not.toContain(".force-story-shared-state")
    expect(page).not.toContain(".force-story-current-state")
    expect(page).not.toContain(".force-story-representation-meta")
    expect(page).not.toContain(".force-story-summary")
    expect(page).not.toContain(".force-story-footer")
    expect(page).not.toContain(".force-story-patch")
  })
})
