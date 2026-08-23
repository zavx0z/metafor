import { describe, expect, test } from "bun:test"
import { Ray, Vector3 } from "@metafor/engine"
import {
  getBulkPickTargetKey,
  resolveBulkClickTarget,
  resolveBulkDirectionalHoverTarget,
  resolveBulkFieldProxyPickDepth,
  resolveBulkHoverDirection,
  resolveBulkHoverPriorityTarget,
  resolveBulkHoverTarget,
  resolveBulkHoverTransition,
  resolveBulkNavigationClickTarget,
  resolveBulkNavigationSurfaceTarget,
  resolveBulkOrbitalPickDepth,
  resolveBulkPickHit,
  resolveBulkPickTarget,
  resolveBulkProjectedSphereHoverScore,
  resolveBulkProjectedTorusHoverScore,
  resolveBulkViewportFitPose,
  resolveBulkViewportFocusPose,
} from "./web-navigation.ts"
import type { BulkPickTarget } from "@metafor/types/bulk/viewport"

describe("bulk web navigation", () => {
  test("hover выбирает самый глубокий Dark particle среди всех попавших под луч", () => {
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

  test("hover отдаёт приоритет более глубокому Dark particle при близком попадании", () => {
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
          fieldParticleId: "field:101",
          depth: 3,
          center: new Vector3(120, 40, 0),
          sphereRadius: 90,
          outerRadius: 90,
        },
      ],
    )

    expect(hit?.kind).toBe("fieldParticle")
    expect(hit && "fieldParticleId" in hit ? hit.fieldParticleId : null).toBe("field:101")
  })

  test("каждый orbital и Field proxy Mesh участвует в навигации со своей точной формой", () => {
    const targets: BulkPickTarget[] = [
      {
        center: new Vector3(300, 0, 0),
        depth: 2,
        form: "torus",
        kind: "orbitalParticle",
        orbitalParticleId: "orbital:state",
        outerRadius: 120,
        parentDarkParticleId: 1,
        torusRadius: 100,
        torusTube: 20,
      },
      {
        center: new Vector3(700, 0, 0),
        depth: 2,
        form: "sphere",
        kind: "orbitalParticle",
        orbitalParticleId: "orbital:process",
        outerRadius: 45,
        parentDarkParticleId: 1,
        sphereRadius: 45,
      },
      {
        center: new Vector3(1100, 0, 0),
        depth: 2,
        fieldProxyId: "proxy:torus",
        form: "torus",
        kind: "fieldProxy",
        outerRadius: 75,
        parentDarkParticleId: 1,
        torusRadius: 60,
        torusTube: 15,
      },
      {
        center: new Vector3(1400, 0, 0),
        depth: 2,
        fieldProxyId: "proxy:sphere",
        form: "sphere",
        kind: "fieldProxy",
        outerRadius: 35,
        parentDarkParticleId: 1,
        sphereRadius: 35,
      },
    ]

    const targetKeyAt = (x: number): string | null => {
      const target = resolveBulkPickTarget(
        new Ray(new Vector3(x, 0, -500), new Vector3(0, 0, 1)),
        targets,
      )
      return target ? getBulkPickTargetKey(target) : null
    }

    expect(targetKeyAt(400)).toBe("orbitalParticle:orbital:state")
    expect(targetKeyAt(700)).toBe("orbitalParticle:orbital:process")
    expect(targetKeyAt(1160)).toBe("fieldProxy:proxy:torus")
    expect(targetKeyAt(1400)).toBe("fieldProxy:proxy:sphere")
  })

  test("вложенная сфера и Process Torus имеют приоритет над окружающим State Torus", () => {
    const stateDepth = resolveBulkOrbitalPickDepth(0, "state")
    const processDepth = resolveBulkOrbitalPickDepth(0, "process")
    const proxyDepth = resolveBulkFieldProxyPickDepth(0)
    const state: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      depth: stateDepth,
      form: "torus",
      kind: "orbitalParticle",
      orbitalParticleId: "orbital:state",
      outerRadius: 140,
      parentDarkParticleId: 1,
      torusRadius: 100,
      torusTube: 40,
    }
    const process: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      depth: processDepth,
      form: "torus",
      kind: "orbitalParticle",
      orbitalParticleId: "orbital:process",
      outerRadius: 80,
      parentDarkParticleId: 1,
      torusRadius: 60,
      torusTube: 20,
    }
    const proxy: BulkPickTarget = {
      center: new Vector3(60, 0, 0),
      depth: proxyDepth,
      fieldProxyId: "proxy:sphere",
      form: "sphere",
      kind: "fieldProxy",
      outerRadius: 5,
      parentDarkParticleId: 1,
      sphereRadius: 5,
    }
    const ray = new Ray(
      new Vector3(60, 0, -500),
      new Vector3(0, 0, 1),
    )

    expect(stateDepth).toBe(1)
    expect(processDepth).toBe(2)
    expect(resolveBulkOrbitalPickDepth(0, "reaction")).toBe(2)
    expect(resolveBulkOrbitalPickDepth(0, "axion")).toBe(2)
    expect(resolveBulkOrbitalPickDepth(0, "finally")).toBe(2)
    expect(proxyDepth).toBe(3)
    expect(getBulkPickTargetKey(
      resolveBulkPickTarget(ray, [state, process])!,
    )).toBe("orbitalParticle:orbital:process")
    expect(getBulkPickTargetKey(
      resolveBulkPickTarget(ray, [state, process, proxy])!,
    )).toBe("fieldProxy:proxy:sphere")
  })

  test("клик с вложенного Field по телу родительского State Torus выбирает родителя", () => {
    const parent: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      depth: 1,
      form: "torus",
      kind: "orbitalParticle",
      orbitalParticleId: "orbital:parent-state",
      outerRadius: 120,
      parentDarkParticleId: 1,
      torusRadius: 100,
      torusTube: 20,
    }
    const currentField: BulkPickTarget = {
      center: new Vector3(100, 0, 100),
      depth: 3,
      fieldProxyId: "proxy:current-field",
      form: "sphere",
      kind: "fieldProxy",
      outerRadius: 20,
      parentDarkParticleId: 1,
      sphereRadius: 20,
    }
    const ray = new Ray(
      new Vector3(100, 0, -500),
      new Vector3(0, 0, 1),
    )

    expect(getBulkPickTargetKey(
      resolveBulkClickTarget(ray, [currentField, parent])!,
    )).toBe("orbitalParticle:orbital:parent-state")
  })

  test("клик через отверстие родительского State Torus остаётся доступен вложенному Field", () => {
    const parent: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      depth: 1,
      form: "torus",
      kind: "orbitalParticle",
      orbitalParticleId: "orbital:parent-state",
      outerRadius: 120,
      parentDarkParticleId: 1,
      torusRadius: 100,
      torusTube: 20,
    }
    const field: BulkPickTarget = {
      center: new Vector3(0, 0, 100),
      depth: 3,
      fieldProxyId: "proxy:field-through-hole",
      form: "sphere",
      kind: "fieldProxy",
      outerRadius: 20,
      parentDarkParticleId: 1,
      sphereRadius: 20,
    }
    const ray = new Ray(
      new Vector3(0, 0, -500),
      new Vector3(0, 0, 1),
    )

    expect(getBulkPickTargetKey(
      resolveBulkClickTarget(ray, [parent, field])!,
    )).toBe("fieldProxy:proxy:field-through-hole")
  })

  test("клик с родительского Torus по вложенному Field приближает к Field", () => {
    const parent: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      depth: 1,
      form: "torus",
      kind: "orbitalParticle",
      orbitalParticleId: "orbital:parent-state",
      outerRadius: 120,
      parentDarkParticleId: 1,
      torusRadius: 100,
      torusTube: 20,
    }
    const field: BulkPickTarget = {
      center: new Vector3(0, 0, 100),
      depth: 3,
      fieldProxyId: "proxy:target-field",
      form: "sphere",
      kind: "fieldProxy",
      outerRadius: 20,
      parentDarkParticleId: 1,
      sphereRadius: 20,
    }

    expect(getBulkPickTargetKey(resolveBulkNavigationClickTarget(
      parent,
      field,
      parent,
    )!)).toBe("fieldProxy:proxy:target-field")
  })

  test("клик с вложенного Field по поверхности родителя отдаляет к родителю", () => {
    const parent: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      depth: 1,
      form: "torus",
      kind: "orbitalParticle",
      orbitalParticleId: "orbital:parent-state",
      outerRadius: 120,
      parentDarkParticleId: 1,
      torusRadius: 100,
      torusTube: 20,
    }
    const field: BulkPickTarget = {
      center: new Vector3(100, 0, 100),
      depth: 3,
      fieldProxyId: "proxy:current-field",
      form: "sphere",
      kind: "fieldProxy",
      outerRadius: 20,
      parentDarkParticleId: 1,
      sphereRadius: 20,
    }

    expect(getBulkPickTargetKey(resolveBulkNavigationClickTarget(
      field,
      field,
      parent,
    )!)).toBe("orbitalParticle:orbital:parent-state")
  })

  test("отдельный Field под указателем не заменяется внешним root Torus", () => {
    const root: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      darkParticleId: 1,
      depth: 0,
      kind: "darkParticle",
      outerRadius: 1200,
      parentDarkParticleId: null,
      torusRadius: 1000,
      torusTube: 200,
    }
    const focusedAtom: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      darkParticleId: 2,
      depth: 1,
      kind: "darkParticle",
      outerRadius: 300,
      parentDarkParticleId: 1,
      torusRadius: 250,
      torusTube: 50,
    }
    const field: BulkPickTarget = {
      center: new Vector3(100, 0, 0),
      depth: 2,
      fieldParticleId: "field:inside-focused-atom",
      kind: "fieldParticle",
      outerRadius: 20,
      parentDarkParticleId: 2,
      sphereRadius: 20,
    }

    expect(getBulkPickTargetKey(resolveBulkNavigationClickTarget(
      focusedAtom,
      field,
      root,
    )!)).toBe("fieldParticle:field:inside-focused-atom")
  })

  test("клик с Field по другому Field не отлетает к внешнему Torus", () => {
    const root: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      darkParticleId: 1,
      depth: 0,
      kind: "darkParticle",
      outerRadius: 1200,
      parentDarkParticleId: null,
      torusRadius: 1000,
      torusTube: 200,
    }
    const currentField: BulkPickTarget = {
      center: new Vector3(-100, 0, 0),
      depth: 2,
      fieldParticleId: "field:current",
      kind: "fieldParticle",
      outerRadius: 20,
      parentDarkParticleId: 2,
      sphereRadius: 20,
    }
    const nextField: BulkPickTarget = {
      center: new Vector3(100, 0, 0),
      depth: 2,
      fieldParticleId: "field:next",
      kind: "fieldParticle",
      outerRadius: 20,
      parentDarkParticleId: 2,
      sphereRadius: 20,
    }

    expect(getBulkPickTargetKey(resolveBulkNavigationClickTarget(
      currentField,
      nextField,
      root,
    )!)).toBe("fieldParticle:field:next")
  })

  test("внутри нескольких Tori выход с Field выбирает ближайший visual parent, а не root", () => {
    const root: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      darkParticleId: 1,
      depth: 0,
      kind: "darkParticle",
      outerRadius: 1200,
      parentDarkParticleId: null,
      torusRadius: 1000,
      torusTube: 200,
    }
    const atom: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      darkParticleId: 2,
      depth: 1,
      kind: "darkParticle",
      outerRadius: 600,
      parentDarkParticleId: 1,
      torusRadius: 500,
      torusTube: 100,
    }
    const state: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      depth: 2,
      form: "torus",
      kind: "orbitalParticle",
      orbitalParticleId: "orbital:state-parent",
      outerRadius: 300,
      parentDarkParticleId: 2,
      torusRadius: 250,
      torusTube: 50,
    }
    const currentField: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      depth: 3,
      fieldProxyId: "proxy:current",
      form: "sphere",
      kind: "fieldProxy",
      outerRadius: 20,
      parentDarkParticleId: 2,
      sphereRadius: 20,
    }

    const surface = resolveBulkNavigationSurfaceTarget(currentField, [
      {distance: 0, target: root},
      {distance: 0, target: atom},
      {distance: 0, target: state},
      {distance: 10, target: currentField},
    ])

    expect(getBulkPickTargetKey(surface!)).toBe("orbitalParticle:orbital:state-parent")
    expect(getBulkPickTargetKey(resolveBulkNavigationClickTarget(
      currentField,
      null,
      surface,
    )!)).toBe("orbitalParticle:orbital:state-parent")
  })

  test("выход со State внутри корневого Torus останавливается на Atom", () => {
    const root: BulkPickTarget = {
      center: new Vector3(), darkParticleId: 1, depth: 0, kind: "darkParticle",
      outerRadius: 1200, parentDarkParticleId: null, torusRadius: 1000, torusTube: 200,
    }
    const atom: BulkPickTarget = {
      center: new Vector3(), darkParticleId: 2, depth: 1, kind: "darkParticle",
      outerRadius: 600, parentDarkParticleId: 1, torusRadius: 500, torusTube: 100,
    }
    const state: BulkPickTarget = {
      center: new Vector3(), depth: 2, form: "torus", kind: "orbitalParticle",
      orbitalParticleId: "orbital:state", outerRadius: 300,
      parentDarkParticleId: 2, torusRadius: 250, torusTube: 50,
    }

    expect(getBulkPickTargetKey(resolveBulkNavigationSurfaceTarget(state, [
      {distance: 0, target: root},
      {distance: 0, target: atom},
      {distance: 10, target: state},
    ])!)).toBe("darkParticle:2")
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
      fieldParticleId: "field:101",
      depth: 3,
      center: new Vector3(120, 40, 0),
      sphereRadius: 90,
      outerRadius: 90,
    }

    const hit = resolveBulkHoverTarget(ray, [root, fieldParticle], root)

    expect(hit?.kind).toBe("fieldParticle")
    expect(hit && "fieldParticleId" in hit ? hit.fieldParticleId : null).toBe("field:101")
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

  test("на одном visual depth выбирает сферу точно под курсором, а не ближайшую к камере соседнюю сферу", () => {
    const selected: BulkPickTarget = {
      center: new Vector3(0, 0, 0),
      depth: 3,
      fieldProxyId: "proxy:selected",
      form: "sphere",
      kind: "fieldProxy",
      outerRadius: 5,
      parentDarkParticleId: 1,
      sphereRadius: 5,
    }
    const nearer: BulkPickTarget = {
      center: new Vector3(10, 0, -20),
      depth: 3,
      fieldProxyId: "proxy:nearer",
      form: "sphere",
      kind: "fieldProxy",
      outerRadius: 5,
      parentDarkParticleId: 1,
      sphereRadius: 5,
    }

    const target = resolveBulkHoverPriorityTarget({
      currentTarget: nearer,
      candidates: [
        {target: selected, distance: 120, score: 0},
        {target: nearer, distance: 80, score: 1},
      ],
    })

    expect(target && getBulkPickTargetKey(target))
      .toBe("fieldProxy:proxy:selected")
  })

  test("projected score измеряет центр Sphere и осевую окружность Torus", () => {
    expect(resolveBulkProjectedSphereHoverScore(
      {x: 100, y: 80},
      100,
      80,
    )).toBe(0)
    expect(resolveBulkProjectedSphereHoverScore(
      {x: 100, y: 80},
      106,
      88,
    )).toBe(10)
    expect(resolveBulkProjectedTorusHoverScore(
      {x: 100, y: 80},
      20,
      40,
      130,
      80,
    )).toBe(0)
    expect(resolveBulkProjectedTorusHoverScore(
      {x: 100, y: 80},
      20,
      40,
      100,
      80,
    )).toBe(30)
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
