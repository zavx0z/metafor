import { describe, expect, test } from "bun:test"
import { Ray, Vector3 } from "@metafor/engine"
import {
  resolveBulkDirectionalHoverTarget,
  resolveBulkHoverDirection,
  resolveBulkHoverPriorityTarget,
  resolveBulkHoverTarget,
  resolveBulkHoverTransition,
  resolveBulkPickHit,
  resolveBulkPickTarget,
  resolveBulkViewportFitPose,
  resolveBulkViewportFocusPose,
} from "./web-navigation"
import type { BulkPickTarget } from "@metafor/types/bulk/layout"

describe("bulk web navigation", () => {
  test("по клику выбирает самый глубокий Dark particle среди всех попавших под луч", () => {
    const targets: BulkPickTarget[] = [
      {
        kind: "darkParticle",
        darkParticleId: 1,
        parentDarkParticleId: null,
        depth: 0,
        center: new Vector3(0, 0, 0),
        torusRadius: 1000,
        torusTube: 240,
        outerRadius: 1240,
      },
      {
        kind: "darkParticle",
        darkParticleId: 2,
        parentDarkParticleId: 1,
        depth: 1,
        center: new Vector3(0, 1200, 0),
        torusRadius: 420,
        torusTube: 120,
        outerRadius: 540,
      },
    ]

    const hit = resolveBulkPickTarget(
      new Ray(new Vector3(420, 1200, -4000), new Vector3(0, 0, 1)),
      targets,
    )

    expect(hit?.kind).toBe("darkParticle")
    expect(hit && "darkParticleId" in hit ? hit.darkParticleId : null).toBe(2)
  })

  test("у более глубокого Dark particle приоритет выше даже если родитель попадает точнее", () => {
    const targets: BulkPickTarget[] = [
      {
        kind: "darkParticle",
        darkParticleId: 1,
        parentDarkParticleId: null,
        depth: 0,
        center: new Vector3(0, 0, 0),
        torusRadius: 1000,
        torusTube: 240,
        outerRadius: 1240,
      },
      {
        kind: "darkParticle",
        darkParticleId: 2,
        parentDarkParticleId: 1,
        depth: 2,
        center: new Vector3(0, 0, 0),
        torusRadius: 700,
        torusTube: 220,
        outerRadius: 920,
      },
    ]

    const hit = resolveBulkPickTarget(
      new Ray(new Vector3(760, 0, -4000), new Vector3(0, 0, 1)),
      targets,
    )

    expect(hit?.kind).toBe("darkParticle")
    expect(hit && "darkParticleId" in hit ? hit.darkParticleId : null).toBe(2)
  })

  test("Field particle sphere geometry участвует в pick/hover наравне с Dark particle", () => {
    const hit = resolveBulkPickTarget(
      new Ray(new Vector3(120, 40, -3000), new Vector3(0, 0, 1)),
      [
        {
          kind: "darkParticle",
          darkParticleId: 1,
          parentDarkParticleId: null,
          depth: 0,
          center: new Vector3(0, 0, 0),
          torusRadius: 1000,
          torusTube: 240,
          outerRadius: 1240,
        },
        {
          kind: "fieldParticle",
          parentDarkParticleId: 1,
          fieldParticleId: 101,
          depth: 3,
          center: new Vector3(120, 40, 0),
          sphereRadius: 90,
          outerRadius: 90,
        },
      ],
    )

    expect(hit?.kind).toBe("fieldParticle")
    expect(hit && "fieldParticleId" in hit ? hit.fieldParticleId : null).toBe(101)
  })

  test("hover retention не удерживает родителя, если найден более глубокий target", () => {
    const ray = new Ray(new Vector3(120, 40, -3000), new Vector3(0, 0, 1))
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const fieldParticle: BulkPickTarget = {
      kind: "fieldParticle",
      parentDarkParticleId: 1,
      fieldParticleId: 101,
      depth: 3,
      center: new Vector3(120, 40, 0),
      sphereRadius: 90,
      outerRadius: 90,
    }

    const hit = resolveBulkHoverTarget(ray, [root, fieldParticle], root)

    expect(hit?.kind).toBe("fieldParticle")
    expect(hit && "fieldParticleId" in hit ? hit.fieldParticleId : null).toBe(101)
  })

  test("hover retention удерживает текущий target только если нового точного hit нет", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }

    const hit = resolveBulkHoverTarget(
      new Ray(new Vector3(1280, 0, -3000), new Vector3(0, 0, 1)),
      [root],
      root,
    )

    expect(hit?.kind).toBe("darkParticle")
    expect(hit && "darkParticleId" in hit ? hit.darkParticleId : null).toBe(1)
  })

  test("при движении наружу удерживает child, пока он еще точно под курсором", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 700,
      torusTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkDirectionalHoverTarget(
      [
        { target: child, distance: 100 },
        { target: root, distance: 140 },
      ],
      child,
      1,
      new Map([
        [1, null],
        [2, 1],
      ]),
    )

    expect(target?.kind).toBe("darkParticle")
    expect(target && "darkParticleId" in target ? target.darkParticleId : null).toBe(2)
  })

  test("при движении наружу после выхода с child выбирает ближайшего родителя", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 700,
      torusTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkDirectionalHoverTarget(
      [{ target: root, distance: 140 }],
      child,
      1,
      new Map([
        [1, null],
        [2, 1],
      ]),
    )

    expect(target?.kind).toBe("darkParticle")
    expect(target && "darkParticleId" in target ? target.darkParticleId : null).toBe(1)
  })

  test("при движении внутрь выбирает ближайшего ребенка, а не самого глубокого потомка", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1200,
      torusTube: 240,
      outerRadius: 1440,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 900,
      torusTube: 180,
      outerRadius: 1080,
    }
    const grandchild: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 3,
      parentDarkParticleId: 2,
      depth: 2,
      center: new Vector3(0, 0, 0),
      torusRadius: 650,
      torusTube: 140,
      outerRadius: 790,
    }

    const target = resolveBulkDirectionalHoverTarget(
      [
        { target: grandchild, distance: 80 },
        { target: child, distance: 120 },
        { target: root, distance: 180 },
      ],
      root,
      -1,
      new Map([
        [1, null],
        [2, 1],
        [3, 2],
      ]),
    )

    expect(target?.kind).toBe("darkParticle")
    expect(target && "darkParticleId" in target ? target.darkParticleId : null).toBe(2)
  })

  test("направление hover считает по изменению радиуса к центру target", () => {
    expect(
      resolveBulkHoverDirection(
        { x: 20, y: 10 },
        { x: 40, y: 10 },
        { x: 0, y: 10 },
      ),
    ).toBe(1)

    expect(
      resolveBulkHoverDirection(
        { x: 40, y: 10 },
        { x: 20, y: 10 },
        { x: 0, y: 10 },
      ),
    ).toBe(-1)
  })

  test("hover переключается только после короткой стабильной задержки", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 700,
      torusTube: 160,
      outerRadius: 860,
    }

    const pending = resolveBulkHoverTransition({
      currentTarget: child,
      nextTarget: root,
      pendingTarget: null,
      pendingStartedAtMs: null,
      nowMs: 100,
      delayMs: 72,
    })
    expect(pending.committedTarget && "darkParticleId" in pending.committedTarget ? pending.committedTarget.darkParticleId : null).toBe(2)
    expect(pending.pendingTarget && "darkParticleId" in pending.pendingTarget ? pending.pendingTarget.darkParticleId : null).toBe(1)

    const committed = resolveBulkHoverTransition({
      currentTarget: child,
      nextTarget: root,
      pendingTarget: pending.pendingTarget,
      pendingStartedAtMs: pending.pendingStartedAtMs,
      nowMs: 173,
      delayMs: 72,
    })
    expect(committed.committedTarget && "darkParticleId" in committed.committedTarget ? committed.committedTarget.darkParticleId : null).toBe(1)
    expect(committed.pendingTarget).toBeNull()
  })

  test("hover delay сбрасывается, если курсор вернулся на текущий target", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 700,
      torusTube: 160,
      outerRadius: 860,
    }

    const pending = resolveBulkHoverTransition({
      currentTarget: child,
      nextTarget: root,
      pendingTarget: null,
      pendingStartedAtMs: null,
      nowMs: 100,
      delayMs: 72,
    })

    const reset = resolveBulkHoverTransition({
      currentTarget: child,
      nextTarget: child,
      pendingTarget: pending.pendingTarget,
      pendingStartedAtMs: pending.pendingStartedAtMs,
      nowMs: 120,
      delayMs: 72,
    })

    expect(reset.committedTarget && "darkParticleId" in reset.committedTarget ? reset.committedTarget.darkParticleId : null).toBe(2)
    expect(reset.pendingTarget).toBeNull()
    expect(reset.pendingStartedAtMs).toBeNull()
  })

  test("hover priority выбирает target с меньшей экранной ошибкой, а не более глубокий по умолчанию", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 700,
      torusTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkHoverPriorityTarget({
      currentTarget: null,
      candidates: [
        { target: child, distance: 80, score: 12 },
        { target: root, distance: 120, score: 3 },
      ],
    })

    expect(target?.kind).toBe("darkParticle")
    expect(target && "darkParticleId" in target ? target.darkParticleId : null).toBe(1)
  })

  test("hover priority при близких score предпочитает более глубокий child", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 700,
      torusTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkHoverPriorityTarget({
      currentTarget: null,
      candidates: [
        { target: child, distance: 80, score: 5.2 },
        { target: root, distance: 120, score: 4.4 },
      ],
    })

    expect(target?.kind).toBe("darkParticle")
    expect(target && "darkParticleId" in target ? target.darkParticleId : null).toBe(2)
  })

  test("hover priority удерживает текущий target, пока новый не стал заметно ближе", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 700,
      torusTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkHoverPriorityTarget({
      currentTarget: child,
      hysteresisPx: 6,
      candidates: [
        { target: child, distance: 80, score: 7 },
        { target: root, distance: 120, score: 3 },
      ],
    })

    expect(target?.kind).toBe("darkParticle")
    expect(target && "darkParticleId" in target ? target.darkParticleId : null).toBe(2)
  })

  test("hover priority не дает родителю блокировать более точного child", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 700,
      torusTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkHoverPriorityTarget({
      currentTarget: root,
      hysteresisPx: 6,
      parentByDarkParticleId: new Map([
        [1, null],
        [2, 1],
      ]),
      candidates: [
        { target: child, distance: 80, score: 4 },
        { target: root, distance: 120, score: 5 },
      ],
    })

    expect(target?.kind).toBe("darkParticle")
    expect(target && "darkParticleId" in target ? target.darkParticleId : null).toBe(2)
  })

  test("hover priority отпускает текущий target, когда другой стал существенно ближе", () => {
    const root: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 1,
      parentDarkParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      torusRadius: 1000,
      torusTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "darkParticle",
      darkParticleId: 2,
      parentDarkParticleId: 1,
      depth: 1,
      center: new Vector3(0, 0, 0),
      torusRadius: 700,
      torusTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkHoverPriorityTarget({
      currentTarget: child,
      hysteresisPx: 4,
      candidates: [
        { target: child, distance: 80, score: 11 },
        { target: root, distance: 120, score: 3 },
      ],
    })

    expect(target?.kind).toBe("darkParticle")
    expect(target && "darkParticleId" in target ? target.darkParticleId : null).toBe(1)
  })

  test("torus hit считается в реальном 3D, а не только по центральной z-плоскости", () => {
    const hit = resolveBulkPickHit(
      new Ray(new Vector3(1000, 0, 500), new Vector3(0, 0, -1).normalize()),
      {
        kind: "darkParticle",
        darkParticleId: 1,
        parentDarkParticleId: null,
        depth: 0,
        center: new Vector3(0, 0, 0),
        torusRadius: 1000,
        torusTube: 240,
        outerRadius: 1240,
      },
    )

    expect(hit).not.toBeNull()
  })

  test("считает новую позу камеры на центр выбранного Dark particle", () => {
    const pose = resolveBulkViewportFocusPose({
      currentPosition: new Vector3(3000, -2000, 1800),
      currentTarget: new Vector3(0, 0, 1100),
      nextTarget: new Vector3(1200, 600, 1100),
      focusRadius: 500,
      fovRad: (2 * Math.PI) / 5,
    })

    expect(pose.target).toEqual(new Vector3(1200, 600, 1100))
    expect(pose.position.distanceTo(pose.target)).toBeGreaterThan(850)
    expect(pose.position.z).toBeGreaterThan(pose.target.z)
  })

  test("считает стартовую позу камеры так, чтобы root помещался в portrait и landscape viewport", () => {
    const fovRad = (2 * Math.PI) / 5
    const radius = 2000
    const target = new Vector3(0, 0, 1100)
    const currentPosition = new Vector3(3975.6752784123818, -2981.756458809286, 1650)
    const currentTarget = target.clone()
    const portraitAspect = 400 / 871
    const landscapeAspect = 871 / 400
    const paddingRatio = 1.08

    const portrait = resolveBulkViewportFitPose({
      aspect: portraitAspect,
      currentPosition,
      currentTarget,
      fovRad,
      paddingRatio,
      radius,
      target,
    })
    const landscape = resolveBulkViewportFitPose({
      aspect: landscapeAspect,
      currentPosition,
      currentTarget,
      fovRad,
      paddingRatio,
      radius,
      target,
    })

    const halfVerticalFov = fovRad / 2
    const halfPortraitHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * portraitAspect)
    const expectedPortraitDistance = (radius * paddingRatio) / Math.tan(halfPortraitHorizontalFov)
    const expectedLandscapeDistance = (radius * paddingRatio) / Math.tan(halfVerticalFov)

    expect(portrait.position.distanceTo(portrait.target)).toBeCloseTo(expectedPortraitDistance, 6)
    expect(landscape.position.distanceTo(landscape.target)).toBeCloseTo(expectedLandscapeDistance, 6)
    expect(portrait.position.distanceTo(portrait.target)).toBeGreaterThan(landscape.position.distanceTo(landscape.target))
  })

  test("явный fitAxis вписывает сферу по ширине или высоте", () => {
    const fovRad = Math.PI / 2
    const radius = 100
    const target = new Vector3(0, 0, 0)
    const currentPosition = new Vector3(0, 0, 1000)
    const currentTarget = target.clone()
    const paddingRatio = 1

    const portraitWidth = resolveBulkViewportFitPose({
      aspect: 0.5,
      currentPosition,
      currentTarget,
      fitAxis: "width",
      fovRad,
      paddingRatio,
      radius,
      target,
    })
    const portraitHeight = resolveBulkViewportFitPose({
      aspect: 0.5,
      currentPosition,
      currentTarget,
      fitAxis: "height",
      fovRad,
      paddingRatio,
      radius,
      target,
    })
    const landscapeWidth = resolveBulkViewportFitPose({
      aspect: 2,
      currentPosition,
      currentTarget,
      fitAxis: "width",
      fovRad,
      paddingRatio,
      radius,
      target,
    })
    const landscapeHeight = resolveBulkViewportFitPose({
      aspect: 2,
      currentPosition,
      currentTarget,
      fitAxis: "height",
      fovRad,
      paddingRatio,
      radius,
      target,
    })

    expect(portraitWidth.position.distanceTo(portraitWidth.target)).toBeCloseTo(200, 6)
    expect(portraitHeight.position.distanceTo(portraitHeight.target)).toBeCloseTo(100, 6)
    expect(landscapeWidth.position.distanceTo(landscapeWidth.target)).toBeCloseTo(50, 6)
    expect(landscapeHeight.position.distanceTo(landscapeHeight.target)).toBeCloseTo(100, 6)
  })

  test("для стартовой позы камеры использует экранную проекцию root geometry, если переданы точки", () => {
    const fovRad = Math.PI / 2
    const target = new Vector3(0, 0, 0)
    const currentPosition = new Vector3(0, 0, 10)
    const currentTarget = target.clone()
    const up = new Vector3(0, 1, 0)
    const points = [
      new Vector3(-2, -1, 0),
      new Vector3(2, -1, 0),
      new Vector3(-2, 1, 0),
      new Vector3(2, 1, 0),
    ]

    const landscape = resolveBulkViewportFitPose({
      aspect: 2,
      currentPosition,
      currentTarget,
      fovRad,
      paddingRatio: 1,
      points,
      radius: 0.001,
      target,
      up,
    })
    const portrait = resolveBulkViewportFitPose({
      aspect: 0.5,
      currentPosition,
      currentTarget,
      fovRad,
      paddingRatio: 1,
      points,
      radius: 0.001,
      target,
      up,
    })

    expect(landscape.position.distanceTo(landscape.target)).toBeCloseTo(1, 6)
    expect(portrait.position.distanceTo(portrait.target)).toBeCloseTo(4, 6)
  })

  test("явный fitAxis выбирает сторону для geometry point fit", () => {
    const fovRad = Math.PI / 2
    const target = new Vector3(0, 0, 0)
    const currentPosition = new Vector3(0, 0, 10)
    const currentTarget = target.clone()
    const up = new Vector3(0, 1, 0)
    const points = [
      new Vector3(-3, -2, 0),
      new Vector3(3, -2, 0),
      new Vector3(-3, 2, 0),
      new Vector3(3, 2, 0),
    ]

    const widthFit = resolveBulkViewportFitPose({
      aspect: 2,
      currentPosition,
      currentTarget,
      fitAxis: "width",
      fovRad,
      paddingRatio: 1,
      points,
      radius: 0.001,
      target,
      up,
    })
    const heightFit = resolveBulkViewportFitPose({
      aspect: 2,
      currentPosition,
      currentTarget,
      fitAxis: "height",
      fovRad,
      paddingRatio: 1,
      points,
      radius: 0.001,
      target,
      up,
    })

    expect(widthFit.position.distanceTo(widthFit.target)).toBeCloseTo(1.5, 6)
    expect(heightFit.position.distanceTo(heightFit.target)).toBeCloseTo(2, 6)
  })

  test("для стартовой позы камеры центрирует экранный bounding-box root geometry", () => {
    const fovRad = Math.PI / 2
    const target = new Vector3(0, 0, 0)
    const currentPosition = new Vector3(0, 0, 10)
    const currentTarget = target.clone()
    const up = new Vector3(0, 1, 0)
    const points = [
      new Vector3(2, -1, 0),
      new Vector3(4, -1, 0),
      new Vector3(2, 1, 0),
      new Vector3(4, 1, 0),
    ]

    const pose = resolveBulkViewportFitPose({
      aspect: 2,
      currentPosition,
      currentTarget,
      fovRad,
      paddingRatio: 1,
      points,
      radius: 0.001,
      target,
      up,
    })

    expect(pose.target.x).toBeCloseTo(3, 6)
    expect(pose.position.x).toBeCloseTo(3, 6)
    expect(pose.position.distanceTo(pose.target)).toBeCloseTo(1, 6)
  })

  test("navigation fit может сохранить центр target, не центрируя bounding-box", () => {
    const fovRad = Math.PI / 2
    const target = new Vector3(0, 0, 0)
    const currentPosition = new Vector3(0, 0, 10)
    const currentTarget = target.clone()
    const up = new Vector3(0, 1, 0)
    const points = [
      new Vector3(2, -1, 0),
      new Vector3(4, -1, 0),
      new Vector3(2, 1, 0),
      new Vector3(4, 1, 0),
    ]

    const pose = resolveBulkViewportFitPose({
      aspect: 2,
      centerProjectedBounds: false,
      currentPosition,
      currentTarget,
      fovRad,
      paddingRatio: 1,
      points,
      radius: 0.001,
      target,
      up,
    })

    expect(pose.target).toEqual(target)
    expect(pose.position.x).toBeCloseTo(0, 6)
    expect(pose.position.distanceTo(pose.target)).toBeCloseTo(2, 6)
  })

  test("для очень маленького target не застревает на старом жестком минимуме дистанции", () => {
    const pose = resolveBulkViewportFocusPose({
      currentPosition: new Vector3(0, -400, 300),
      currentTarget: new Vector3(0, 0, 0),
      nextTarget: new Vector3(20, 10, 0),
      focusRadius: 10,
      fovRad: (2 * Math.PI) / 5,
    })

    const focusDistance = pose.position.distanceTo(pose.target)
    expect(focusDistance).toBeLessThan(25)
    expect(focusDistance).toBeGreaterThan(14)
  })

  test("для микротаргета уменьшает surface clearance пропорционально размеру", () => {
    const pose = resolveBulkViewportFocusPose({
      currentPosition: new Vector3(0, -60, 40),
      currentTarget: new Vector3(0, 0, 0),
      nextTarget: new Vector3(2, 1, 0),
      focusRadius: 0.5,
      fovRad: (2 * Math.PI) / 5,
    })

    const focusDistance = pose.position.distanceTo(pose.target)
    expect(focusDistance).toBeLessThan(3.2)
    expect(focusDistance).toBeGreaterThan(2.9)
  })
})
