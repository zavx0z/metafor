import {describe, expect, test} from "bun:test"
import {layout} from "./layout.ts"
import {placementCandidates} from "./place-graph.ts"
import {routeGraph} from "./route-graph.ts"
import type {PlacementInput} from "../types/placement.ts"
import type {LayoutGraph} from "../types/protocol.ts"

describe("compound spacing rhythm", () => {
  test("uses one declared spacing around child content in RIGHT and DOWN", () => {
    const spacing = 28
    const graph: Omit<LayoutGraph, "viewport"> = {
      nodes: [
        {id: "compound", width: 96, height: 30, contentHeight: 20},
        {id: "child", parentId: "compound", width: 40, height: 30},
      ],
      ports: [],
      edges: [],
      layoutOptions: {spacing, layerSpacing: spacing, padding: spacing, clearance: spacing},
    }

    for (const viewport of [{width: 900, height: 600}, {width: 390, height: 844}]) {
      const result = layout({...graph, viewport})
      const compound = result.nodes.find(({id}) => id === "compound")!
      const child = result.nodes.find(({id}) => id === "child")!

      expect(child.x - compound.x).toBe(spacing)
      expect(child.y - compound.y - 20).toBe(spacing)
      expect(compound.x + compound.width - child.x - child.width).toBe(spacing)
      expect(compound.y + compound.height - child.y - child.height).toBe(spacing)
      expect(compound.height).toBe(20 + spacing + 30 + spacing)
    }
  })

  test("rejects a content boundary below the measured node", () => {
    expect(() => layout({
      viewport: {width: 900, height: 600},
      nodes: [{id: "node", width: 96, height: 20, contentHeight: 21}],
      ports: [],
      edges: [],
    })).toThrow("node.contentHeight must not exceed height: node")
  })

  test("aligns connected sibling sockets when fact rows have different offsets", () => {
    const result = layout({
      viewport: {width: 899, height: 900},
      nodes: [
        {id: "owner", width: 96, height: 30, contentHeight: 20},
        {id: "source", parentId: "owner", width: 120, height: 100},
        {id: "target", parentId: "owner", width: 120, height: 100},
      ],
      ports: [
        {id: "source/out", nodeId: "source", y: 40},
        {id: "target/in", nodeId: "target", y: 68},
      ],
      edges: [{id: "message", sourcePortId: "source/out", targetPortId: "target/in"}],
      layoutOptions: {spacing: 28, layerSpacing: 28, padding: 28, clearance: 28},
    })
    const edge = result.edges[0]!.sections[0]!

    expect(edge.startPoint.y).toBe(edge.endPoint.y)
    expect(edge.bendPoints).toEqual([])
  })

  test("keeps a fanout row top-aligned and reserves one occupied track before the next row", () => {
    const spacing = 28
    const input: PlacementInput = {
      unitsPerPixel: 1,
      viewport: {width: 390, height: 844},
      clearance: spacing,
      padding: spacing,
      nodeSpacing: spacing,
      layerSpacing: spacing,
      outerPadding: spacing,
      nodes: [
        {id: "owner", size: {w: 100, h: 30}, contentHeight: 20},
        {id: "source", parentId: "owner", size: {w: 224, h: 274}, contentHeight: 274},
        {id: "target-a", parentId: "owner", size: {w: 206, h: 218}, contentHeight: 218},
        {id: "target-b", parentId: "owner", size: {w: 194, h: 218}, contentHeight: 218},
        {id: "zz-next-row", parentId: "owner", size: {w: 374, h: 464}, contentHeight: 464},
      ],
      ports: [
        {id: "source/a", nodeId: "source", offsetY: 196, side: "EAST", direction: "out"},
        {id: "source/b", nodeId: "source", offsetY: 168, side: "EAST", direction: "out"},
        {id: "source/next", nodeId: "source", offsetY: 224, side: "EAST", direction: "out"},
        {id: "target-a/in", nodeId: "target-a", offsetY: 196, side: "WEST", direction: "in"},
        {id: "target-b/in", nodeId: "target-b", offsetY: 196, side: "WEST", direction: "in"},
        {id: "zz-next-row/in", nodeId: "zz-next-row", offsetY: 168, side: "WEST", direction: "in"},
      ],
      edges: [
        {id: "a", sourcePortId: "source/a", targetPortId: "target-a/in"},
        {id: "b", sourcePortId: "source/b", targetPortId: "target-b/in"},
        {id: "next", sourcePortId: "source/next", targetPortId: "zz-next-row/in"},
      ],
    }
    const candidates = placementCandidates(input)
    const compact = candidates.filter((candidate) => {
      const rects = new Map(candidate.nodes.map(({id, rect}) => [id, rect]))
      const source = rects.get("source")!
      const targetA = rects.get("target-a")!
      const targetB = rects.get("target-b")!
      const next = rects.get("zz-next-row")!
      const overlapping = [source, targetA, targetB].filter((rect) =>
        Math.max(rect.x, next.x) < Math.min(rect.x + rect.w, next.x + next.w))
      const rowBottom = Math.max(...overlapping.map((rect) => rect.y + rect.h))
      return source.y === targetA.y && source.y === targetB.y && next.y - rowBottom === 2 * spacing
    })
    const routable = compact.filter((candidate) => {
      try {
        routeGraph(candidate.routeInput)
        return true
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("NO_LEGAL_ROUTE ")) return false
        throw error
      }
    })

    expect(compact.length).toBeGreaterThan(0)
    expect(routable.length).toBeGreaterThan(0)
  })

  test("reserves full-pitch outside tracks for cyclic reverse-flow edges", () => {
    const spacing = 28
    const graph: Omit<LayoutGraph, "viewport"> = {
      nodes: [
        {id: "browser", width: 120, height: 40},
        {id: "browser-leaf", parentId: "browser", width: 120, height: 100},
        {id: "server", width: 120, height: 40},
        {id: "server-leaf", parentId: "server", width: 120, height: 100},
      ],
      ports: [
        {id: "browser-forward", nodeId: "browser-leaf", y: 28},
        {id: "server-forward", nodeId: "server-leaf", y: 28},
        {id: "server-force", nodeId: "server-leaf", y: 56},
        {id: "server-oracle", nodeId: "server-leaf", y: 84},
        {id: "browser-force", nodeId: "browser-leaf", y: 56},
        {id: "browser-oracle", nodeId: "browser-leaf", y: 84},
      ],
      edges: [
        {id: "a-forward", sourcePortId: "browser-forward", targetPortId: "server-forward"},
        {id: "b-force", sourcePortId: "server-force", targetPortId: "browser-force"},
        {id: "c-oracle", sourcePortId: "server-oracle", targetPortId: "browser-oracle"},
      ],
      layoutOptions: {spacing, layerSpacing: spacing, padding: spacing, clearance: spacing},
    }

    for (const viewport of [{width: 900, height: 600}, {width: 390, height: 844}]) {
      const result = layout({...graph, viewport})
      const verticalSegments = result.edges.flatMap((edge) => edge.sections[0]!.bendPoints
        .map((point, index, bends) => [
          index === 0 ? edge.sections[0]!.startPoint : bends[index - 1]!,
          point,
        ] as const)
        .filter(([from, to]) => from.x === to.x && from.y !== to.y))
      const parallelXs = [...new Set(verticalSegments.map(([from]) => from.x))].sort((left, right) => left - right)

      expect(result.edges).toHaveLength(3)
      expect(parallelXs.some((x, index) => index > 0 && x - parallelXs[index - 1]! >= spacing)).toBeTrue()
    }
  })

  test("reserves full-pitch side tracks inside a cyclic compound", () => {
    const spacing = 28
    const graph: Omit<LayoutGraph, "viewport"> = {
      nodes: [
        {id: "owner", width: 120, height: 40},
        {id: "left", parentId: "owner", width: 120, height: 100},
        {id: "right", parentId: "owner", width: 120, height: 100},
      ],
      ports: [
        {id: "left-forward", nodeId: "left", y: 28},
        {id: "right-forward", nodeId: "right", y: 28},
        {id: "right-return-a", nodeId: "right", y: 56},
        {id: "right-return-b", nodeId: "right", y: 84},
        {id: "left-return-a", nodeId: "left", y: 56},
        {id: "left-return-b", nodeId: "left", y: 84},
      ],
      edges: [
        {id: "a-forward", sourcePortId: "left-forward", targetPortId: "right-forward"},
        {id: "b-return", sourcePortId: "right-return-a", targetPortId: "left-return-a"},
        {id: "c-return", sourcePortId: "right-return-b", targetPortId: "left-return-b"},
      ],
      layoutOptions: {spacing, layerSpacing: spacing, padding: spacing, clearance: spacing},
    }

    for (const viewport of [{width: 900, height: 600}, {width: 390, height: 844}]) {
      const result = layout({...graph, viewport})
      const owner = result.nodes.find(({id}) => id === "owner")!
      const left = result.nodes.find(({id}) => id === "left")!
      const right = result.nodes.find(({id}) => id === "right")!
      const childBottom = Math.max(left.y + left.height, right.y + right.height)
      const bottomGap = owner.y + owner.height - childBottom
      const bottomRoute = result.edges.some(({sections}) => {
        const section = sections[0]!
        const points = [section.startPoint, ...section.bendPoints, section.endPoint]
        return points.slice(1).some((to, index) => {
          const from = points[index]!
          return from.y === to.y && from.y > childBottom && from.y < owner.y + owner.height &&
            Math.max(Math.min(from.x, to.x), owner.x) < Math.min(Math.max(from.x, to.x), owner.x + owner.width)
        })
      })

      expect(result.edges).toHaveLength(3)
      expect(left.x - owner.x).toBeGreaterThanOrEqual(3 * spacing)
      expect(owner.x + owner.width - right.x - right.width).toBeGreaterThanOrEqual(3 * spacing)
      expect(bottomRoute ? bottomGap >= 3 * spacing : bottomGap === spacing).toBeTrue()
    }
  })

  test("keeps two pages connected to one shared worker routable in RIGHT and DOWN", () => {
    const graph: LayoutGraph = {
      viewport: {width: 722, height: 1088},
      layoutOptions: {clearance: 28, spacing: 28, layerSpacing: 28, padding: 28},
      nodes: [
        {id: "server-contour", width: 180, height: 66, contentHeight: 34},
        {id: "server:runtime", parentId: "server-contour", width: 224.5, height: 246, contentHeight: 236},
        {id: "browser:device", width: 194.25, height: 134, contentHeight: 124},
        {id: "page:realm", parentId: "browser:device", width: 312, height: 244, contentHeight: 234},
        {id: "page:realm-b", parentId: "browser:device", width: 238.8, height: 218, contentHeight: 208},
        {id: "service-worker:stable", parentId: "browser:device", width: 520, height: 440, contentHeight: 430},
        {id: "bun-process:main", parentId: "server-contour", width: 194.25, height: 218, contentHeight: 208},
        {id: "bun-process:worker", parentId: "server-contour", width: 205.75, height: 218, contentHeight: 208},
        {id: "window-main:realm", parentId: "page:realm", width: 210.45, height: 162, contentHeight: 152},
        {id: "window-main:realm-b", parentId: "page:realm-b", width: 180, height: 134, contentHeight: 124},
        {id: "peer-process:runtime", parentId: "server-contour", width: 245.2, height: 190, contentHeight: 180},
        {id: "dedicated-worker:runtime", parentId: "page:realm", width: 300.7, height: 190, contentHeight: 180},
        {id: "rtc-peer:session%3Aserver", parentId: "peer-process:runtime", width: 318.25, height: 218, contentHeight: 208},
        {id: "rtc-peer:session%3Abrowser", parentId: "window-main:realm", width: 326.05, height: 246, contentHeight: 236},
      ],
      ports: [
        {id: "bun-process:main\0in:IPC", nodeId: "bun-process:main", y: 196},
        {id: "bun-process:worker\0in:IPC", nodeId: "bun-process:worker", y: 196},
        {id: "dedicated-worker:runtime\0in:Worker", nodeId: "dedicated-worker:runtime", y: 168},
        {id: "page:realm\0in:MessagePort", nodeId: "page:realm", y: 194},
        {id: "page:realm\0out:Controller", nodeId: "page:realm", y: 222},
        {id: "page:realm-b\0in:MessagePort", nodeId: "page:realm-b", y: 168},
        {id: "page:realm-b\0out:Controller", nodeId: "page:realm-b", y: 196},
        {id: "peer-process:runtime\0in:IPC", nodeId: "peer-process:runtime", y: 168},
        {id: "rtc-peer:session%3Abrowser\0in:Force", nodeId: "rtc-peer:session%3Abrowser", y: 196},
        {id: "rtc-peer:session%3Abrowser\0in:Oracle", nodeId: "rtc-peer:session%3Abrowser", y: 224},
        {id: "rtc-peer:session%3Aserver\0out:Force", nodeId: "rtc-peer:session%3Aserver", y: 168},
        {id: "rtc-peer:session%3Aserver\0out:Oracle", nodeId: "rtc-peer:session%3Aserver", y: 196},
        {id: "server:runtime\0in:WS", nodeId: "server:runtime", y: 196},
        {id: "server:runtime\0out:IPC", nodeId: "server:runtime", y: 168},
        {id: "server:runtime\0out:WebPush", nodeId: "server:runtime", y: 224},
        {id: "service-worker:stable\0in:Controller", nodeId: "service-worker:stable", y: 362},
        {id: "service-worker:stable\0in:WebPush", nodeId: "service-worker:stable", y: 418},
        {id: "service-worker:stable\0out:MessagePort", nodeId: "service-worker:stable", y: 334},
        {id: "service-worker:stable\0out:WS", nodeId: "service-worker:stable", y: 390},
        {id: "window-main:realm\0out:Worker", nodeId: "window-main:realm", y: 140},
      ],
      edges: [
        {id: "ipc:0-peer", sourcePortId: "server:runtime\0out:IPC", targetPortId: "peer-process:runtime\0in:IPC"},
        {id: "ipc:1-main", sourcePortId: "server:runtime\0out:IPC", targetPortId: "bun-process:main\0in:IPC"},
        {id: "ipc:2-worker", sourcePortId: "server:runtime\0out:IPC", targetPortId: "bun-process:worker\0in:IPC"},
        {id: "web-push:worker", sourcePortId: "server:runtime\0out:WebPush", targetPortId: "service-worker:stable\0in:WebPush"},
        {id: "data-channel:force", sourcePortId: "rtc-peer:session%3Aserver\0out:Force", targetPortId: "rtc-peer:session%3Abrowser\0in:Force"},
        {id: "data-channel:oracle", sourcePortId: "rtc-peer:session%3Aserver\0out:Oracle", targetPortId: "rtc-peer:session%3Abrowser\0in:Oracle"},
        {id: "worker-message:worker", sourcePortId: "window-main:realm\0out:Worker", targetPortId: "dedicated-worker:runtime\0in:Worker"},
        {id: "websocket:control", sourcePortId: "service-worker:stable\0out:WS", targetPortId: "server:runtime\0in:WS"},
        {id: "controller:page", sourcePortId: "page:realm\0out:Controller", targetPortId: "service-worker:stable\0in:Controller"},
        {id: "message-port:page", sourcePortId: "service-worker:stable\0out:MessagePort", targetPortId: "page:realm\0in:MessagePort"},
        {id: "controller:page-b", sourcePortId: "page:realm-b\0out:Controller", targetPortId: "service-worker:stable\0in:Controller"},
        {id: "message-port:page-b", sourcePortId: "service-worker:stable\0out:MessagePort", targetPortId: "page:realm-b\0in:MessagePort"},
      ],
    }

    for (const viewport of [{width: 1088, height: 722}, {width: 722, height: 1088}]) {
      const input = {...graph, viewport}
      const result = layout(input)
      const permuted = layout({
        ...input,
        nodes: [...input.nodes].reverse(),
        ports: [...input.ports].reverse(),
        edges: [...input.edges].reverse(),
      })

      expect(result.edges).toHaveLength(12)
      expect(result.nodes).toHaveLength(14)
      expect(permuted).toEqual(result)
      if (viewport.height > viewport.width) {
        const owner = result.nodes.find(({id}) => id === "browser:device")!
        const directChildren = graph.nodes
          .filter(({parentId}) => parentId === "browser:device")
          .map(({id}) => result.nodes.find((node) => node.id === id)!)
        const childBottom = Math.max(...directChildren.map((node) => node.y + node.height))
        expect(owner.y + owner.height - childBottom).toBe(28)
      }
    }
  }, 15_000)
})
