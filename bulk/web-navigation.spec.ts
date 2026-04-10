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
  resolveBulkViewportFocusPose,
  type BulkPickTarget,
} from "./web-navigation"

describe("bulk web navigation", () => {
  test("по клику выбирает самый глубокий shell среди всех попавших под луч", () => {
    const targets: BulkPickTarget[] = [
      {
        kind: "shell",
        particleId: "root",
        parentParticleId: null,
        depth: 0,
        center: new Vector3(0, 0, 0),
        shellRadius: 1000,
        shellTube: 240,
        outerRadius: 1240,
      },
      {
        kind: "shell",
        particleId: "child",
        parentParticleId: "root",
        depth: 1,
        center: new Vector3(0, 1200, 0),
        shellRadius: 420,
        shellTube: 120,
        outerRadius: 540,
      },
    ]

    const hit = resolveBulkPickTarget(
      new Ray(new Vector3(420, 1200, -4000), new Vector3(0, 0, 1)),
      targets,
    )

    expect(hit?.kind).toBe("shell")
    expect(hit && "particleId" in hit ? hit.particleId : null).toBe("child")
  })

  test("у более глубокого shell приоритет выше даже если родитель попадает точнее", () => {
    const targets: BulkPickTarget[] = [
      {
        kind: "shell",
        particleId: "root",
        parentParticleId: null,
        depth: 0,
        center: new Vector3(0, 0, 0),
        shellRadius: 1000,
        shellTube: 240,
        outerRadius: 1240,
      },
      {
        kind: "shell",
        particleId: "child",
        parentParticleId: "root",
        depth: 2,
        center: new Vector3(0, 0, 0),
        shellRadius: 700,
        shellTube: 220,
        outerRadius: 920,
      },
    ]

    const hit = resolveBulkPickTarget(
      new Ray(new Vector3(760, 0, -4000), new Vector3(0, 0, 1)),
      targets,
    )

    expect(hit?.kind).toBe("shell")
    expect(hit && "particleId" in hit ? hit.particleId : null).toBe("child")
  })

  test("field sphere участвует в pick/hover наравне с shell", () => {
    const hit = resolveBulkPickTarget(
      new Ray(new Vector3(120, 40, -3000), new Vector3(0, 0, 1)),
      [
        {
          kind: "shell",
          particleId: "root",
          parentParticleId: null,
          depth: 0,
          center: new Vector3(0, 0, 0),
          shellRadius: 1000,
          shellTube: 240,
          outerRadius: 1240,
        },
        {
          kind: "field",
          particleId: "root",
          fieldId: "field-a",
          depth: 3,
          center: new Vector3(120, 40, 0),
          sphereRadius: 90,
          outerRadius: 90,
        },
      ],
    )

    expect(hit?.kind).toBe("field")
    expect(hit && "fieldId" in hit ? hit.fieldId : null).toBe("field-a")
  })

  test("hover retention не удерживает родителя, если найден более глубокий target", () => {
    const ray = new Ray(new Vector3(120, 40, -3000), new Vector3(0, 0, 1))
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const field: BulkPickTarget = {
      kind: "field",
      particleId: "root",
      fieldId: "field-a",
      depth: 3,
      center: new Vector3(120, 40, 0),
      sphereRadius: 90,
      outerRadius: 90,
    }

    const hit = resolveBulkHoverTarget(ray, [root, field], root)

    expect(hit?.kind).toBe("field")
    expect(hit && "fieldId" in hit ? hit.fieldId : null).toBe("field-a")
  })

  test("hover retention удерживает текущий target только если нового точного hit нет", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }

    const hit = resolveBulkHoverTarget(
      new Ray(new Vector3(1280, 0, -3000), new Vector3(0, 0, 1)),
      [root],
      root,
    )

    expect(hit?.kind).toBe("shell")
    expect(hit && "particleId" in hit ? hit.particleId : null).toBe("root")
  })

  test("при движении наружу удерживает child, пока он еще точно под курсором", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 700,
      shellTube: 160,
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
        ["root", null],
        ["child", "root"],
      ]),
    )

    expect(target?.kind).toBe("shell")
    expect(target && "particleId" in target ? target.particleId : null).toBe("child")
  })

  test("при движении наружу после выхода с child выбирает ближайшего родителя", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 700,
      shellTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkDirectionalHoverTarget(
      [{ target: root, distance: 140 }],
      child,
      1,
      new Map([
        ["root", null],
        ["child", "root"],
      ]),
    )

    expect(target?.kind).toBe("shell")
    expect(target && "particleId" in target ? target.particleId : null).toBe("root")
  })

  test("при движении внутрь выбирает ближайшего ребенка, а не самого глубокого потомка", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1200,
      shellTube: 240,
      outerRadius: 1440,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 900,
      shellTube: 180,
      outerRadius: 1080,
    }
    const grandchild: BulkPickTarget = {
      kind: "shell",
      particleId: "grandchild",
      parentParticleId: "child",
      depth: 2,
      center: new Vector3(0, 0, 0),
      shellRadius: 650,
      shellTube: 140,
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
        ["root", null],
        ["child", "root"],
        ["grandchild", "child"],
      ]),
    )

    expect(target?.kind).toBe("shell")
    expect(target && "particleId" in target ? target.particleId : null).toBe("child")
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
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 700,
      shellTube: 160,
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
    expect(pending.committedTarget && "particleId" in pending.committedTarget ? pending.committedTarget.particleId : null).toBe("child")
    expect(pending.pendingTarget && "particleId" in pending.pendingTarget ? pending.pendingTarget.particleId : null).toBe("root")

    const committed = resolveBulkHoverTransition({
      currentTarget: child,
      nextTarget: root,
      pendingTarget: pending.pendingTarget,
      pendingStartedAtMs: pending.pendingStartedAtMs,
      nowMs: 173,
      delayMs: 72,
    })
    expect(committed.committedTarget && "particleId" in committed.committedTarget ? committed.committedTarget.particleId : null).toBe("root")
    expect(committed.pendingTarget).toBeNull()
  })

  test("hover delay сбрасывается, если курсор вернулся на текущий target", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 700,
      shellTube: 160,
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

    expect(reset.committedTarget && "particleId" in reset.committedTarget ? reset.committedTarget.particleId : null).toBe("child")
    expect(reset.pendingTarget).toBeNull()
    expect(reset.pendingStartedAtMs).toBeNull()
  })

  test("hover priority выбирает target с меньшей экранной ошибкой, а не более глубокий по умолчанию", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 700,
      shellTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkHoverPriorityTarget({
      currentTarget: null,
      candidates: [
        { target: child, distance: 80, score: 12 },
        { target: root, distance: 120, score: 3 },
      ],
    })

    expect(target?.kind).toBe("shell")
    expect(target && "particleId" in target ? target.particleId : null).toBe("root")
  })

  test("hover priority при близких score предпочитает более глубокий child", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 700,
      shellTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkHoverPriorityTarget({
      currentTarget: null,
      candidates: [
        { target: child, distance: 80, score: 5.2 },
        { target: root, distance: 120, score: 4.4 },
      ],
    })

    expect(target?.kind).toBe("shell")
    expect(target && "particleId" in target ? target.particleId : null).toBe("child")
  })

  test("hover priority удерживает текущий target, пока новый не стал заметно ближе", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 700,
      shellTube: 160,
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

    expect(target?.kind).toBe("shell")
    expect(target && "particleId" in target ? target.particleId : null).toBe("child")
  })

  test("hover priority не дает родителю блокировать более точного child", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 700,
      shellTube: 160,
      outerRadius: 860,
    }

    const target = resolveBulkHoverPriorityTarget({
      currentTarget: root,
      hysteresisPx: 6,
      parentByParticleId: new Map([
        ["root", null],
        ["child", "root"],
      ]),
      candidates: [
        { target: child, distance: 80, score: 4 },
        { target: root, distance: 120, score: 5 },
      ],
    })

    expect(target?.kind).toBe("shell")
    expect(target && "particleId" in target ? target.particleId : null).toBe("child")
  })

  test("hover priority отпускает текущий target, когда другой стал существенно ближе", () => {
    const root: BulkPickTarget = {
      kind: "shell",
      particleId: "root",
      parentParticleId: null,
      depth: 0,
      center: new Vector3(0, 0, 0),
      shellRadius: 1000,
      shellTube: 240,
      outerRadius: 1240,
    }
    const child: BulkPickTarget = {
      kind: "shell",
      particleId: "child",
      parentParticleId: "root",
      depth: 1,
      center: new Vector3(0, 0, 0),
      shellRadius: 700,
      shellTube: 160,
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

    expect(target?.kind).toBe("shell")
    expect(target && "particleId" in target ? target.particleId : null).toBe("root")
  })

  test("torus hit считается в реальном 3D, а не только по центральной z-плоскости", () => {
    const hit = resolveBulkPickHit(
      new Ray(new Vector3(1000, 0, 500), new Vector3(0, 0, -1).normalize()),
      {
        kind: "shell",
        particleId: "root",
        parentParticleId: null,
        depth: 0,
        center: new Vector3(0, 0, 0),
        shellRadius: 1000,
        shellTube: 240,
        outerRadius: 1240,
      },
    )

    expect(hit).not.toBeNull()
  })

  test("считает новую позу камеры на центр выбранного shell", () => {
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
