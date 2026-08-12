import {describe, expect, test} from "bun:test"
import {
  HamiltonianLifecycleRetainedJournal,
  HamiltonianLifecycleSource,
  createHamiltonianLifecycleObservation,
  createHamiltonianNodeSystemDeclaration,
  hamiltonianLifecycleSnapshotId,
  hamiltonianLogicalContourId,
} from "../../core/lifecycle.js"
import {
  HamiltonianLifecycleProjection,
  hamiltonianLayoutRequestRequiresCancellation,
  hamiltonianLifecycleNeedsDocument,
  hamiltonianServerNodeId,
  nodeSystemStructureKey,
  refreshPositionedNodeSystem,
} from "./lifecycle-projection.ts"
import type {NodeSystemDocument, PositionedNodeSystem} from "nodes/types"
import {MetaForNodeSystemLayouter} from "nodes/layout-engine"

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
  test("does not starve an in-flight layout with same-geometry telemetry", () => {
    expect(hamiltonianLayoutRequestRequiresCancellation(null, "graph-a")).toBeFalse()
    expect(hamiltonianLayoutRequestRequiresCancellation("graph-a", "graph-a")).toBeFalse()
    expect(hamiltonianLayoutRequestRequiresCancellation("graph-a", "graph-b")).toBeTrue()
  })

  test("starts with only the guaranteed server and current page", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    expect(projection.document()).toMatchObject({
      nodes: [
        {id: "server-contour", title: "Сервер"},
        {id: "server:host-a", parentId: "server-contour", title: "Hamiltonian"},
        {id: "page:page-a", layoutId: expect.stringContaining("tab-a"), title: "Эта страница"},
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
    expect(nodeSystemStructureKey(base)).not.toBe(nodeSystemStructureKey({
      ...base,
      nodes: [base.nodes[0]!, {...base.nodes[1]!, layoutId: "stable-b"}],
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
      attributes: {profileId: "device-a", runtime: "Chrome", state: "active"},
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
      kind: "device-a",
      facts: expect.arrayContaining([{id: "profileId", label: "Профиль", value: "device-a"}]),
    })
    expect(document.nodes.find(({id}) => id === "service-worker:sw-a")?.parentId)
      .toBe("browser:device-a")
    expect(document.edges).toEqual([])
    expect(JSON.stringify(document)).not.toContain("Профиль браузера")
  })

  test("materializes every Chrome profile owner and keeps its Service Worker inside it regardless of observation order", () => {
    const materialize = (profiles: readonly string[]) => {
      const projection = new HamiltonianLifecycleProjection(context)
      for (const profileId of profiles) {
        const profileBaseAt = profileId === "profile-a" ? 100 : 200
        const browserId = `browser:${profileId}`
        const workerId = `service-worker:${profileId}`
        const workerIdentity = profileId === "profile-a"
          ? "45d8fde1-9ecb-4c83-b52a-095c974cb4a1"
          : "093eeb45-7def-47dd-ac0c-fde43d5659e6"
        const source = new HamiltonianLifecycleSource({
          id: `profile-source:${profileId}`,
          kind: "service-worker",
          incarnation: profileId,
          startedAt: 20,
        })
        projection.observe(source.next(createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "changed",
          subjectId: browserId,
          subjectKind: "browser-runtime",
          ownerId: browserId,
          attributes: {profileId, runtime: "Chrome", state: "active"},
        }), {at: profileBaseAt}), null)
        projection.observe(source.next(createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "changed",
          subjectId: workerId,
          subjectKind: "service-worker",
          ownerId: browserId,
          attributes: {identity: workerIdentity, runtimeIncarnation: `runtime-${profileId}`, codeVersion: "1.0.0", state: "active"},
        }), {at: profileBaseAt + 1}), null)
        for (const pageSuffix of ["a", "b"] as const) {
          const pageOffset = pageSuffix === "a" ? 2 : 4
          const pageId = `page:${profileId}-${pageSuffix}`
          const transportId = `service-worker-api:${profileId}-${pageSuffix}`
          projection.observe(source.next(createHamiltonianLifecycleObservation({
            type: "entity",
            phase: "changed",
            subjectId: pageId,
            subjectKind: "page",
            ownerId: browserId,
            attributes: {incarnation: `${profileId}-${pageSuffix}`, state: "live"},
          }), {at: profileBaseAt + pageOffset}), null)
          projection.observe(source.next(createHamiltonianLifecycleObservation({
            type: "transport",
            phase: "opened",
            subjectId: transportId,
            subjectKind: "service-worker-api",
            ownerId: workerId,
            sourceEntityId: pageId,
            targetEntityId: workerId,
            transportId,
            attributes: {mechanism: "ServiceWorker.postMessage / WindowClient.postMessage"},
          }), {at: profileBaseAt + pageOffset + 1}), null)
        }
      }
      return projection.document()
    }

    const forward = materialize(["profile-a", "profile-b"])
    const reversed = materialize(["profile-b", "profile-a"])
    expect(forward).toEqual(reversed)
    expect(forward.nodes.filter(({title}) => title === "Chrome")).toEqual([
      expect.objectContaining({
        id: "browser:profile-a",
        kind: "profile-a",
        facts: expect.arrayContaining([{id: "profileId", label: "Профиль", value: "profile-a"}]),
      }),
      expect.objectContaining({
        id: "browser:profile-b",
        kind: "profile-b",
        facts: expect.arrayContaining([{id: "profileId", label: "Профиль", value: "profile-b"}]),
      }),
    ])
    expect(forward.nodes.find(({id}) => id === "service-worker:profile-a")?.parentId)
      .toBe("browser:profile-a")
    expect(forward.nodes.find(({id}) => id === "service-worker:profile-a")?.facts)
      .toContainEqual({id: "codeVersion", label: "Версия кода", value: "1.0.0"})
    expect(forward.nodes.find(({id}) => id === "service-worker:profile-b")?.parentId)
      .toBe("browser:profile-b")
    expect(forward.nodes.find(({id}) => id === "service-worker:profile-b")?.facts)
      .toContainEqual({id: "codeVersion", label: "Версия кода", value: "1.0.0"})
    expect(forward.nodes
      .filter(({title}) => title === "Service Worker")
      .map(({id, parentId, title, kind, summary, facts}) => ({
        id,
        parentId,
        title,
        kind,
        summary,
        identityFacts: facts?.filter((fact) => fact.id === "identity"),
        codeVersionFacts: facts?.filter((fact) => fact.id === "codeVersion"),
      })))
      .toMatchInlineSnapshot(`
        [
          {
            "codeVersionFacts": [
              {
                "id": "codeVersion",
                "label": "Версия кода",
                "value": "1.0.0",
              },
            ],
            "id": "service-worker:profile-a",
            "identityFacts": [],
            "kind": "45d8fde1…4cb4a1",
            "parentId": "browser:profile-a",
            "summary": undefined,
            "title": "Service Worker",
          },
          {
            "codeVersionFacts": [
              {
                "id": "codeVersion",
                "label": "Версия кода",
                "value": "1.0.0",
              },
            ],
            "id": "service-worker:profile-b",
            "identityFacts": [],
            "kind": "093eeb45…5659e6",
            "parentId": "browser:profile-b",
            "summary": undefined,
            "title": "Service Worker",
          },
        ]
      `)
    for (const profileId of ["profile-a", "profile-b"] as const) {
      const browserId = `browser:${profileId}`
      const workerId = `service-worker:${profileId}`
      for (const pageSuffix of ["a", "b"] as const) {
        const pageId = `page:${profileId}-${pageSuffix}`
        const transportId = `service-worker-api:${profileId}-${pageSuffix}`
        expect(forward.nodes.find(({id}) => id === pageId)?.parentId).toBe(browserId)
        expect(forward.edges).toEqual(expect.arrayContaining([
          expect.objectContaining({
            id: transportId,
            source: {nodeId: pageId, portId: "out:Service%20Worker%20API"},
            target: {nodeId: workerId, portId: "in:Service%20Worker%20API"},
          }),
          expect.objectContaining({
            id: `${transportId}:reverse`,
            source: {nodeId: workerId, portId: "out:Service%20Worker%20API"},
            target: {nodeId: pageId, portId: "in:Service%20Worker%20API"},
          }),
        ]))
      }
    }
  })

  test("does not materialize a transport or message across distinct Chrome profile roots", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const source = new HamiltonianLifecycleSource({
      id: "service-worker:profile-a",
      kind: "service-worker",
      incarnation: "cross-profile-probe",
      startedAt: 20,
    })
    for (const profileId of ["profile-a", "profile-b"] as const) {
      const browserId = `browser:${profileId}`
      const workerId = `service-worker:${profileId}`
      projection.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "changed",
        subjectId: browserId,
        subjectKind: "browser-runtime",
        ownerId: browserId,
        attributes: {profileId, runtime: "Chrome", state: "active"},
      })), null)
      projection.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "changed",
        subjectId: workerId,
        subjectKind: "service-worker",
        ownerId: browserId,
        attributes: {identity: profileId, state: "active"},
      })), null)
    }
    projection.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: "page:profile-a",
      subjectKind: "page",
      ownerId: "browser:profile-a",
      attributes: {incarnation: "profile-a", state: "live"},
    })), null)
    const transportId = "service-worker-api:cross-profile"
    projection.observe(source.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: transportId,
      subjectKind: "service-worker-api",
      ownerId: "service-worker:profile-a",
      sourceEntityId: "page:profile-a",
      targetEntityId: "service-worker:profile-b",
      transportId,
      attributes: {state: "active"},
    })), null)
    const presentation = projection.observe(source.next(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "sent",
      subjectId: "service-worker-api-message:cross-profile",
      subjectKind: "service-worker-api-message",
      ownerId: "page:profile-a",
      sourceEntityId: "page:profile-a",
      targetEntityId: "service-worker:profile-b",
      transportId,
      messageId: "service-worker-api-message:cross-profile",
      messageClass: "probe",
      attributes: {},
    })), null)

    const document = projection.document()
    expect(document.nodes.find(({id}) => id === "page:profile-a")?.parentId)
      .toBe("browser:profile-a")
    expect(document.nodes.find(({id}) => id === "service-worker:profile-b")?.parentId)
      .toBe("browser:profile-b")
    expect(document.edges.some(({id}) => id === transportId || id === `${transportId}:reverse`))
      .toBeFalse()
    for (const nodeId of ["page:profile-a", "service-worker:profile-b"]) {
      expect(document.nodes.find(({id}) => id === nodeId)?.ports
        ?.some(({connectionType}) => connectionType === "service-worker-api") ?? false).toBeFalse()
    }
    expect(presentation).toBeNull()
  })

  test("shows every retained page under one Chrome and keeps actions local", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const workerJournal = new HamiltonianLifecycleRetainedJournal("service-worker:worker-a")
    const browserId = "browser:device-a"
    const addPage = (incarnation: string, tabId: string) => {
      const pageId = `page:${incarnation}`
      const source = new HamiltonianLifecycleSource({
        id: pageId,
        kind: "page",
        incarnation,
        startedAt: 11,
      })
      const pageJournal = new HamiltonianLifecycleRetainedJournal(pageId)
      for (const observation of [
        createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "born",
          subjectId: browserId,
          subjectKind: "browser-runtime",
          ownerId: browserId,
          attributes: {runtime: "Chrome", profileId: "device-a"},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "born",
          subjectId: pageId,
          subjectKind: "page",
          ownerId: browserId,
          attributes: {incarnation, tabId, state: "live"},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "born",
          subjectId: `window-main:${incarnation}`,
          subjectKind: "window-main",
          ownerId: pageId,
          attributes: {incarnation, state: "active"},
        }),
      ]) pageJournal.observe(source.next(observation))
      workerJournal.merge(pageJournal.snapshot())
      return {pageId, source, pageJournal}
    }
    const pageA = addPage("page-a", "tab-a")
    const pageB = addPage("page-b", "tab-b")
    const bothPagesSnapshot = workerJournal.snapshot()
    projection.replaceSnapshot(bothPagesSnapshot)

    const initialDocument = projection.document()
    const pages = initialDocument.nodes.filter(({kind}) => kind === "page realm")
    expect(pages).toHaveLength(2)
    expect(pages.map(({parentId}) => parentId)).toEqual([browserId, browserId])
    expect(pages.find(({id}) => id === pageA.pageId)).toMatchObject({
      title: "Эта страница",
      actions: expect.any(Array),
    })
    expect(pages.find(({id}) => id === pageB.pageId)).toMatchObject({
      title: "Страница",
      facts: expect.arrayContaining([{id: "tabId", label: "Вкладка", value: "tab-b"}]),
    })
    expect(pages.find(({id}) => id === pageB.pageId)?.actions).toBeUndefined()
    const pageBLayoutId = pages.find(({id}) => id === pageB.pageId)?.layoutId
    const pageBMainLayoutId = initialDocument.nodes.find(({id}) => id === "window-main:page-b")?.layoutId

    const recoveredProjection = new HamiltonianLifecycleProjection(context)
    recoveredProjection.replaceSnapshot(bothPagesSnapshot)
    const restartedJournal = new HamiltonianLifecycleRetainedJournal("service-worker:worker-a", {
      initialRevision: bothPagesSnapshot.revision + 1_000,
    })
    restartedJournal.merge(pageA.pageJournal.snapshot())
    recoveredProjection.replaceSnapshot(restartedJournal.snapshot())
    expect(recoveredProjection.document().nodes.some(({id}) => id === pageB.pageId)).toBeFalse()
    expect(recoveredProjection.document().nodes.some(({id}) => id === pageA.pageId)).toBeTrue()

    pageB.pageJournal.observe(pageB.source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: pageB.pageId,
      subjectKind: "page",
      ownerId: browserId,
      attributes: {incarnation: "page-b", state: "ended"},
    })))
    workerJournal.merge(pageB.pageJournal.snapshot())
    projection.replaceSnapshot(workerJournal.snapshot())
    expect(projection.document().nodes.some(({id}) => id === pageB.pageId)).toBeFalse()
    expect(projection.document().nodes.some(({id}) => id === pageA.pageId)).toBeTrue()

    const pageBReloaded = addPage("page-b-reloaded", "tab-b")
    projection.replaceSnapshot(workerJournal.snapshot())
    const reloadedDocument = projection.document()
    expect(reloadedDocument.nodes.filter(({kind}) => kind === "page realm").map(({id}) => id).sort())
      .toEqual([pageA.pageId, pageBReloaded.pageId].sort())
    expect(reloadedDocument.nodes.find(({id}) => id === pageBReloaded.pageId)?.layoutId)
      .toBe(pageBLayoutId)
    expect(reloadedDocument.nodes.find(({id}) => id === "window-main:page-b-reloaded")?.layoutId)
      .toBe(pageBMainLayoutId)
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
      attributes: {profileId: "device-a", runtime: "Chrome", state: "active"},
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
      kind: "device-a",
    })
    expect(projection.document().nodes.find(({id}) => id === "page:page-a")?.parentId)
      .toBe("browser:device-a")
  })

  test("forgets a remote browser scope missing from the authoritative host snapshot", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const localPage = new HamiltonianLifecycleSource({
      id: "page:page-a",
      kind: "page",
      incarnation: "page-a",
      startedAt: 10,
    })
    projection.observe(localPage.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "browser:device-a",
      subjectKind: "browser-runtime",
      ownerId: "browser:device-a",
      attributes: {profileId: "device-a", runtime: "Chrome", state: "active"},
    })), null)
    projection.observe(localPage.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: "page:page-a",
      subjectKind: "page",
      ownerId: "browser:device-a",
      attributes: {incarnation: "page-a", state: "live"},
    })), null)

    const remoteBrowserId = "browser:device-b"
    const remoteWorkerId = "service-worker:stable-b"
    const remoteSource = new HamiltonianLifecycleSource({
      id: remoteWorkerId,
      kind: "service-worker",
      incarnation: "runtime-b",
      startedAt: 20,
    })
    const hostJournal = new HamiltonianLifecycleRetainedJournal("server:host-a")
    const observeRemoteScope = (workerFirst = false) => {
      const browserObservation = createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "changed",
        subjectId: remoteBrowserId,
        subjectKind: "browser-runtime",
        ownerId: remoteBrowserId,
        attributes: {profileId: "device-b", runtime: "Chrome", state: "active"},
      })
      const workerObservation = createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "changed",
        subjectId: remoteWorkerId,
        subjectKind: "service-worker",
        ownerId: remoteBrowserId,
        attributes: {identity: "stable-b", runtimeIncarnation: "runtime-b", state: "active"},
      })
      for (const observation of workerFirst
        ? [workerObservation, browserObservation]
        : [browserObservation, workerObservation]) {
        hostJournal.observe(remoteSource.next(observation))
      }
    }

    observeRemoteScope(true)
    projection.replaceSnapshot(hostJournal.snapshot())
    expect(projection.document().nodes.map(({id}) => id)).toEqual(expect.arrayContaining([
      "browser:device-a",
      remoteBrowserId,
      remoteWorkerId,
    ]))

    expect(hostJournal.forgetEntityTree(remoteBrowserId)).toBeTrue()
    projection.replaceSnapshot(hostJournal.snapshot())
    expect(projection.document().nodes.some(({id}) => id === remoteBrowserId)).toBeFalse()
    expect(projection.document().nodes.some(({id}) => id === remoteWorkerId)).toBeFalse()
    expect(projection.document().nodes.some(({id}) => id === "browser:device-a")).toBeTrue()

    observeRemoteScope()
    projection.replaceSnapshot(hostJournal.snapshot())
    expect(projection.document().nodes.map(({id}) => id)).toEqual(expect.arrayContaining([
      remoteBrowserId,
      remoteWorkerId,
    ]))
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
    expect(serviceWorkerNode?.kind).toBe("sw-a")
    expect(serviceWorkerNode?.summary).toBeUndefined()
    expect(serviceWorkerNode?.facts).not.toContainEqual(expect.objectContaining({id: "identity"}))
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

  test("renders the observed Web Push transport between Bun and the same Service Worker", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const browser = new HamiltonianLifecycleSource({
      id: "browser:device-a",
      kind: "browser-runtime",
      incarnation: "device-a",
      startedAt: 12,
    })
    const worker = new HamiltonianLifecycleSource({
      id: "service-worker:sw-a",
      kind: "service-worker",
      incarnation: "sw-a",
      startedAt: 20,
    })
    const server = new HamiltonianLifecycleSource({
      id: "server:host-a",
      kind: "server",
      incarnation: "host-a",
      startedAt: 10,
    })
    projection.observe(browser.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "browser:device-a",
      subjectKind: "browser-runtime",
      ownerId: null,
      attributes: {runtime: "Chrome", state: "active"},
    })), null)
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "service-worker:sw-a",
      subjectKind: "service-worker",
      ownerId: "browser:device-a",
      attributes: {identity: "sw-a", state: "active", push: "ready"},
    })), null)
    projection.observe(server.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: "web-push:sw-a",
      subjectKind: "web-push",
      ownerId: "server:host-a",
      sourceEntityId: "server:host-a",
      targetEntityId: "service-worker:sw-a",
      transportId: "web-push:sw-a",
      attributes: {state: "ready", mediatedBy: "browser-push-service"},
    })), null)
    expect(projection.document().edges).toContainEqual(expect.objectContaining({
      id: "web-push:sw-a",
      label: "Web Push",
      source: expect.objectContaining({nodeId: "server:host-a"}),
      target: expect.objectContaining({nodeId: "service-worker:sw-a"}),
    }))
  })

  test("lays out the full bidirectional browser/server contour with Web Push", () => {
    const runtimeContext = {
      ...context,
      origin: "https://127.0.0.1:4400",
      server: {
        identity: "hamiltonian-lab",
        hostEpoch: "host-a",
        version: "webpush-001-layout-evidence",
      },
    }
    const projection = new HamiltonianLifecycleProjection(runtimeContext)
    const sources = new Map<string, HamiltonianLifecycleSource>()
    const observe = (sourceId: string, sourceKind: string, observation: Parameters<typeof createHamiltonianLifecycleObservation>[0]) => {
      let source = sources.get(sourceId)
      if (!source) {
        source = new HamiltonianLifecycleSource({id: sourceId, kind: sourceKind, incarnation: sourceId, startedAt: 1})
        sources.set(sourceId, source)
      }
      projection.observe(source.next(createHamiltonianLifecycleObservation(observation)), null)
    }
    const browserId = "browser:device-a"
    const pageId = "page:page-a"
    const mainId = "window-main:page-a"
    const secondPageId = "page:page-b"
    const secondMainId = "window-main:page-b"
    const workerId = "service-worker:sw-a"
    const dedicatedId = "dedicated-worker:worker-a"
    const peerId = "peer-process:peer-a"
    const serverRtcId = "rtc-peer:session-a%3Aserver"
    const browserRtcId = "rtc-peer:session-a%3Abrowser"

    for (const [sourceId, sourceKind, subjectId, subjectKind, ownerId, attributes] of [
      [pageId, "page", browserId, "browser-runtime", browserId, {runtime: "Chrome", state: "active", profileId: "device-a"}],
      [pageId, "page", pageId, "page", browserId, {incarnation: "page-a", navigation: "8459f3b0-e693-4241-9df9-5ff84e77d3e7", state: "live", visibility: "visible"}],
      [pageId, "page", mainId, "window-main", pageId, {incarnation: "page-a", runtime: "Window", state: "active"}],
      [secondPageId, "page", secondPageId, "page", browserId, {incarnation: "page-b", navigation: "navigation-b", state: "live", visibility: "hidden"}],
      [secondPageId, "page", secondMainId, "window-main", secondPageId, {incarnation: "page-b", runtime: "Window", state: "active"}],
      [workerId, "service-worker", workerId, "service-worker", browserId, {identity: "sw-a", runtimeIncarnation: "367dc681-e3f4-41a7-a04c-dcbd9e7a4092", state: "active", push: "ready", webPushLifecycle: "client.registration.accepted"}],
      [dedicatedId, "dedicated-worker", dedicatedId, "dedicated-worker", pageId, {incarnation: "worker-a", state: "active", embodimentIncarnation: "09740c68-b9f1-490d-9c08-3789b1619f28", version: "webpush-001-layout-evidence"}],
      [peerId, "peer-process", peerId, "peer-process", "server:host-a", {incarnation: "peer-a", pid: 44, role: "peer", state: "active"}],
      [peerId, "peer-process", serverRtcId, "rtc-peer", peerId, {endpoint: "server", peerId: "peer:7cd14309-f4dc-4a38-8291-562a97b89bee:3", sessionEpoch: "session-a", state: "connected"}],
      [pageId, "page", browserRtcId, "rtc-peer", mainId, {endpoint: "browser", peerId: "peer:7cd14309-f4dc-4a38-8291-562a97b89bee:3", sessionEpoch: "session-a", generation: 3, state: "connected"}],
      ["bun-process:main", "bun-process", "bun-process:main", "bun-process", "server:host-a", {incarnation: "main", pid: 45, role: "main-probe", state: "active", version: "webpush-001-layout-evidence"}],
      ["bun-process:worker", "bun-process", "bun-process:worker", "bun-process", "server:host-a", {incarnation: "worker", pid: 46, role: "worker-probe", state: "active", version: "webpush-001-layout-evidence"}],
    ] as const) {
      observe(sourceId, sourceKind, {type: "entity", phase: "changed", subjectId, subjectKind, ownerId, attributes})
    }

    const transports = [
      [pageId, "page", "service-worker-api:page", "service-worker-api", workerId, pageId, workerId, {mechanism: "ServiceWorker.postMessage / WindowClient.postMessage"}],
      [secondPageId, "page", "service-worker-api:page-b", "service-worker-api", workerId, secondPageId, workerId, {mechanism: "ServiceWorker.postMessage / WindowClient.postMessage"}],
      [dedicatedId, "dedicated-worker", "worker-message:worker", "worker-message", dedicatedId, mainId, dedicatedId, {}],
      ["bun-process:main", "bun-process", "ipc:main", "ipc", "bun-process:main", "server:host-a", "bun-process:main", {state: "connected"}],
      ["bun-process:worker", "bun-process", "ipc:worker", "ipc", "bun-process:worker", "server:host-a", "bun-process:worker", {state: "connected"}],
      [peerId, "peer-process", "ipc:peer", "ipc", peerId, "server:host-a", peerId, {state: "connected"}],
      [peerId, "peer-process", "data-channel:oracle", "data-channel", serverRtcId, serverRtcId, browserRtcId, {lane: "oracle", state: "open"}],
      [peerId, "peer-process", "data-channel:force", "data-channel", serverRtcId, serverRtcId, browserRtcId, {lane: "force", state: "open"}],
      [workerId, "service-worker", "websocket:control", "websocket", workerId, workerId, "server:host-a", {state: "connected"}],
      ["server:host-a", "server", "web-push:worker", "web-push", "server:host-a", "server:host-a", workerId, {state: "ready", mediatedBy: "browser-push-service"}],
    ] as const
    for (const [sourceId, sourceKind, subjectId, subjectKind, ownerId, sourceEntityId, targetEntityId, attributes] of transports) {
      observe(sourceId, sourceKind, {
        type: "transport",
        phase: "opened",
        subjectId,
        subjectKind,
        ownerId,
        sourceEntityId,
        targetEntityId,
        transportId: subjectId,
        attributes,
      })
    }

    const document = projection.document()
    expect(document.edges).toHaveLength(12)
    expect(document.nodes.filter(({kind}) => kind === "page realm")).toHaveLength(2)
    const pageNode = document.nodes.find(({id}) => id === pageId)!
    const workerNode = document.nodes.find(({id}) => id === workerId)!
    expect(pageNode.facts?.filter(({label}) => label === "Service Worker API"))
      .toEqual([{id: "transport:Service%20Worker%20API:channel", label: "Service Worker API", value: "вход / выход", tone: "live"}])
    expect(workerNode.facts?.filter(({label}) => label === "Service Worker API"))
      .toEqual([{id: "transport:Service%20Worker%20API:channel", label: "Service Worker API", value: "вход / выход", tone: "live"}])
    expect(pageNode.ports?.filter(({parameterId}) => parameterId === "transport:Service%20Worker%20API:channel"))
      .toEqual([
        {id: "out:Service%20Worker%20API", parameterId: "transport:Service%20Worker%20API:channel", direction: "out", connectionType: "service-worker-api"},
        {id: "in:Service%20Worker%20API", parameterId: "transport:Service%20Worker%20API:channel", direction: "in", connectionType: "service-worker-api"},
      ])
    expect(workerNode.ports?.filter(({parameterId}) => parameterId === "transport:Service%20Worker%20API:channel"))
      .toEqual([
        {id: "in:Service%20Worker%20API", parameterId: "transport:Service%20Worker%20API:channel", direction: "in", connectionType: "service-worker-api"},
        {id: "out:Service%20Worker%20API", parameterId: "transport:Service%20Worker%20API:channel", direction: "out", connectionType: "service-worker-api"},
      ])
    expect(document.edges.filter(({label}) => label === "Service Worker API")).toEqual([
      expect.objectContaining({
        id: "service-worker-api:page",
        source: {nodeId: pageId, portId: "out:Service%20Worker%20API"},
        target: {nodeId: workerId, portId: "in:Service%20Worker%20API"},
        connectionType: "service-worker-api",
      }),
      expect.objectContaining({
        id: "service-worker-api:page:reverse",
        source: {nodeId: workerId, portId: "out:Service%20Worker%20API"},
        target: {nodeId: pageId, portId: "in:Service%20Worker%20API"},
        connectionType: "service-worker-api",
      }),
      expect.objectContaining({id: "service-worker-api:page-b"}),
      expect.objectContaining({id: "service-worker-api:page-b:reverse"}),
    ])
    const serverNode = document.nodes.find(({id}) => id === "server:host-a")!
    expect(serverNode.facts?.filter(({label}) => label === "IPC"))
      .toEqual([{id: "transport:IPC:out", label: "IPC", value: "выход", tone: "live"}])
    const ipcEdges = document.edges.filter(({label}) => label === "IPC")
    expect(new Set(ipcEdges.map(({source}) => source.portId))).toEqual(new Set(["out:IPC"]))
    expect(() => new MetaForNodeSystemLayouter({
      measureText: (value, fontPx) => value.length * fontPx * 0.55,
    }).layout(document, {viewport: {width: 722, height: 1_088}}))
      .not.toThrow()
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
      attributes: {profileId: "device-a", runtime: "Chrome", state: "active"},
    })), null)
    projection.observe(firstRuntime.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "service-worker:stable",
      subjectKind: "service-worker",
      ownerId: "browser:device-a",
      attributes: {identity: "stable", runtimeIncarnation: "runtime-a", codeVersion: "1.0.0", state: "active", push: "ready"},
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
      attributes: {identity: "stable", runtimeIncarnation: "runtime-a", codeVersion: "1.0.0", state: "standby", push: "ready"},
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
      attributes: {identity: "stable", runtimeIncarnation: "runtime-b", codeVersion: "1.0.0", state: "active", push: "received"},
    })), null)
    const workers = projection.document().nodes.filter(({id}) => id === "service-worker:stable")
    expect(workers).toHaveLength(1)
    expect(workers[0]?.parentId).toBe("browser:device-a")
    expect(workers[0]?.facts).toContainEqual({id: "runtimeIncarnation", label: "Исполнение", value: "runtime-b"})
    expect(workers[0]?.facts).toContainEqual({id: "codeVersion", label: "Версия кода", value: "1.0.0"})
    expect(workers[0]?.facts).toContainEqual({id: "push", label: "Push", value: "received"})

    const updatedRuntime = new HamiltonianLifecycleSource({
      id: "service-worker:stable",
      kind: "service-worker",
      incarnation: "runtime-c",
      startedAt: 3,
    })
    projection.observe(updatedRuntime.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: "service-worker:stable",
      subjectKind: "service-worker",
      ownerId: "browser:device-a",
      attributes: {identity: "stable", runtimeIncarnation: "runtime-c", codeVersion: "2.0.0-rc.1+bundle.7", state: "active"},
    })), null)
    const updated = projection.document().nodes.filter(({id}) => id === "service-worker:stable")
    expect(updated).toHaveLength(1)
    expect(updated[0]?.parentId).toBe("browser:device-a")
    expect(updated[0]?.facts).toContainEqual({id: "runtimeIncarnation", label: "Исполнение", value: "runtime-c"})
    expect(updated[0]?.facts).toContainEqual({id: "codeVersion", label: "Версия кода", value: "2.0.0-rc.1+bundle.7"})
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

  test("atomically replaces a frozen server declaration when the host incarnation changes", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const logicalContourId = hamiltonianLogicalContourId("server", "hamiltonian-lab")
    const otherLogicalContourId = hamiltonianLogicalContourId("server", "other-lab")
    const serverDeclaration = (
      epoch: string,
      startedAt: number,
      identity = "hamiltonian-lab",
      contourId = logicalContourId,
    ) => {
      const serverId = `server:${epoch}`
      const processId = `peer-process:${epoch}`
      const rtcId = `rtc-peer:${epoch}%3Aserver`
      const source = new HamiltonianLifecycleSource({
        id: serverId,
        kind: "server",
        incarnation: epoch,
        startedAt,
      })
      const journal = new HamiltonianLifecycleRetainedJournal(serverId)
      for (const observation of [
        createHamiltonianLifecycleObservation({
          type: "entity", phase: "born", subjectId: serverId, subjectKind: "server",
          ownerId: serverId, attributes: {identity, epoch, state: "live"},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity", phase: "born", subjectId: processId, subjectKind: "peer-process",
          ownerId: serverId, attributes: {incarnation: epoch, state: "active"},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity", phase: "born", subjectId: rtcId, subjectKind: "rtc-peer",
          ownerId: processId, attributes: {endpoint: "server", sessionEpoch: epoch, state: "connected"},
        }),
      ]) journal.observe(source.next(observation))
      return createHamiltonianNodeSystemDeclaration({
        logicalContourId: contourId,
        incarnation: epoch,
        incarnationStartedAt: startedAt,
        revision: journal.snapshot().revision,
        rootId: serverId,
        snapshot: journal.snapshot(),
      })
    }

    const serverA = serverDeclaration("host-a", 10)
    const serverB = serverDeclaration("host-b", 20)
    const other = serverDeclaration("other-a", 15, "other-lab", otherLogicalContourId)
    const published = []
    expect(projection.replaceDeclaration(serverA)).toBeTrue()
    published.push(projection.document())
    expect(projection.replaceDeclaration(other)).toBeTrue()
    published.push(projection.document())
    expect(projection.replaceDeclaration(serverB)).toBeTrue()
    published.push(projection.document())
    expect(projection.replaceDeclaration(serverA)).toBeFalse()
    published.push(projection.document())

    const document = projection.document()
    expect(document.nodes.filter(({kind}) => kind === "Bun host Hamiltonian").map(({id}) => id))
      .toEqual(["server:host-b", "server:other-a"])
    expect(document.nodes.some(({id}) => id === "peer-process:host-a")).toBeFalse()
    expect(document.nodes.some(({id}) => id === "rtc-peer:host-a%3Aserver")).toBeFalse()
    expect(document.nodes.find(({id}) => id === "peer-process:host-b")?.parentId)
      .toBe("server-contour")
    expect(document.nodes.find(({id}) => id === "rtc-peer:host-b%3Aserver")?.parentId)
      .toBe("peer-process:host-b")
    expect(document.nodes.find(({id}) => id === "rtc-peer:host-b%3Aserver")?.parentId)
      .not.toBeUndefined()
    expect(document.nodes.some(({id}) => id === "server:other-a")).toBeTrue()
    for (const [index, current] of published.entries()) {
      expect(current.nodes.some(({id}) => id === "rtc-peer:host-b%3Aserver" && !current.nodes.find(({id}) => id === "peer-process:host-b")))
        .toBeFalse()
      if (index >= 2) {
        expect(current.nodes.some(({id}) => id === "server:host-a")).toBeFalse()
        expect(current.nodes.some(({id}) => id === "peer-process:host-a")).toBeFalse()
      }
    }
  })

  test("keeps the exact WSS across stale-live permutations until a declaration retires its endpoint", () => {
    const profileLogicalId = hamiltonianLogicalContourId("browser-profile", "profile-a")
    const serverLogicalId = hamiltonianLogicalContourId("server", "hamiltonian-lab")
    const browserId = "browser:profile-a"
    const workerId = "service-worker:worker-a"
    const browserSource = new HamiltonianLifecycleSource({
      id: workerId,
      kind: "service-worker",
      incarnation: "worker-runtime-a",
      startedAt: 5,
    })
    const browserJournal = new HamiltonianLifecycleRetainedJournal(workerId)
    for (const observation of [
      createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: browserId, subjectKind: "browser-runtime",
        ownerId: browserId, attributes: {profileId: "profile-a", runtime: "Chrome"},
      }),
      createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: workerId, subjectKind: "service-worker",
        ownerId: browserId, attributes: {runtimeIncarnation: "worker-runtime-a"},
      }),
    ]) browserJournal.observe(browserSource.next(observation))
    const browserSnapshot = browserJournal.snapshot()
    const initialBrowserDeclaration = createHamiltonianNodeSystemDeclaration({
      logicalContourId: profileLogicalId,
      incarnation: "worker-runtime-a",
      incarnationStartedAt: 5,
      revision: browserSnapshot.revision,
      rootId: browserId,
      snapshot: browserSnapshot,
    })
    const makeServer = (epoch: string, startedAt: number) => {
      const serverId = `server:${epoch}`
      const processId = `peer-process:${epoch}`
      const rtcId = `rtc-peer:${epoch}%3Aserver`
      const transportId = `websocket:${epoch}`
      const source = new HamiltonianLifecycleSource({
        id: serverId,
        kind: "server",
        incarnation: epoch,
        startedAt,
      })
      const journal = new HamiltonianLifecycleRetainedJournal(serverId)
      for (const observation of [
        createHamiltonianLifecycleObservation({
          type: "entity", phase: "born", subjectId: serverId, subjectKind: "server",
          ownerId: serverId, attributes: {identity: "hamiltonian-lab", epoch, state: "live"},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity", phase: "born", subjectId: processId, subjectKind: "peer-process",
          ownerId: serverId, attributes: {incarnation: epoch, state: "active"},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity", phase: "born", subjectId: rtcId, subjectKind: "rtc-peer",
          ownerId: processId, attributes: {endpoint: "server", sessionEpoch: epoch, state: "connected"},
        }),
      ]) journal.observe(source.next(observation))
      const snapshot = journal.snapshot()
      return {
        declaration: createHamiltonianNodeSystemDeclaration({
          logicalContourId: serverLogicalId,
          incarnation: epoch,
          incarnationStartedAt: startedAt,
          revision: snapshot.revision,
          rootId: serverId,
          snapshot,
          boundaryTransports: [{
            transportId,
            kind: "websocket",
            phase: "opened",
            owner: {logicalContourId: profileLogicalId, incarnation: "worker-runtime-a", entityId: workerId},
            source: {logicalContourId: profileLogicalId, incarnation: "worker-runtime-a", entityId: workerId},
            target: {logicalContourId: serverLogicalId, incarnation: epoch, entityId: serverId},
            attributes: {connectionId: `connection-${epoch}`, heartbeat: `observed-${epoch}`},
          }],
        }),
        staleLive: source.next(createHamiltonianLifecycleObservation({
          type: "entity", phase: "changed", subjectId: rtcId, subjectKind: "rtc-peer",
          ownerId: processId, attributes: {endpoint: "server", sessionEpoch: epoch, state: "connected"},
        })),
        serverId,
        transportId,
      }
    }

    for (const staleLiveBeforeSuccessor of [true, false]) {
      const projection = new HamiltonianLifecycleProjection(context)
      const serverA = makeServer("host-a", 10)
      const serverB = makeServer("host-b", 20)
      let browserDeclaration = initialBrowserDeclaration
      const published: NodeSystemDocument[] = []
      expect(projection.replaceDeclaration(browserDeclaration)).toBeTrue()
      published.push(projection.document())
      expect(projection.replaceDeclaration(serverA.declaration)).toBeTrue()
      published.push(projection.document())
      browserDeclaration = createHamiltonianNodeSystemDeclaration({
        ...browserDeclaration,
        revision: browserDeclaration.revision + 1,
        boundaryTransports: serverA.declaration.boundaryTransports,
      })
      expect(projection.replaceDeclaration(browserDeclaration)).toBeTrue()
      published.push(projection.document())
      expect(published.at(-1)?.edges.filter(({label}) => label === "WS" || label === "WSS"))
        .toMatchObject([{id: serverA.transportId}])
      if (staleLiveBeforeSuccessor) {
        projection.replaceSnapshot(serverA.declaration.snapshot)
        published.push(projection.document())
        projection.observe(serverA.staleLive, null)
        published.push(projection.document())
      }
      expect(projection.replaceDeclaration(serverB.declaration)).toBeTrue()
      published.push(projection.document())
      if (!staleLiveBeforeSuccessor) {
        const structuralEvents = projection.retainedStructuralEventCount
        projection.replaceSnapshot(serverA.declaration.snapshot)
        expect(projection.retainedStructuralEventCount).toBe(structuralEvents)
        published.push(projection.document())
        projection.observe(serverA.staleLive, null)
        expect(projection.retainedStructuralEventCount).toBe(structuralEvents)
        published.push(projection.document())
      }

      const successorIndex = staleLiveBeforeSuccessor ? 5 : 3
      for (const [index, document] of published.entries()) {
        const websocketEdges = document.edges.filter(({label}) => label === "WS" || label === "WSS")
        const orphanRtc = document.nodes.some(({id, parentId}) =>
          id.startsWith("rtc-peer:") &&
          (parentId === undefined || !document.nodes.some(({id: ownerId}) => ownerId === parentId)))
        expect(orphanRtc).toBeFalse()
        if (index < successorIndex) continue
        expect(document.nodes.some(({id}) => id === serverA.serverId)).toBeFalse()
        expect(document.nodes.some(({id}) => id === "peer-process:host-a")).toBeFalse()
        expect(document.nodes.some(({id}) => id === "rtc-peer:host-a%3Aserver")).toBeFalse()
        expect(websocketEdges).toHaveLength(1)
        expect(websocketEdges[0]).toMatchObject({
          id: serverB.transportId,
          source: {nodeId: workerId},
          target: {nodeId: serverB.serverId},
        })
        expect(document.nodes.some(({id}) => id === workerId)).toBeTrue()
        expect(document.nodes.some(({id}) => id === serverB.serverId)).toBeTrue()
        expect(document.nodes.find(({id}) => id === "rtc-peer:host-b%3Aserver")?.parentId)
          .toBe("peer-process:host-b")
      }

      const browserSnapshotWithoutWorker = {
        ...browserSnapshot,
        revision: browserSnapshot.revision + 1,
        snapshotId: hamiltonianLifecycleSnapshotId(
          browserSnapshot.scopeId,
          browserSnapshot.revision + 1,
        ),
        envelopes: browserSnapshot.envelopes.filter(({observation}) =>
          observation.subjectId !== workerId),
      }
      projection.replaceSnapshot(browserSnapshotWithoutWorker)
      expect(projection.document().nodes.some(({id}) => id === workerId)).toBeTrue()
      expect(projection.document().edges.filter(({label}) => label === "WS" || label === "WSS"))
        .toMatchObject([{id: serverB.transportId}])

      const unrelatedPageSource = new HamiltonianLifecycleSource({
        id: "page:late-observer",
        kind: "page",
        incarnation: "late-observer",
        startedAt: 30,
      })
      projection.observe(unrelatedPageSource.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "ended", subjectId: workerId, subjectKind: "service-worker",
        ownerId: browserId, attributes: {state: "ended", successor: "service-worker:unconfirmed"},
      })), null)
      expect(projection.document().nodes.some(({id}) => id === workerId)).toBeTrue()
      expect(projection.document().edges.filter(({label}) => label === "WS" || label === "WSS"))
        .toMatchObject([{id: serverB.transportId}])

      const browserDeclarationWithoutWorker = createHamiltonianNodeSystemDeclaration({
        ...initialBrowserDeclaration,
        revision: browserDeclaration.revision + 1,
        snapshot: browserSnapshotWithoutWorker,
      })
      expect(projection.replaceDeclaration(browserDeclarationWithoutWorker)).toBeTrue()
      expect(projection.document().nodes.some(({id}) => id === browserId)).toBeTrue()
      expect(projection.document().nodes.some(({id}) => id === workerId)).toBeFalse()
      expect(projection.document().edges.some(({label}) => label === "WS" || label === "WSS"))
        .toBeFalse()
    }
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
      const label = lane === "oracle" ? "Oracle RTCDataChannel" : "Force RTCDataChannel"
      const encodedLabel = encodeURIComponent(label)
      const matchingEdges = document.edges.filter(({id}) => id === transportId)
      expect(matchingEdges).toHaveLength(1)
      const edge = matchingEdges[0]!
      expect(edge).toEqual(expect.objectContaining({
        source: {nodeId: "rtc-peer:session-a%3Aserver", portId: `out:${encodedLabel}`},
        target: {nodeId: "rtc-peer:session-a%3Abrowser", portId: `in:${encodedLabel}`},
        connectionType: `${lane}-rtc-data-channel`,
      }))
      for (const [nodeId, portId, parameterId] of [
        [edge.source.nodeId, edge.source.portId, `transport:${encodedLabel}:out`],
        [edge.target.nodeId, edge.target.portId, `transport:${encodedLabel}:in`],
      ] as const) {
        const node = document.nodes.find(({id}) => id === nodeId)!
        const port = node.ports?.find(({id}) => id === portId)
        expect(port?.parameterId).toBe(parameterId)
        expect(port?.connectionType).toBe(`${lane}-rtc-data-channel`)
        expect(node.facts?.some(({id}) => id === parameterId)).toBeTrue()
      }
    }
    expect(document.edges.map((edge) => edge.label)).toEqual(expect.arrayContaining([
      "Oracle RTCDataChannel",
      "Force RTCDataChannel",
    ]))
  })

  test("never promotes an RTC child to a root when its peer process ends", () => {
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
    const serverRtcId = "rtc-peer:session-a%3Aserver"
    const browserRtcId = "rtc-peer:session-a%3Abrowser"
    const dataChannelId = "data-channel:session-a%3Aforce"
    for (const observation of [
      createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: "peer-process:process-a", subjectKind: "peer-process",
        ownerId: "server:host-a", attributes: {state: "active"},
      }),
      createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: serverRtcId, subjectKind: "rtc-peer",
        ownerId: "peer-process:process-a", attributes: {endpoint: "server", state: "new"},
      }),
    ]) projection.observe(process.next(observation), null)
    for (const observation of [
      createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: "window-main:page-a", subjectKind: "window-main",
        ownerId: "page:page-a", attributes: {state: "active"},
      }),
      createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: browserRtcId, subjectKind: "rtc-peer",
        ownerId: "window-main:page-a", attributes: {endpoint: "browser", state: "new"},
      }),
    ]) projection.observe(page.next(observation), null)
    projection.observe(process.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "opened", subjectId: dataChannelId, subjectKind: "data-channel",
      ownerId: serverRtcId, sourceEntityId: serverRtcId, targetEntityId: browserRtcId,
      transportId: dataChannelId, attributes: {lane: "force"},
    })), null)

    projection.observe(process.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "ended", subjectId: "peer-process:process-a", subjectKind: "peer-process",
      ownerId: "server:host-a", attributes: {state: "stopped"},
    })), null)

    const document = projection.document()
    expect(document.nodes.some(({id}) => id === "peer-process:process-a")).toBeFalse()
    expect(document.nodes.some(({id}) => id === serverRtcId)).toBeFalse()
    expect(document.nodes.find(({id}) => id === browserRtcId)?.parentId).toBe("window-main:page-a")
    expect(document.edges.some(({id}) => id === dataChannelId)).toBeFalse()

    for (const suffix of ["entity-first", "transport-first"] as const) {
      const lateRtcId = `rtc-peer:late-${suffix}%3Aserver`
      const lateChannelId = `data-channel:late-${suffix}%3Aforce`
      const lateEntity = createHamiltonianLifecycleObservation({
        type: "entity", phase: "changed", subjectId: lateRtcId, subjectKind: "rtc-peer",
        ownerId: "peer-process:process-a", attributes: {endpoint: "server", state: "connected"},
      })
      const lateTransport = createHamiltonianLifecycleObservation({
        type: "transport", phase: "opened", subjectId: lateChannelId, subjectKind: "data-channel",
        ownerId: lateRtcId, sourceEntityId: lateRtcId, targetEntityId: browserRtcId,
        transportId: lateChannelId, attributes: {lane: "force"},
      })
      const ordered = suffix === "entity-first"
        ? [lateEntity, lateTransport]
        : [lateTransport, lateEntity]
      for (const observation of ordered) projection.observe(process.next(observation), null)
      const afterLateDelivery = projection.document()
      expect(afterLateDelivery.nodes.some(({id}) => id === lateRtcId)).toBeFalse()
      expect(afterLateDelivery.edges.some(({id}) => id === lateChannelId)).toBeFalse()
    }
  })

  test("routes both Service Worker API directions through separate sockets on one parameter", () => {
    const projection = new HamiltonianLifecycleProjection(context)
    const page = new HamiltonianLifecycleSource({id: "page:page-a", kind: "page", incarnation: "page-a", startedAt: 1})
    const worker = new HamiltonianLifecycleSource({id: "service-worker:sw", kind: "service-worker", incarnation: "sw", startedAt: 1})
    projection.observe(page.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "born", subjectId: "page:page-a", subjectKind: "page", ownerId: "browser:device-a",
    })), null)
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "born", subjectId: "service-worker:sw", subjectKind: "service-worker", ownerId: "browser:device-a",
    })), null)
    projection.observe(worker.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "opened", subjectId: "service-worker-api:one", subjectKind: "service-worker-api", ownerId: "service-worker:sw",
      sourceEntityId: "page:page-a", targetEntityId: "service-worker:sw", transportId: "service-worker-api:one",
    })), null)
    const forward = page.next(createHamiltonianLifecycleObservation({
      type: "message", phase: "sent", subjectId: "message:forward", subjectKind: "service-worker-api-message", ownerId: "page:page-a",
      sourceEntityId: "page:page-a", targetEntityId: "service-worker:sw", transportId: "service-worker-api:one",
      messageId: "message:forward", messageClass: "window-heartbeat",
    }))
    const reverse = worker.next(createHamiltonianLifecycleObservation({
      type: "message", phase: "sent", subjectId: "message:reverse", subjectKind: "service-worker-api-message", ownerId: "service-worker:sw",
      sourceEntityId: "service-worker:sw", targetEntityId: "page:page-a", transportId: "service-worker-api:one",
      messageId: "message:reverse", messageClass: "worker-state",
    }))
    expect(projection.observe(forward, null)).toMatchObject({
      edgeId: "service-worker-api:one",
      direction: "forward",
    })
    expect(projection.observe(reverse, null)).toMatchObject({
      edgeId: "service-worker-api:one:reverse",
      direction: "forward",
    })
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
