import {describe, expect, test} from "bun:test"
import {
  HamiltonianLifecycleRetainedJournal,
  HamiltonianLifecycleSource,
  createHamiltonianLifecycleObservation,
} from "../../core/lifecycle.js"
import {
  HamiltonianLifecycleProjection,
  hamiltonianLifecycleNeedsDocument,
  hamiltonianServerNodeId,
  nodeSystemStructureKey,
  refreshPositionedNodeSystem,
} from "./lifecycle-projection.ts"
import type {PositionedNodeSystem} from "nodes/types"

const context = {
  origin: "http://127.0.0.1:4400",
  deviceId: "device-a",
  tabId: "tab-a",
  pageIncarnation: "page-a",
  observedAt: 11,
  navigationId: "navigation-a",
  servedAt: 10,
  server: {identity: "hamiltonian-lab", hostEpoch: "host-a", version: "v1"},
}

describe("Hamiltonian lifecycle projection", () => {
  test("starts with only the guaranteed server and current page", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    expect(projection.document()).toMatchObject({
      nodes: [
        {id: "server-contour", title: "Сервер"},
        {id: "server:host-a", parentId: "server-contour", title: "Hamiltonian"},
        {id: "page:page-a", title: "Эта страница"},
      ],
      edges: [],
    })
    const serverContour = projection.document().nodes[0]!
    expect(serverContour.facts).toBeUndefined()
    expect(serverContour.ports).toBeUndefined()
    expect(serverContour.actions).toBeUndefined()
    expect(hamiltonianServerNodeId("host/a")).toBe("server:host%2Fa")
  })

  test("invalidates layout geometry when model order changes", () => {
    const base = {
      nodes: [
        {id: "a", title: "A", order: 1, facts: [{id: "out", label: "Out", value: ""}], ports: [{id: "out", parameterId: "out", direction: "out" as const}]},
        {id: "b", title: "B", order: 2, facts: [{id: "in", label: "In", value: ""}], ports: [{id: "in", parameterId: "in", direction: "in" as const}]},
      ],
      edges: [{id: "edge", source: {nodeId: "a", portId: "out"}, target: {nodeId: "b", portId: "in"}, order: 1}],
    }
    expect(nodeSystemStructureKey(base)).not.toBe(nodeSystemStructureKey({
      ...base,
      nodes: [base.nodes[0]!, {...base.nodes[1]!, order: 0}],
    }))
    expect(nodeSystemStructureKey(base)).not.toBe(nodeSystemStructureKey({
      ...base,
      edges: [{...base.edges[0]!, order: 2}],
    }))
  })

  test("keeps presentation socket order while refreshing live fact values", () => {
    const previousNode = {
      id: "a",
      title: "A",
      facts: [
        {id: "left", label: "Left", value: "old-left"},
        {id: "identity", label: "Identity", value: "old"},
        {id: "right", label: "Right", value: "old-right"},
      ],
      ports: [
        {id: "left-port", parameterId: "left", direction: "out" as const},
        {id: "right-port", parameterId: "right", direction: "out" as const},
      ],
    }
    const layout: PositionedNodeSystem = {
      bounds: {x: 0, y: 0, w: 100, h: 100},
      nodes: [{node: previousNode, rect: {x: 0, y: 0, w: 100, h: 100}, ports: []}],
      edges: [],
    }
    const refreshed = refreshPositionedNodeSystem(layout, {
      nodes: [{
        ...previousNode,
        facts: [
          {id: "right", label: "Right", value: "new-right"},
          {id: "identity", label: "Identity", value: "new"},
          {id: "left", label: "Left", value: "new-left"},
        ],
      }],
      edges: [],
    })
    expect(refreshed.nodes[0]!.node.facts).toEqual([
      {id: "left", label: "Left", value: "new-left"},
      {id: "identity", label: "Identity", value: "new"},
      {id: "right", label: "Right", value: "new-right"},
    ])
  })

  test("nests the page and an attached Service Worker under the observed Chrome runtime", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const page = new HamiltonianLifecycleSource({
      id: "page:page-a",
      kind: "page",
      incarnation: "page-a",
      startedAt: 11,
    })
    const worker = new HamiltonianLifecycleSource({
      id: "service-worker:sw-a",
      kind: "service-worker",
      incarnation: "sw-a",
      startedAt: 20,
    })
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "browser:device-a",
      subjectKind: "browser-runtime",
      ownerId: "browser:device-a",
      attributes: {deviceId: "device-a", runtime: "Chrome", state: "active"},
    })), null)
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "page:page-a",
      subjectKind: "page",
      ownerId: "browser:device-a",
      attributes: {incarnation: "page-a", state: "live"},
    })), null)
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "service-worker:sw-a",
      subjectKind: "service-worker",
      ownerId: "browser:device-a",
      attributes: {incarnation: "sw-a", state: "evaluating"},
    })), null)

    expect(projection.document().nodes.find(({id}) => id === "page:page-a")?.parentId)
      .toBe("browser:device-a")
    expect(projection.document().nodes.find(({id}) => id === "service-worker:sw-a")?.parentId)
      .toBe("browser:device-a")

    const document = projection.document()
    expect(document.nodes.find(({id}) => id === "browser:device-a")).toMatchObject({
      title: "Chrome",
      kind: "user-agent runtime",
    })
    expect(document.nodes.find(({id}) => id === "service-worker:sw-a")?.parentId)
      .toBe("browser:device-a")
    expect(document.edges).toEqual([])
    expect(JSON.stringify(document)).not.toContain("Профиль браузера")
  })

  test("keeps the locally observed browser runtime when a late retained snapshot missed its birth", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const page = new HamiltonianLifecycleSource({
      id: "page:page-a",
      kind: "page",
      incarnation: "page-a",
      startedAt: 11,
    })
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "browser:device-a",
      subjectKind: "browser-runtime",
      ownerId: "browser:device-a",
      attributes: {deviceId: "device-a", runtime: "Chrome", state: "active"},
    })), null)

    const lateJournal = new HamiltonianLifecycleRetainedJournal("page:page-a")
    lateJournal.observe(page.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "page:page-a",
      subjectKind: "page",
      ownerId: "browser:device-a",
      attributes: {incarnation: "page-a", state: "live"},
    })))
    projection.replaceSnapshot(lateJournal.snapshot())

    expect(projection.document().nodes.find(({id}) => id === "browser:device-a")).toMatchObject({
      title: "Chrome",
      kind: "user-agent runtime",
    })
    expect(projection.document().nodes.find(({id}) => id === "page:page-a")?.parentId)
      .toBe("browser:device-a")
  })

  test("materializes one Service Worker identity and its exact WebSocket only from owner events", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const source = new HamiltonianLifecycleSource({
      id: "service-worker:sw-a",
      kind: "service-worker",
      incarnation: "sw-a",
      startedAt: 20,
    })
    const born = source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "service-worker:sw-a",
      subjectKind: "service-worker",
      ownerId: "service-worker:sw-a",
      attributes: {
        identity: "sw-a",
        runtimeIncarnation: "runtime-a",
        state: "active",
        push: "ready",
        heartbeat: "observed",
        heartbeatSequence: 2,
      },
    }), {at: 20})
    projection.observe(born, null)
    expect(projection.document().nodes.map((node) => node.title)).toEqual([
      "Сервер",
      "Hamiltonian",
      "Эта страница",
      "Service Worker",
    ])
    const serviceWorkerNode = projection.document().nodes.find(({id}) => id === "service-worker:sw-a")
    expect(serviceWorkerNode?.kind).toBeUndefined()
    expect(serviceWorkerNode?.facts).toContainEqual({id: "identity", label: "Identity", value: "sw-a"})
    expect(serviceWorkerNode?.facts).toContainEqual({id: "runtimeIncarnation", label: "Исполнение", value: "runtime-a"})
    expect(serviceWorkerNode?.facts).toContainEqual({id: "push", label: "Push", value: "ready"})
    expect(serviceWorkerNode?.actions).toContainEqual({id: "enable-push", label: "Настроить Web Push", tone: "neutral"})
    expect(serviceWorkerNode?.facts).toContainEqual({id: "state", label: "Состояние", value: "active"})
    expect(serviceWorkerNode?.facts).not.toContainEqual(expect.objectContaining({label: "Непрерывность"}))
    expect(serviceWorkerNode?.facts).toContainEqual({id: "heartbeat", label: "Heartbeat", value: "observed"})
    expect(serviceWorkerNode?.facts).toContainEqual({id: "heartbeatSequence", label: "Heartbeat №", value: "2"})
    expect(projection.document().edges).toEqual([])

    const opening = source.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opening",
      subjectId: "websocket:socket-a",
      subjectKind: "websocket",
      ownerId: "service-worker:sw-a",
      sourceEntityId: "service-worker:sw-a",
      targetEntityId: "server:host-a",
      transportId: "websocket:socket-a",
      attributes: {socketIncarnation: "socket-a"},
    }), {at: 21, causedBy: born.eventId})
    projection.observe(opening, null)
    expect(projection.document().edges).toEqual([expect.objectContaining({
      id: "websocket:socket-a",
      source: expect.objectContaining({nodeId: "service-worker:sw-a"}),
      target: expect.objectContaining({nodeId: "server:host-a"}),
      tone: "paused",
    })])

    projection.observe(source.next(createHamiltonianLifecycleObservation({
      ...opening.observation,
      phase: "opened",
      attributes: {socketIncarnation: "socket-a", connectionId: "connection-a"},
    }), {at: 22}), null)
    expect(projection.document().edges[0]?.tone).toBe("live")
    expect(projection.document().nodes.find(({id}) => id === "service-worker:sw-a")?.facts)
      .toContainEqual(expect.objectContaining({label: "WS", value: "вход / выход"}))
  })

  test("keeps a closed transport inactive until an endpoint ends or a new incarnation replaces it", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const source = new HamiltonianLifecycleSource({id: "sw", kind: "service-worker", incarnation: "sw", startedAt: 1})
    for (const envelope of [
      source.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: "service-worker:sw", subjectKind: "service-worker", ownerId: "service-worker:sw",
      })),
      source.next(createHamiltonianLifecycleObservation({
        type: "transport", phase: "opened", subjectId: "websocket:one", subjectKind: "websocket", ownerId: "service-worker:sw",
        sourceEntityId: "service-worker:sw", targetEntityId: "server:host-a", transportId: "websocket:one", attributes: {protocol: "ws"},
      })),
    ]) projection.observe(envelope, null)
    expect(JSON.stringify(projection.document())).not.toContain("Профиль браузера")
    expect(projection.document().edges).toHaveLength(1)

    projection.observe(source.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "closed", subjectId: "websocket:one", subjectKind: "websocket", ownerId: "service-worker:sw",
      sourceEntityId: "service-worker:sw", targetEntityId: "server:host-a", transportId: "websocket:one",
    })), null)
    expect(projection.document().edges).toEqual([expect.objectContaining({
      id: "websocket:one",
      label: "WS",
      tone: "paused",
    })])
    const failedWorker = projection.document().nodes.find(({id}) => id === "service-worker:sw")
    expect(failedWorker?.tone).toBe("warn")
    expect(failedWorker?.facts).toContainEqual({id: "state", label: "Состояние", value: "error"})
    expect(failedWorker?.facts).toContainEqual({id: "heartbeat", label: "Heartbeat", value: "failed"})
    expect(projection.takeRetiredTransportIds()).toEqual(["websocket:one"])
    expect(projection.takeRetiredTransportIds()).toEqual([])

    expect(projection.observe(source.next(createHamiltonianLifecycleObservation({
      type: "message", phase: "sent", subjectId: "message:late", subjectKind: "control-message", ownerId: "service-worker:sw",
      sourceEntityId: "service-worker:sw", targetEntityId: "server:host-a", transportId: "websocket:one",
      messageId: "message:late", messageClass: "window-heartbeat",
    })), null)).toBeNull()

    projection.observe(source.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "opened", subjectId: "websocket:two", subjectKind: "websocket", ownerId: "service-worker:sw",
      sourceEntityId: "service-worker:sw", targetEntityId: "server:host-a", transportId: "websocket:two", attributes: {protocol: "ws"},
    })), null)
    expect(projection.document().edges).toEqual([expect.objectContaining({
      id: "websocket:two",
      tone: "live",
    })])
    expect(projection.document().nodes.find(({id}) => id === "service-worker:sw")?.tone).toBe("live")

    projection.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "ended", subjectId: "service-worker:sw", subjectKind: "service-worker", ownerId: "service-worker:sw",
    })), null)
    expect(projection.document().edges).toEqual([])
  })

  test("keeps one Service Worker node through standby and a new browser-managed execution", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const firstRuntime = new HamiltonianLifecycleSource({
      id: "service-worker:stable",
      kind: "service-worker",
      incarnation: "runtime-a",
      startedAt: 1,
    })
    projection.observe(firstRuntime.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "browser:device-a",
      subjectKind: "browser-runtime",
      ownerId: "browser:device-a",
      attributes: {deviceId: "device-a", runtime: "Chrome", state: "active"},
    })), null)
    projection.observe(firstRuntime.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "service-worker:stable",
      subjectKind: "service-worker",
      ownerId: "browser:device-a",
      attributes: {identity: "stable", runtimeIncarnation: "runtime-a", state: "active", push: "ready"},
    })), null)
    projection.observe(firstRuntime.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: "websocket:first",
      subjectKind: "websocket",
      ownerId: "service-worker:stable",
      sourceEntityId: "service-worker:stable",
      targetEntityId: "server:host-a",
      transportId: "websocket:first",
    })), null)
    projection.observe(firstRuntime.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "closed",
      subjectId: "websocket:first",
      subjectKind: "websocket",
      ownerId: "service-worker:stable",
      sourceEntityId: "service-worker:stable",
      targetEntityId: "server:host-a",
      transportId: "websocket:first",
    })), null)
    projection.observe(firstRuntime.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: "service-worker:stable",
      subjectKind: "service-worker",
      ownerId: "browser:device-a",
      attributes: {identity: "stable", runtimeIncarnation: "runtime-a", state: "standby", push: "ready"},
    })), null)
    expect(projection.document().nodes.find(({id}) => id === "service-worker:stable")?.tone).toBe("paused")
    expect(projection.document().nodes.find(({id}) => id === "service-worker:stable")?.parentId)
      .toBe("browser:device-a")

    const secondRuntime = new HamiltonianLifecycleSource({
      id: "service-worker:stable",
      kind: "service-worker",
      incarnation: "runtime-b",
      startedAt: 2,
    })
    projection.observe(secondRuntime.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: "service-worker:stable",
      subjectKind: "service-worker",
      ownerId: "browser:device-a",
      attributes: {identity: "stable", runtimeIncarnation: "runtime-b", state: "active", push: "received"},
    })), null)
    const workers = projection.document().nodes.filter(({id}) => id === "service-worker:stable")
    expect(workers).toHaveLength(1)
    expect(workers[0]?.parentId).toBe("browser:device-a")
    expect(workers[0]?.facts).toContainEqual({id: "runtimeIncarnation", label: "Исполнение", value: "runtime-b"})
    expect(workers[0]?.facts).toContainEqual({id: "push", label: "Push", value: "received"})
  })

  test("materializes an already closed retained WS for a late subscriber", () => {
    const source = new HamiltonianLifecycleSource({id: "sw", kind: "service-worker", incarnation: "sw", startedAt: 1})
    const journal = new HamiltonianLifecycleRetainedJournal("service-worker:sw")
    for (const envelope of [
      source.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: "service-worker:sw", subjectKind: "service-worker", ownerId: "service-worker:sw",
      })),
      source.next(createHamiltonianLifecycleObservation({
        type: "transport", phase: "opened", subjectId: "websocket:retained", subjectKind: "websocket", ownerId: "service-worker:sw",
        sourceEntityId: "service-worker:sw", targetEntityId: "server:host-a", transportId: "websocket:retained",
        attributes: {socketIncarnation: "retained", protocol: "wss"},
      })),
      source.next(createHamiltonianLifecycleObservation({
        type: "transport", phase: "closed", subjectId: "websocket:retained", subjectKind: "websocket", ownerId: "service-worker:sw",
        sourceEntityId: "service-worker:sw", targetEntityId: "server:host-a", transportId: "websocket:retained",
        attributes: {socketIncarnation: "retained", protocol: "wss", code: 1006, reason: "network"},
      })),
    ]) journal.observe(envelope)

    const lateProjection = new HamiltonianLifecycleProjection(context)
    lateProjection.replaceSnapshot(journal.snapshot())
    expect(lateProjection.document().edges).toEqual([expect.objectContaining({
      id: "websocket:retained",
      label: "WSS",
      tone: "paused",
    })])
  })

  test("replaces retained structure at its causal frontier without regressing newer live state", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const processId = "peer-process:retained"
    const transportId = "ipc:retained"
    const source = new HamiltonianLifecycleSource({
      id: processId,
      kind: "peer-process",
      incarnation: "retained",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal("server:host-a")
    const born = source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: processId,
      subjectKind: "peer-process",
      ownerId: "server:host-a",
      attributes: {state: "starting"},
    }))
    const opened = source.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: transportId,
      subjectKind: "ipc",
      ownerId: processId,
      sourceEntityId: "server:host-a",
      targetEntityId: processId,
      transportId,
    }))
    journal.observe(born)
    journal.observe(opened)
    const first = journal.snapshot()
    projection.replaceSnapshot(first)
    expect(projection.document().nodes.some(({id}) => id === processId)).toBeTrue()
    expect(projection.document().edges.some(({id}) => id === transportId)).toBeTrue()

    const ready = source.next(createHamiltonianLifecycleObservation({
      ...born.observation,
      phase: "changed",
      attributes: {state: "ready"},
    }))
    journal.observe(ready)
    projection.observe(ready, null)
    projection.replaceSnapshot(first)
    expect(projection.document().nodes.find(({id}) => id === processId)?.facts)
      .toContainEqual(expect.objectContaining({id: "state", value: "ready"}))

    journal.observe(source.next(createHamiltonianLifecycleObservation({
      ...opened.observation,
      phase: "closed",
    })))
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      ...born.observation,
      phase: "ended",
    })))
    projection.replaceSnapshot(journal.snapshot())
    expect(projection.document().nodes.some(({id}) => id === processId)).toBeFalse()
    expect(projection.document().edges.some(({id}) => id === transportId)).toBeFalse()
    expect(projection.takeRetiredTransportIds()).toEqual([transportId])
  })

  test("resolves only the part of a sequence gap covered by a frontier", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const source = new HamiltonianLifecycleSource({
      id: "service-worker:gap",
      kind: "service-worker",
      incarnation: "gap",
      startedAt: 1,
    })
    const born = source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "service-worker:gap",
      subjectKind: "service-worker",
      ownerId: "service-worker:gap",
    }))
    projection.observe(born, {
      sourceId: "service-worker:gap",
      sourceIncarnation: "gap",
      expectedSequence: 1,
      receivedSequence: 6,
      missingFrom: 1,
      missingTo: 5,
    })
    projection.resolveFrontier([{sourceId: "service-worker:gap", sourceIncarnation: "gap", sequence: 3}])
    expect(projection.firstGap).toEqual(expect.objectContaining({missingFrom: 4, missingTo: 5}))
    projection.resolveFrontier([{sourceId: "service-worker:gap", sourceIncarnation: "gap", sequence: 5}])
    expect(projection.firstGap).toBeNull()
  })

  test("removes a superseded realm and every transport still owned by that incarnation", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const worker = new HamiltonianLifecycleSource({id: "service-worker:old", kind: "service-worker", incarnation: "old", startedAt: 1})
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "born", subjectId: "service-worker:old", subjectKind: "service-worker", ownerId: "service-worker:old",
      attributes: {incarnation: "old"},
    })), null)
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "opened", subjectId: "websocket:old", subjectKind: "websocket", ownerId: "service-worker:old",
      sourceEntityId: "service-worker:old", targetEntityId: "server:host-a", transportId: "websocket:old", attributes: {protocol: "ws"},
    })), null)

    const page = new HamiltonianLifecycleSource({id: "page:page-a", kind: "page", incarnation: "page-a", startedAt: 2})
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "ended", subjectId: "service-worker:old", subjectKind: "service-worker", ownerId: "service-worker:old",
      attributes: {reason: "superseded-by-observed-incarnation"},
    })), null)

    expect(projection.document().nodes.some((node) => node.id === "service-worker:old")).toBeFalse()
    expect(projection.document().edges.some((edge) => edge.id === "websocket:old")).toBeFalse()
    expect(projection.takeRetiredTransportIds()).toEqual(["websocket:old"])
    expect(projection.takeRetiredLifecycleSources()).toEqual([{
      sourceId: "service-worker:old",
      sourceIncarnation: "old",
    }])
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "changed", subjectId: "service-worker:old", subjectKind: "service-worker", ownerId: "service-worker:old",
      attributes: {incarnation: "old", state: "late"},
    })), null)
    expect(projection.document().nodes.some((node) => node.id === "service-worker:old")).toBeFalse()
  })

  test("bounds terminal identities and removes structural records for ended incarnations", () => {
    const projection = new HamiltonianLifecycleProjection(context, {terminalIdentityCapacity: 2})
    for (let index = 0; index < 4; index += 1) {
      const incarnation = `worker-${index}`
      const entityId = `dedicated-worker:${incarnation}`
      const transportId = `worker-message:${incarnation}`
      const source = new HamiltonianLifecycleSource({
        id: entityId,
        kind: "dedicated-worker",
        incarnation,
        startedAt: index + 1,
      })
      projection.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: entityId, subjectKind: "dedicated-worker", ownerId: entityId,
        attributes: {incarnation},
      })), null)
      projection.observe(source.next(createHamiltonianLifecycleObservation({
        type: "transport", phase: "opened", subjectId: transportId, subjectKind: "worker-message", ownerId: entityId,
        sourceEntityId: "page:page-a", targetEntityId: entityId, transportId,
      })), null)
      projection.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "ended", subjectId: entityId, subjectKind: "dedicated-worker", ownerId: entityId,
        attributes: {incarnation},
      })), null)
    }

    expect(projection.retainedTerminalIdentityCount).toBe(4)
    expect(projection.retainedStructuralEventCount).toBe(0)
    expect(projection.takeRetiredLifecycleSources()).toHaveLength(4)
  })

  test("does not show a child process retained from another server incarnation", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const oldProcess = new HamiltonianLifecycleSource({
      id: "bun-process:old",
      kind: "bun-process",
      incarnation: "old",
      startedAt: 1,
    })
    projection.observe(oldProcess.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "bun-process:old",
      subjectKind: "bun-process",
      ownerId: "bun-process:old",
      attributes: {incarnation: "old", role: "worker-probe"},
    })), null)
    projection.observe(oldProcess.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: "ipc:old",
      subjectKind: "ipc",
      ownerId: "bun-process:old",
      sourceEntityId: "server:host-old",
      targetEntityId: "bun-process:old",
      transportId: "ipc:old",
    })), null)
    projection.observe(oldProcess.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "rtc-peer:old%3Aserver",
      subjectKind: "rtc-peer",
      ownerId: "bun-process:old",
      attributes: {endpoint: "server", sessionEpoch: "old", state: "connected"},
    })), null)
    const stalePresentation = projection.observe(oldProcess.next(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "sent",
      subjectId: "message:old",
      subjectKind: "ipc-message",
      ownerId: "bun-process:old",
      sourceEntityId: "bun-process:old",
      targetEntityId: "server:host-old",
      transportId: "ipc:old",
      messageId: "message:old",
      messageClass: "ready",
    })), null)

    const currentProcess = new HamiltonianLifecycleSource({
      id: "bun-process:current",
      kind: "bun-process",
      incarnation: "current",
      startedAt: 2,
    })
    projection.observe(currentProcess.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "bun-process:current",
      subjectKind: "bun-process",
      ownerId: "server:host-a",
      attributes: {incarnation: "current", role: "main-probe"},
    })), null)

    expect(projection.document().nodes.map((node) => node.id)).toEqual([
      "server-contour",
      "server:host-a",
      "page:page-a",
      "bun-process:current",
    ])
    expect(projection.document().nodes.find(({id}) => id === "server:host-a")?.parentId)
      .toBe("server-contour")
    expect(projection.document().nodes.find(({id}) => id === "bun-process:current")?.parentId)
      .toBe("server-contour")
    expect(projection.document().nodes.some((node) => node.id === "rtc-peer:old%3Aserver")).toBeFalse()
    expect(stalePresentation).toBeNull()
  })

  test("nests main, its browser RTCPeerConnection, and the Dedicated Worker under the page", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const process = new HamiltonianLifecycleSource({
      id: "peer-process:process-a",
      kind: "peer-process",
      incarnation: "process-a",
      startedAt: 20,
    })
    const page = new HamiltonianLifecycleSource({
      id: "page:page-a",
      kind: "page",
      incarnation: "page-a",
      startedAt: 11,
    })
    projection.observe(process.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "peer-process:process-a",
      subjectKind: "peer-process",
      ownerId: "server:host-a",
      attributes: {state: "active"},
    })), null)
    projection.observe(process.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "rtc-peer:session-a%3Aserver",
      subjectKind: "rtc-peer",
      ownerId: "peer-process:process-a",
      attributes: {endpoint: "server", sessionEpoch: "session-a", state: "new"},
    })), null)
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "window-main:page-a",
      subjectKind: "window-main",
      ownerId: "page:page-a",
      attributes: {state: "active"},
    })), null)
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "dedicated-worker:worker-a",
      subjectKind: "dedicated-worker",
      ownerId: "page:page-a",
      attributes: {state: "active"},
    })), null)
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: "worker-message:worker-a",
      subjectKind: "worker-message",
      ownerId: "dedicated-worker:worker-a",
      sourceEntityId: "window-main:page-a",
      targetEntityId: "dedicated-worker:worker-a",
      transportId: "worker-message:worker-a",
    })), null)
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "rtc-peer:session-a%3Abrowser",
      subjectKind: "rtc-peer",
      ownerId: "window-main:page-a",
      attributes: {endpoint: "browser", sessionEpoch: "session-a", state: "new"},
    })), null)
    for (const lane of ["oracle", "force"] as const) {
      projection.observe(process.next(createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "opened",
        subjectId: `data-channel:session-a%3A${lane}`,
        subjectKind: "data-channel",
        ownerId: "rtc-peer:session-a%3Aserver",
        sourceEntityId: "rtc-peer:session-a%3Aserver",
        targetEntityId: "rtc-peer:session-a%3Abrowser",
        transportId: `data-channel:session-a%3A${lane}`,
        attributes: {lane, state: "open"},
      })), null)
    }

    const document = projection.document()
    expect(document.nodes.map((node) => node.title)).toEqual(expect.arrayContaining([
      "RTCPeerConnection сервера",
      "RTCPeerConnection страницы",
    ]))
    expect(document.nodes.find(({id}) => id === "rtc-peer:session-a%3Aserver")?.parentId)
      .toBe("peer-process:process-a")
    expect(document.nodes.find(({id}) => id === "peer-process:process-a")?.parentId)
      .toBe("server-contour")
    expect(document.nodes.find(({id}) => id === "rtc-peer:session-a%3Abrowser")?.parentId)
      .toBe("window-main:page-a")
    expect(document.nodes.find(({id}) => id === "window-main:page-a")?.parentId)
      .toBe("page:page-a")
    expect(document.nodes.find(({id}) => id === "dedicated-worker:worker-a")?.parentId)
      .toBe("page:page-a")
    expect(document.nodes.find(({id}) => id === "rtc-peer:session-a%3Aserver")?.ports
      ?.map(({direction, side}) => ({direction, side})))
      .toEqual([{direction: "out", side: undefined}, {direction: "out", side: undefined}])
    expect(document.nodes.find(({id}) => id === "rtc-peer:session-a%3Abrowser")?.ports
      ?.map(({direction, side}) => ({direction, side})))
      .toEqual([{direction: "in", side: undefined}, {direction: "in", side: undefined}])
    for (const lane of ["oracle", "force"] as const) {
      const transportId = `data-channel:session-a%3A${lane}`
      const encodedTransportId = encodeURIComponent(transportId)
      const matchingEdges = document.edges.filter(({id}) => id === transportId)
      expect(matchingEdges).toHaveLength(1)
      const edge = matchingEdges[0]!
      expect(edge).toEqual(expect.objectContaining({
        source: {nodeId: "rtc-peer:session-a%3Aserver", portId: `out:${encodedTransportId}`},
        target: {nodeId: "rtc-peer:session-a%3Abrowser", portId: `in:${encodedTransportId}`},
      }))
      for (const [nodeId, portId, parameterId] of [
        [edge.source.nodeId, edge.source.portId, `transport:${encodedTransportId}:out`],
        [edge.target.nodeId, edge.target.portId, `transport:${encodedTransportId}:in`],
      ] as const) {
        const node = document.nodes.find(({id}) => id === nodeId)!
        const port = node.ports?.find(({id}) => id === portId)
        expect(port?.parameterId).toBe(parameterId)
        expect(node.facts?.some(({id}) => id === parameterId)).toBeTrue()
      }
    }
    expect(document.edges.map((edge) => edge.label)).toEqual(expect.arrayContaining([
      "Oracle RTCDataChannel",
      "Force RTCDataChannel",
    ]))
  })

  test("presents one message once when send and receive share identity", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const page = new HamiltonianLifecycleSource({id: "page:page-a", kind: "page", incarnation: "page-a", startedAt: 1})
    const worker = new HamiltonianLifecycleSource({id: "service-worker:sw", kind: "service-worker", incarnation: "sw", startedAt: 1})
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "born", subjectId: "service-worker:sw", subjectKind: "service-worker", ownerId: "service-worker:sw",
    })), null)
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "opened", subjectId: "message-port:one", subjectKind: "message-port", ownerId: "page:page-a",
      sourceEntityId: "page:page-a", targetEntityId: "service-worker:sw", transportId: "message-port:one",
    })), null)
    const sent = page.next(createHamiltonianLifecycleObservation({
      type: "message", phase: "sent", subjectId: "message:one", subjectKind: "heartbeat", ownerId: "page:page-a",
      sourceEntityId: "page:page-a", targetEntityId: "service-worker:sw", transportId: "message-port:one",
      messageId: "message:one", messageClass: "window-heartbeat",
    }))
    const received = worker.next(createHamiltonianLifecycleObservation({...sent.observation, phase: "received", ownerId: "service-worker:sw"}))
    expect(projection.observe(sent, null)).toEqual(expect.objectContaining({messageId: "message:one", edgeId: "message-port:one"}))
    expect(projection.observe(received, null)).toBeNull()
    expect(hamiltonianLifecycleNeedsDocument(sent, null)).toBeFalse()
    expect(hamiltonianLifecycleNeedsDocument(sent, {
      sourceId: sent.sourceId,
      sourceIncarnation: sent.sourceIncarnation,
      expectedSequence: 1,
      receivedSequence: 2,
      missingFrom: 1,
      missingTo: 1,
    })).toBeTrue()
  })

  test("bounds recent message identities without retaining traffic history", () => {
    const projection = new HamiltonianLifecycleProjection(context, {messageIdentityCapacity: 2})
    const page = new HamiltonianLifecycleSource({id: "page:page-a", kind: "page", incarnation: "page-a", startedAt: 1})
    const worker = new HamiltonianLifecycleSource({id: "service-worker:sw", kind: "service-worker", incarnation: "sw", startedAt: 1})
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "born", subjectId: "service-worker:sw", subjectKind: "service-worker", ownerId: "service-worker:sw",
    })), null)
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "opened", subjectId: "message-port:one", subjectKind: "message-port", ownerId: "page:page-a",
      sourceEntityId: "page:page-a", targetEntityId: "service-worker:sw", transportId: "message-port:one",
    })), null)
    const message = (messageId: string) => page.next(createHamiltonianLifecycleObservation({
      type: "message", phase: "sent", subjectId: messageId, subjectKind: "heartbeat", ownerId: "page:page-a",
      sourceEntityId: "page:page-a", targetEntityId: "service-worker:sw", transportId: "message-port:one",
      messageId, messageClass: "window-heartbeat",
    }))

    expect(projection.observe(message("message:one"), null)).not.toBeNull()
    expect(projection.observe(message("message:two"), null)).not.toBeNull()
    expect(projection.observe(message("message:three"), null)).not.toBeNull()
    expect(projection.retainedMessageIdentityCount).toBe(2)
    expect(projection.observe(message("message:three"), null)).toBeNull()
    expect(projection.retainedMessageIdentityCount).toBe(2)
  })

  test("never presents a message without its exact observed transport", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const page = new HamiltonianLifecycleSource({id: "page:page-a", kind: "page", incarnation: "page-a", startedAt: 1})
    const worker = new HamiltonianLifecycleSource({id: "service-worker:sw", kind: "service-worker", incarnation: "sw", startedAt: 1})
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "born", subjectId: "service-worker:sw", subjectKind: "service-worker", ownerId: "service-worker:sw",
    })), null)
    const message = (messageId: string, targetEntityId: string, transportId: string) => page.next(
      createHamiltonianLifecycleObservation({
        type: "message", phase: "sent", subjectId: messageId, subjectKind: "heartbeat", ownerId: "page:page-a",
        sourceEntityId: "page:page-a", targetEntityId, transportId,
        messageId, messageClass: "window-heartbeat",
      }),
    )

    expect(projection.observe(message("message:missing", "service-worker:sw", "message-port:missing"), null)).toBeNull()
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "opened", subjectId: "message-port:one", subjectKind: "message-port", ownerId: "page:page-a",
      sourceEntityId: "page:page-a", targetEntityId: "service-worker:sw", transportId: "message-port:one",
    })), null)
    expect(projection.observe(message("message:mismatch", "server:host-a", "message-port:one"), null)).toBeNull()
    expect(projection.observe(message("message:valid", "service-worker:sw", "message-port:one"), null))
      .toEqual(expect.objectContaining({messageId: "message:valid", direction: "forward"}))
  })

  test("surfaces a sequence gap on its runtime owner", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const source = new HamiltonianLifecycleSource({id: "service-worker:sw", kind: "service-worker", incarnation: "sw", startedAt: 1})
    const born = source.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "born", subjectId: "service-worker:sw", subjectKind: "service-worker", ownerId: "service-worker:sw",
      attributes: {incarnation: "sw"},
    }))
    projection.observe(born, {
      sourceId: "service-worker:sw",
      sourceIncarnation: "sw",
      expectedSequence: 1,
      receivedSequence: 3,
      missingFrom: 1,
      missingTo: 2,
    })
    const worker = projection.document().nodes.find((node) => node.id === "service-worker:sw")
    expect(worker?.tone).toBe("warn")
    expect(worker?.facts).toContainEqual(expect.objectContaining({label: "Потеряны события", value: "1…2"}))
  })
})
