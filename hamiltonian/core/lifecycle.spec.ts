import {describe, expect, test} from "bun:test"
import {
  HamiltonianLifecycleCursor,
  HamiltonianLifecycleRetainedJournal,
  HamiltonianLifecycleSource,
  HamiltonianNodeSystemDeclarationRegistry,
  createHamiltonianLifecycleEnvelope,
  createHamiltonianLifecycleObservation,
  createHamiltonianNodeSystemDeclaration,
  hamiltonianDataChannelTransportId,
  hamiltonianLifecycleSnapshotId,
  hamiltonianRtcPeerEntityId,
  hamiltonianLogicalContourId,
  emitHamiltonianLifecycle,
  isHamiltonianLifecycleEnvelope,
  isHamiltonianLifecycleEnvelopeFromSource,
  isHamiltonianLifecycleOwnershipClosed,
  isHamiltonianLifecycleSnapshot,
  isHamiltonianLifecycleSnapshotFromSource,
  isHamiltonianNodeSystemBoundaryTransport,
  isHamiltonianNodeSystemDeclaration,
  projectHamiltonianLifecycleOwnershipScope,
  projectHamiltonianNodeSystemBoundaryTransports,
  publishHamiltonianLifecycleSnapshot,
  receiveHamiltonianLifecycleEnvelope,
  receiveHamiltonianLifecycleSnapshot,
  subscribeHamiltonianLifecycle,
  subscribeHamiltonianLifecycleSnapshot,
  type HamiltonianNodeSystemDeclaration,
} from "./lifecycle.js"
import {HAMILTONIAN_LIFECYCLE_CHANNEL} from "./monitor.js"
import {pageLifecycleChangesNodeSystem} from "../browser/page-lifecycle-declaration.ts"

const pageBorn = createHamiltonianLifecycleObservation({
  type: "entity",
  phase: "born",
  subjectId: "page:page-a",
  subjectKind: "page",
  ownerId: "page:page-a",
  attributes: {visibility: "visible"},
})

describe("Hamiltonian owner lifecycle", () => {
  test("advances browser declarations only for structural page lifecycle", () => {
    const browserId = "browser:profile-a"
    const workerId = "service-worker:worker-a"
    const pageId = "page:page-a"
    const mainId = "window-main:page-a"
    const rtcA = "rtc-peer:session-a%3Abrowser"
    const rtcB = "rtc-peer:session-b%3Abrowser"
    const workerSource = new HamiltonianLifecycleSource({
      id: workerId,
      kind: "service-worker",
      incarnation: "worker-runtime-a",
      startedAt: 5,
    })
    const pageSource = new HamiltonianLifecycleSource({
      id: "page:page-a",
      kind: "page",
      incarnation: "page-a",
      startedAt: 10,
    })
    const journal = new HamiltonianLifecycleRetainedJournal(workerId)
    for (const envelope of [
      workerSource.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: browserId, subjectKind: "browser-runtime",
        ownerId: browserId, attributes: {profileId: "profile-a"},
      })),
      workerSource.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: workerId, subjectKind: "service-worker",
        ownerId: browserId, attributes: {runtimeIncarnation: "worker-runtime-a"},
      })),
      pageSource.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: pageId, subjectKind: "page",
        ownerId: browserId, attributes: {incarnation: "page-a"},
      })),
      pageSource.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: mainId, subjectKind: "window-main",
        ownerId: pageId, attributes: {role: "main"},
      })),
      pageSource.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: rtcA, subjectKind: "rtc-peer",
        ownerId: mainId, attributes: {endpoint: "browser", sessionEpoch: "session-a"},
      })),
    ]) journal.observe(envelope)
    const logicalContourId = hamiltonianLogicalContourId("browser-profile", "profile-a")
    const declaration = () => {
      const snapshot = projectHamiltonianLifecycleOwnershipScope(journal.snapshot(), [browserId])
      if (snapshot === null) throw new Error("browser declaration snapshot is not ownership-closed")
      return createHamiltonianNodeSystemDeclaration({
        logicalContourId,
        incarnation: "worker-runtime-a",
        incarnationStartedAt: 5,
        revision: snapshot.revision,
        rootId: browserId,
        snapshot,
      })
    }
    const registry = new HamiltonianNodeSystemDeclarationRegistry()
    expect(registry.accept(declaration())).not.toBeNull()

    const ended = pageSource.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "ended", subjectId: rtcA,
      subjectKind: "rtc-peer", ownerId: mainId,
      attributes: {endpoint: "browser", sessionEpoch: "session-a"},
    }))
    const born = pageSource.next(createHamiltonianLifecycleObservation({
      type: "entity", phase: "born", subjectId: rtcB,
      subjectKind: "rtc-peer", ownerId: mainId,
      attributes: {endpoint: "browser", sessionEpoch: "session-b"},
    }))
    const traffic = pageSource.next(createHamiltonianLifecycleObservation({
      type: "message", phase: "sent", subjectId: "message:probe",
      subjectKind: "data-channel-message", ownerId: rtcB,
      sourceEntityId: rtcB,
      targetEntityId: "rtc-peer:session-b%3Aserver",
      transportId: "data-channel:session-b%3Aoracle",
      messageId: "message:probe", messageClass: "probe",
    }))

    const declarationRevisions: number[] = []
    for (const envelope of [ended, born, traffic]) {
      expect(journal.observe(envelope)).toBeTrue()
      if (!pageLifecycleChangesNodeSystem(envelope)) continue
      const accepted = registry.accept(declaration())
      expect(accepted).not.toBeNull()
      declarationRevisions.push(accepted!.declaration.revision)
    }
    expect(declarationRevisions).toHaveLength(2)
    expect(declarationRevisions[1]).toBeGreaterThan(declarationRevisions[0]!)
    expect(registry.current(logicalContourId)?.snapshot.envelopes.some(({observation}) =>
      observation.subjectId === rtcA)).toBeFalse()
    expect(registry.current(logicalContourId)?.snapshot.envelopes.some(({observation}) =>
      observation.subjectId === rtcB)).toBeTrue()
    expect(registry.current(logicalContourId)?.revision).toBe(declarationRevisions[1])
    expect(journal.snapshot().revision).toBeGreaterThan(registry.current(logicalContourId)!.revision)
  })

  test("derives the same peer endpoints and DataChannel incarnation in both runtimes", () => {
    expect(hamiltonianRtcPeerEntityId("session/a", "server"))
      .toBe("rtc-peer:session%2Fa%3Aserver")
    expect(hamiltonianRtcPeerEntityId("session/a", "browser"))
      .toBe("rtc-peer:session%2Fa%3Abrowser")
    expect(hamiltonianDataChannelTransportId("session/a", "oracle"))
      .toBe("data-channel:session%2Fa%3Aoracle")
  })

  test("binds every event to one owner incarnation and monotonic sequence", () => {
    const source = new HamiltonianLifecycleSource({
      id: "page:page-a",
      kind: "page",
      incarnation: "page-a",
      startedAt: 10,
    })
    const first = source.next(pageBorn, {at: 11})
    const changed = source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: "page:page-a",
      subjectKind: "page",
      ownerId: "page:page-a",
      attributes: {visibility: "hidden"},
    }), {at: 12, causedBy: first.eventId})

    expect(first).toEqual({
      kind: "hamiltonian-lifecycle",
      version: 1,
      sourceId: "page:page-a",
      sourceKind: "page",
      sourceIncarnation: "page-a",
      sourceStartedAt: 10,
      sequence: 1,
      eventId: "event:page-a:1",
      at: 11,
      causedBy: null,
      observation: pageBorn,
    })
    expect(changed.sequence).toBe(2)
    expect(changed.causedBy).toBe(first.eventId)
  })

  test("reports every missing owner sequence, including a trimmed initial backlog", () => {
    const source = new HamiltonianLifecycleSource({id: "sw:a", kind: "service-worker", incarnation: "a", startedAt: 1})
    const first = source.next(pageBorn, {at: 2})
    source.next(pageBorn, {at: 3})
    const third = source.next(pageBorn, {at: 4})

    const cursor = new HamiltonianLifecycleCursor()
    expect(cursor.accept(first)).toEqual({envelope: first, gap: null})
    expect(cursor.accept(third)?.gap).toEqual({
      sourceId: "sw:a",
      sourceIncarnation: "a",
      expectedSequence: 2,
      receivedSequence: 3,
      missingFrom: 2,
      missingTo: 2,
    })
    expect(cursor.accept(third)).toBeNull()

    const lateCursor = new HamiltonianLifecycleCursor()
    expect(lateCursor.accept(third)?.gap).toEqual(expect.objectContaining({missingFrom: 1, missingTo: 2}))
  })

  test("starts live continuation at a retained structural causal frontier", () => {
    const serverId = "server:epoch-a"
    const processId = "peer-process:incarnation-a"
    const transportId = "ipc:incarnation-a"
    const source = new HamiltonianLifecycleSource({
      id: processId,
      kind: "peer-process",
      incarnation: "incarnation-a",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal(serverId)
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: processId,
      subjectKind: "peer-process",
      ownerId: serverId,
      attributes: {state: "online"},
    })))
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: transportId,
      subjectKind: "ipc",
      ownerId: processId,
      sourceEntityId: serverId,
      targetEntityId: processId,
      transportId,
      attributes: {state: "open"},
    })))
    for (let index = 0; index < 110; index += 1) {
      const messageId = `message:${index}`
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "message",
        phase: "sent",
        subjectId: messageId,
        subjectKind: "ipc-message",
        ownerId: processId,
        sourceEntityId: processId,
        targetEntityId: serverId,
        transportId,
        messageId,
        messageClass: "peer-state",
      })))
    }

    const snapshot = journal.snapshot()
    expect(isHamiltonianLifecycleSnapshot(snapshot)).toBeTrue()
    expect(snapshot.envelopes.map(({observation}) => observation.type)).toEqual(["entity", "transport"])
    expect(snapshot.frontier).toContainEqual({
      sourceId: processId,
      sourceIncarnation: "incarnation-a",
      sequence: 112,
    })
    expect(journal.observe(snapshot.envelopes[0])).toBeFalse()
    expect(journal.snapshot().revision).toBe(112)

    const cursor = new HamiltonianLifecycleCursor()
    cursor.seed(snapshot.frontier)
    const nextMessageId = "message:live"
    const live = source.next(createHamiltonianLifecycleObservation({
      type: "message",
      phase: "sent",
      subjectId: nextMessageId,
      subjectKind: "ipc-message",
      ownerId: processId,
      sourceEntityId: processId,
      targetEntityId: serverId,
      transportId,
      messageId: nextMessageId,
      messageClass: "peer-state",
    }))
    expect(cursor.accept(live)).toEqual({envelope: live, gap: null})
    expect(journal.observe(live)).toBeTrue()
    const continued = journal.snapshot()
    expect(continued.revision).toBe(113)
    expect(continued.envelopes.map(({observation}) => observation.type)).toEqual(["entity", "transport"])
    expect(isHamiltonianLifecycleSnapshot({...continued, envelopes: [live]})).toBeFalse()
    expect(isHamiltonianLifecycleSnapshot({
      ...continued,
      envelopes: [continued.envelopes[0], continued.envelopes[0]],
    })).toBeFalse()
    expect(journal.replace(snapshot)).toBeFalse()
    const ended = source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: processId,
      subjectKind: "peer-process",
      ownerId: serverId,
    }))
    expect(journal.observe(ended)).toBeTrue()
    const endedSnapshot = journal.snapshot()
    expect(isHamiltonianLifecycleSnapshot({...endedSnapshot, envelopes: [ended]})).toBeFalse()
  })

  test("merges exact page snapshots into one retained browser lifecycle", () => {
    const browserId = "browser:device-a"
    const createPage = (incarnation: string) => {
      const pageId = `page:${incarnation}`
      const source = new HamiltonianLifecycleSource({
        id: pageId,
        kind: "page",
        incarnation,
        startedAt: 1,
      })
      const journal = new HamiltonianLifecycleRetainedJournal(pageId)
      for (const observation of [
        createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "born",
          subjectId: browserId,
          subjectKind: "browser-runtime",
          ownerId: browserId,
          attributes: {runtime: "Chrome"},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "born",
          subjectId: pageId,
          subjectKind: "page",
          ownerId: browserId,
          attributes: {incarnation},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "born",
          subjectId: `window-main:${incarnation}`,
          subjectKind: "window-main",
          ownerId: pageId,
          attributes: {incarnation},
        }),
      ]) journal.observe(source.next(observation))
      return {incarnation, pageId, source, journal}
    }

    const pageA = createPage("page-a")
    const pageB = createPage("page-b")
    const aggregate = new HamiltonianLifecycleRetainedJournal("service-worker:worker-a")
    const snapshotA = pageA.journal.snapshot()
    expect(isHamiltonianLifecycleSnapshotFromSource(
      snapshotA,
      pageA.pageId,
      pageA.pageId,
      "page",
      pageA.incarnation,
    )).toBeTrue()
    expect(aggregate.merge(snapshotA)).toBeTrue()
    expect(aggregate.merge(snapshotA)).toBeFalse()
    expect(aggregate.merge(pageB.journal.snapshot())).toBeTrue()
    expect(aggregate.snapshot().envelopes.map(({observation}) => observation.subjectId).sort())
      .toEqual([
        browserId,
        pageA.pageId,
        pageB.pageId,
        "window-main:page-a",
        "window-main:page-b",
      ].sort())

    pageA.journal.observe(pageA.source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: pageA.pageId,
      subjectKind: "page",
      ownerId: browserId,
      attributes: {incarnation: pageA.incarnation},
    })))
    expect(aggregate.merge(pageA.journal.snapshot())).toBeTrue()
    expect(aggregate.snapshot().envelopes.map(({observation}) => observation.subjectId).sort())
      .toEqual([browserId, pageB.pageId, "window-main:page-b"].sort())
  })

  test("accepts only retained entity trees closed to their declared owner root", () => {
    const browserId = "browser:profile-a"
    const workerId = "service-worker:worker-a"
    const source = new HamiltonianLifecycleSource({
      id: workerId,
      kind: "service-worker",
      incarnation: "runtime-a",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal(workerId)
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: browserId,
      subjectKind: "browser-runtime",
      ownerId: browserId,
      attributes: {profileId: "profile-a", runtime: "Chrome"},
    })))
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: workerId,
      subjectKind: "service-worker",
      ownerId: browserId,
      attributes: {identity: "worker-a"},
    })))
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "paint-worklet:worklet-a",
      subjectKind: "paint-worklet",
      ownerId: browserId,
      attributes: {state: "active"},
    })))
    const closed = journal.snapshot()
    expect(isHamiltonianLifecycleOwnershipClosed(closed, [browserId])).toBeTrue()
    expect(isHamiltonianLifecycleOwnershipClosed(closed, ["browser:profile-b"])).toBeFalse()

    const orphanJournal = new HamiltonianLifecycleRetainedJournal("service-worker:orphan")
    orphanJournal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: "service-worker:orphan",
      subjectKind: "service-worker",
      ownerId: "browser:missing",
      attributes: {identity: "orphan"},
    })))
    expect(isHamiltonianLifecycleOwnershipClosed(orphanJournal.snapshot(), ["browser:missing"]))
      .toBeFalse()

    const cycleSource = new HamiltonianLifecycleSource({
      id: "page:cycle",
      kind: "page",
      incarnation: "cycle",
      startedAt: 1,
    })
    const cycleJournal = new HamiltonianLifecycleRetainedJournal("cycle")
    cycleJournal.observe(cycleSource.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: browserId,
      subjectKind: "browser-runtime",
      ownerId: browserId,
      attributes: {profileId: "profile-a"},
    })))
    cycleJournal.observe(cycleSource.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "page:one",
      subjectKind: "page",
      ownerId: "page:two",
      attributes: {},
    })))
    cycleJournal.observe(cycleSource.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "page:two",
      subjectKind: "page",
      ownerId: "page:one",
      attributes: {},
    })))
    expect(isHamiltonianLifecycleOwnershipClosed(cycleJournal.snapshot(), [browserId])).toBeFalse()

    const profileTransportSnapshot = (
      refs: Readonly<{ownerId: string; sourceEntityId: string; targetEntityId: string}>,
      includeProfileB = false,
    ) => {
      const profileBId = "browser:profile-b"
      const workerBId = "service-worker:worker-b"
      const pageId = "page:profile-a"
      const transportSource = new HamiltonianLifecycleSource({
        id: workerId,
        kind: "service-worker",
        incarnation: `transport-${includeProfileB ? "two-roots" : "one-root"}`,
        startedAt: 2,
      })
      const transportJournal = new HamiltonianLifecycleRetainedJournal(workerId)
      for (const observation of [
        createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "born",
          subjectId: browserId,
          subjectKind: "browser-runtime",
          ownerId: browserId,
          attributes: {profileId: "profile-a"},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "born",
          subjectId: workerId,
          subjectKind: "service-worker",
          ownerId: browserId,
          attributes: {identity: "worker-a"},
        }),
        createHamiltonianLifecycleObservation({
          type: "entity",
          phase: "born",
          subjectId: pageId,
          subjectKind: "page",
          ownerId: browserId,
          attributes: {incarnation: "profile-a"},
        }),
        ...(includeProfileB ? [
          createHamiltonianLifecycleObservation({
            type: "entity",
            phase: "born",
            subjectId: profileBId,
            subjectKind: "browser-runtime",
            ownerId: profileBId,
            attributes: {profileId: "profile-b"},
          }),
          createHamiltonianLifecycleObservation({
            type: "entity",
            phase: "born",
            subjectId: workerBId,
            subjectKind: "service-worker",
            ownerId: profileBId,
            attributes: {identity: "worker-b"},
          }),
        ] : []),
        createHamiltonianLifecycleObservation({
          type: "transport",
          phase: "opened",
          subjectId: "service-worker-api:profile-a",
          subjectKind: "service-worker-api",
          ownerId: refs.ownerId,
          sourceEntityId: refs.sourceEntityId,
          targetEntityId: refs.targetEntityId,
          transportId: "service-worker-api:profile-a",
          attributes: {state: "active"},
        }),
      ]) transportJournal.observe(transportSource.next(observation))
      return transportJournal.snapshot()
    }
    const validRefs = {ownerId: workerId, sourceEntityId: "page:profile-a", targetEntityId: workerId}
    expect(isHamiltonianLifecycleOwnershipClosed(
      profileTransportSnapshot(validRefs),
      [browserId],
    )).toBeTrue()
    for (const invalidRefs of [
      {...validRefs, ownerId: "service-worker:missing-owner"},
      {...validRefs, sourceEntityId: "page:missing-source"},
      {...validRefs, targetEntityId: "service-worker:missing-target"},
    ]) {
      expect(isHamiltonianLifecycleOwnershipClosed(
        profileTransportSnapshot(invalidRefs),
        [browserId],
      )).toBeFalse()
    }
    expect(isHamiltonianLifecycleOwnershipClosed(
      profileTransportSnapshot({...validRefs, targetEntityId: "service-worker:worker-b"}, true),
      [browserId, "browser:profile-b"],
    )).toBeFalse()
  })

  test("retains one monotonic declaration per logical contour and validates exact boundary endpoints", () => {
    const browserLogicalId = hamiltonianLogicalContourId("browser-profile", "profile-a")
    const browserRootId = "browser:profile-a"
    const workerId = "service-worker:worker-a"
    const browserSource = new HamiltonianLifecycleSource({
      id: "service-worker:runtime-a",
      kind: "service-worker",
      incarnation: "runtime-a",
      startedAt: 5,
    })
    const browserJournal = new HamiltonianLifecycleRetainedJournal(workerId)
    for (const observation of [
      createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: browserRootId, subjectKind: "browser-runtime",
        ownerId: browserRootId, attributes: {profileId: "profile-a"},
      }),
      createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: workerId, subjectKind: "service-worker",
        ownerId: browserRootId, attributes: {runtimeIncarnation: "runtime-a"},
      }),
    ]) browserJournal.observe(browserSource.next(observation))
    const browserDeclaration = createHamiltonianNodeSystemDeclaration({
      logicalContourId: browserLogicalId,
      incarnation: "runtime-a",
      incarnationStartedAt: 5,
      revision: browserJournal.snapshot().revision,
      rootId: browserRootId,
      snapshot: browserJournal.snapshot(),
    })

    const serverDeclaration = (
      identity: string,
      epoch: string,
      startedAt: number,
      withBoundary = false,
    ) => {
      const logicalContourId = hamiltonianLogicalContourId("server", identity)
      const rootId = `server:${epoch}`
      const source = new HamiltonianLifecycleSource({
        id: rootId,
        kind: "server",
        incarnation: epoch,
        startedAt,
      })
      const journal = new HamiltonianLifecycleRetainedJournal(rootId)
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: rootId, subjectKind: "server",
        ownerId: rootId, attributes: {identity, epoch},
      })))
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "changed", subjectId: rootId, subjectKind: "server",
        ownerId: rootId, attributes: {identity, epoch, state: "live"},
      })))
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: `peer-process:${epoch}`, subjectKind: "peer-process",
        ownerId: rootId, attributes: {incarnation: epoch, state: "active"},
      })))
      return createHamiltonianNodeSystemDeclaration({
        logicalContourId,
        incarnation: epoch,
        incarnationStartedAt: startedAt,
        revision: journal.snapshot().revision,
        rootId,
        snapshot: journal.snapshot(),
        boundaryTransports: withBoundary ? [{
          transportId: `websocket:${epoch}`,
          kind: "websocket",
          phase: "opened",
          owner: {logicalContourId: browserLogicalId, incarnation: "runtime-a", entityId: workerId},
          source: {logicalContourId: browserLogicalId, incarnation: "runtime-a", entityId: workerId},
          target: {logicalContourId, incarnation: epoch, entityId: rootId},
          attributes: {connectionId: `connection-${epoch}`, heartbeat: "observed"},
        }] : [],
      })
    }

    expect(isHamiltonianNodeSystemDeclaration(browserDeclaration)).toBeTrue()
    const registry = new HamiltonianNodeSystemDeclarationRegistry()
    expect(registry.accept(serverDeclaration("hamiltonian-lab", "host-a", 10, true))).toBeNull()
    expect(registry.accept(browserDeclaration)?.previous).toBeNull()

    const serverA = serverDeclaration("hamiltonian-lab", "host-a", 10, true)
    const serverB = serverDeclaration("hamiltonian-lab", "host-b", 20, true)
    const serverOther = serverDeclaration("other-lab", "other-a", 15)
    const projectWebSocket = (references: {
      ownerId: string
      sourceEntityId: string
      targetEntityId: string
    }) => {
      const observed = new HamiltonianLifecycleRetainedJournal(serverA.rootId)
      expect(observed.merge(serverA.snapshot)).toBeTrue()
      expect(observed.merge(browserDeclaration.snapshot)).toBeTrue()
      const observerIncarnation = crypto.randomUUID()
      const observer = new HamiltonianLifecycleSource({
        id: `server-observer:${observerIncarnation}`,
        kind: "server",
        incarnation: observerIncarnation,
        startedAt: 11,
      })
      expect(observed.observe(observer.next(createHamiltonianLifecycleObservation({
        type: "transport", phase: "opened", subjectId: "websocket:host-a",
        subjectKind: "websocket", ...references, transportId: "websocket:host-a",
        attributes: {connectionId: "connection-host-a", heartbeat: "observed"},
      })))).toBeTrue()
      return projectHamiltonianNodeSystemBoundaryTransports({
        logicalContourId: serverA.logicalContourId,
        incarnation: serverA.incarnation,
        rootId: serverA.rootId,
        snapshot: serverA.snapshot,
        observedSnapshot: observed.snapshot(),
        declarations: [browserDeclaration, serverA],
      })
    }
    expect(projectWebSocket({
      ownerId: workerId,
      sourceEntityId: workerId,
      targetEntityId: serverA.rootId,
    }).map(({transportId}) => transportId)).toEqual(["websocket:host-a"])
    expect(projectWebSocket({
      ownerId: serverA.rootId,
      sourceEntityId: workerId,
      targetEntityId: serverA.rootId,
    })).toEqual([])
    expect(projectWebSocket({
      ownerId: workerId,
      sourceEntityId: workerId,
      targetEntityId: "peer-process:host-a",
    })).toEqual([])
    expect(projectWebSocket({
      ownerId: serverA.rootId,
      sourceEntityId: serverA.rootId,
      targetEntityId: workerId,
    })).toEqual([])
    expect(registry.accept(serverA)?.declaration).toBe(serverA)
    const browserWithBoundary = createHamiltonianNodeSystemDeclaration({
      ...browserDeclaration,
      revision: browserDeclaration.revision + 1,
      boundaryTransports: serverA.boundaryTransports,
    })
    expect(registry.accept(browserWithBoundary)?.declaration).toBe(browserWithBoundary)
    expect(registry.accept(createHamiltonianNodeSystemDeclaration({
      ...serverOther,
      boundaryTransports: serverA.boundaryTransports,
    }))).toBeNull()
    expect(registry.accept(serverOther)?.declaration).toBe(serverOther)
    const replacement = registry.accept(serverB)
    expect(replacement?.previous).toBe(serverA)
    expect(replacement?.reconciled).toHaveLength(1)
    expect(replacement?.reconciled[0]?.previous).toBe(browserWithBoundary)
    expect(replacement?.reconciled[0]?.declaration.boundaryTransports).toEqual([])
    expect(registry.current(hamiltonianLogicalContourId("server", "hamiltonian-lab"))).toBe(serverB)
    expect(registry.current(hamiltonianLogicalContourId("server", "other-lab"))).toBe(serverOther)
    expect(registry.current(browserLogicalId)?.boundaryTransports).toEqual([])
    expect(registry.accept(serverA)).toBeNull()
    expect(registry.accept(serverB)).toBeNull()
    expect(registry.accept(serverDeclaration("hamiltonian-lab", "host-c", 20))).toBeNull()

    const regressedSnapshot = {
      ...serverB.snapshot,
      revision: serverB.snapshot.revision + 1,
      snapshotId: hamiltonianLifecycleSnapshotId(serverB.snapshot.scopeId, serverB.snapshot.revision + 1),
      frontier: serverB.snapshot.frontier.map((entry) => ({...entry, sequence: entry.sequence - 1})),
      envelopes: serverB.snapshot.envelopes.map((envelope) => ({...envelope, sequence: envelope.sequence - 1,
        eventId: `event:${envelope.sourceIncarnation}:${envelope.sequence - 1}`})),
    }
    const regressedFrontier = createHamiltonianNodeSystemDeclaration({
      ...serverB,
      revision: serverB.revision + 1,
      snapshot: regressedSnapshot,
      boundaryTransports: [],
    })
    expect(registry.accept(regressedFrontier)).toBeNull()
  })

  test("accepts DataChannel boundaries only for exact current RTC endpoints", () => {
    const browserLogicalId = hamiltonianLogicalContourId("browser-profile", "profile-a")
    const serverLogicalId = hamiltonianLogicalContourId("server", "hamiltonian-lab")
    const browserRootId = "browser:profile-a"
    const browserRtcId = hamiltonianRtcPeerEntityId("session-a", "browser")
    const serverRootId = "server:host-a"
    const serverRtcId = hamiltonianRtcPeerEntityId("session-a", "server")
    const makeDeclaration = (
      logicalContourId: string,
      incarnation: string,
      startedAt: number,
      rootId: string,
      rtcId: string,
      endpoint: "browser" | "server",
    ) => {
      const source = new HamiltonianLifecycleSource({
        id: rootId,
        kind: endpoint === "browser" ? "browser-runtime" : "server",
        incarnation,
        startedAt,
      })
      const journal = new HamiltonianLifecycleRetainedJournal(rootId)
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: rootId,
        subjectKind: endpoint === "browser" ? "browser-runtime" : "server",
        ownerId: rootId, attributes: {state: "active"},
      })))
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity", phase: "born", subjectId: rtcId, subjectKind: "rtc-peer",
        ownerId: rootId, attributes: {endpoint, sessionEpoch: "session-a", state: "connected"},
      })))
      const snapshot = journal.snapshot()
      return createHamiltonianNodeSystemDeclaration({
        logicalContourId,
        incarnation,
        incarnationStartedAt: startedAt,
        revision: snapshot.revision,
        rootId,
        snapshot,
      })
    }
    const browser = makeDeclaration(
      browserLogicalId, "runtime-a", 5, browserRootId, browserRtcId, "browser",
    )
    const server = makeDeclaration(
      serverLogicalId, "host-a", 10, serverRootId, serverRtcId, "server",
    )
    const boundary = {
      transportId: hamiltonianDataChannelTransportId("session-a", "oracle"),
      kind: "data-channel",
      phase: "opened" as const,
      owner: {logicalContourId: serverLogicalId, incarnation: "host-a", entityId: serverRtcId},
      source: {logicalContourId: serverLogicalId, incarnation: "host-a", entityId: serverRtcId},
      target: {logicalContourId: browserLogicalId, incarnation: "runtime-a", entityId: browserRtcId},
      attributes: {endpoint: "server", lane: "oracle", sessionEpoch: "session-a", state: "open"},
    }
    expect(isHamiltonianNodeSystemBoundaryTransport(boundary)).toBeTrue()
    for (const invalid of [
      {...boundary, owner: boundary.target},
      {...boundary, phase: "changed"},
      {...boundary, transportId: hamiltonianDataChannelTransportId("session-a", "force")},
      {...boundary, attributes: {...boundary.attributes, lane: "bulk"}},
      {...boundary, attributes: {...boundary.attributes, endpoint: "browser"}},
      {...boundary, attributes: {...boundary.attributes, state: "closed"}},
    ]) expect(isHamiltonianNodeSystemBoundaryTransport(invalid)).toBeFalse()
    const withBoundary = createHamiltonianNodeSystemDeclaration({
      ...server,
      revision: server.revision + 1,
      boundaryTransports: [boundary],
    })
    const registry = new HamiltonianNodeSystemDeclarationRegistry()
    expect(registry.accept(browser)).not.toBeNull()
    expect(registry.accept(withBoundary)).not.toBeNull()

    for (const exactMismatch of [
      {
        ...boundary,
        owner: boundary.target,
        source: boundary.target,
        target: boundary.source,
      },
      {
        ...boundary,
        owner: {...boundary.owner, incarnation: "host-stale"},
        source: {...boundary.source, incarnation: "host-stale"},
      },
    ]) {
      expect(isHamiltonianNodeSystemBoundaryTransport(exactMismatch)).toBeTrue()
      const mismatchRegistry = new HamiltonianNodeSystemDeclarationRegistry()
      expect(mismatchRegistry.accept(browser)).not.toBeNull()
      expect(mismatchRegistry.accept(createHamiltonianNodeSystemDeclaration({
        ...server,
        revision: server.revision + 1,
        boundaryTransports: [exactMismatch],
      }))).toBeNull()
    }

    const forgedSession = {
      ...boundary,
      transportId: hamiltonianDataChannelTransportId("session-b", "oracle"),
      attributes: {...boundary.attributes, sessionEpoch: "session-b"},
    }
    expect(isHamiltonianNodeSystemBoundaryTransport(forgedSession)).toBeTrue()
    const forgedRegistry = new HamiltonianNodeSystemDeclarationRegistry()
    expect(forgedRegistry.accept(browser)).not.toBeNull()
    expect(forgedRegistry.accept(createHamiltonianNodeSystemDeclaration({
      ...server,
      revision: server.revision + 1,
      boundaryTransports: [forgedSession],
    }))).toBeNull()

    const closed = {
      ...boundary,
      phase: "closed" as const,
      attributes: {...boundary.attributes, state: "closed"},
    }
    expect(isHamiltonianNodeSystemBoundaryTransport(closed)).toBeFalse()
    expect(() => createHamiltonianNodeSystemDeclaration({
      ...server,
      revision: server.revision + 1,
      boundaryTransports: [closed],
    })).toThrow("invalid Hamiltonian node-system declaration")

    const observed = new HamiltonianLifecycleRetainedJournal(serverRootId)
    expect(observed.merge(server.snapshot)).toBeTrue()
    expect(observed.merge(browser.snapshot)).toBeTrue()
    const serverSource = new HamiltonianLifecycleSource({
      id: "peer-process:observer-a",
      kind: "peer-process",
      incarnation: "observer-a",
      startedAt: 11,
    })
    expect(observed.observe(serverSource.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "opened", subjectId: boundary.transportId,
      subjectKind: "data-channel", ownerId: serverRtcId, sourceEntityId: serverRtcId,
      targetEntityId: browserRtcId, transportId: boundary.transportId,
      attributes: boundary.attributes,
    })))).toBeTrue()
    const projectObserved = (declarations: readonly HamiltonianNodeSystemDeclaration[]) =>
      projectHamiltonianNodeSystemBoundaryTransports({
        logicalContourId: serverLogicalId,
        incarnation: "host-a",
        rootId: serverRootId,
        snapshot: server.snapshot,
        observedSnapshot: observed.snapshot(),
        declarations,
      })
    expect(projectObserved([browser, server]).map(({transportId}) => transportId))
      .toEqual([boundary.transportId])
    const duplicateBrowserRtc = makeDeclaration(
      hamiltonianLogicalContourId("browser-profile", "profile-duplicate"),
      "runtime-duplicate",
      6,
      "browser:profile-duplicate",
      browserRtcId,
      "browser",
    )
    expect(projectObserved([browser, duplicateBrowserRtc, server])).toEqual([])

    expect(observed.observe(serverSource.next(createHamiltonianLifecycleObservation({
      type: "transport", phase: "closed", subjectId: boundary.transportId,
      subjectKind: "data-channel", ownerId: serverRtcId, sourceEntityId: serverRtcId,
      targetEntityId: browserRtcId, transportId: boundary.transportId,
      attributes: {...boundary.attributes, state: "closed"},
    })))).toBeTrue()
    expect(projectObserved([browser, server])).toEqual([])
  })

  test("projects a browser ownership scope without its externally observed server transport", () => {
    const browserId = "browser:profile-a"
    const workerId = "service-worker:worker-a"
    const pageId = "page:profile-a"
    const serverId = "server:host-a"
    const serviceWorkerTransportId = "service-worker-api:profile-a"
    const webSocketTransportId = "websocket:profile-a"
    const source = new HamiltonianLifecycleSource({
      id: workerId,
      kind: "service-worker",
      incarnation: "runtime-a",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal(workerId)
    for (const observation of [
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: browserId,
        subjectKind: "browser-runtime",
        ownerId: browserId,
        attributes: {profileId: "profile-a"},
      }),
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: workerId,
        subjectKind: "service-worker",
        ownerId: browserId,
        attributes: {identity: "worker-a"},
      }),
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: pageId,
        subjectKind: "page",
        ownerId: browserId,
        attributes: {incarnation: "page-a"},
      }),
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: serverId,
        subjectKind: "bun-host",
        ownerId: serverId,
        attributes: {state: "active"},
      }),
      createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "opened",
        subjectId: serviceWorkerTransportId,
        subjectKind: "service-worker-api",
        ownerId: workerId,
        sourceEntityId: pageId,
        targetEntityId: workerId,
        transportId: serviceWorkerTransportId,
        attributes: {state: "active"},
      }),
      createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "opened",
        subjectId: webSocketTransportId,
        subjectKind: "websocket",
        ownerId: workerId,
        sourceEntityId: workerId,
        targetEntityId: serverId,
        transportId: webSocketTransportId,
        attributes: {state: "active"},
      }),
    ]) journal.observe(source.next(observation))

    const full = journal.snapshot()
    expect(isHamiltonianLifecycleOwnershipClosed(full, [browserId, serverId])).toBeFalse()
    const projected = projectHamiltonianLifecycleOwnershipScope(full, [browserId])
    expect(projected).not.toBeNull()
    if (!projected) throw new Error("browser ownership projection failed")
    const projectedIds = projected.envelopes.map(({observation}) => observation.subjectId)
    expect(projectedIds).toEqual([
      browserId,
      workerId,
      pageId,
      serviceWorkerTransportId,
    ])
    expect(projectedIds).not.toContain(serverId)
    expect(projectedIds).not.toContain(webSocketTransportId)
    expect(isHamiltonianLifecycleOwnershipClosed(projected, [browserId])).toBeTrue()
  })

  test("forgets an unreachable ownership subtree without fencing its stable identity", () => {
    const browserId = "browser:stable-profile"
    const pageId = "page:stable-profile"
    const transportId = "service-worker-api:stable-profile"
    const source = new HamiltonianLifecycleSource({
      id: "service-worker:stable-profile",
      kind: "service-worker",
      incarnation: "runtime-a",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal("service-worker:stable-profile")
    const observeTree = () => {
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "changed",
        subjectId: browserId,
        subjectKind: "browser-runtime",
        ownerId: browserId,
        attributes: {profileId: "stable-profile", state: "active"},
      })))
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "changed",
        subjectId: pageId,
        subjectKind: "page",
        ownerId: browserId,
        attributes: {state: "live"},
      })))
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "opened",
        subjectId: transportId,
        subjectKind: "service-worker-api",
        ownerId: pageId,
        sourceEntityId: pageId,
        targetEntityId: "service-worker:stable-profile",
        transportId,
        attributes: {state: "active"},
      })))
    }
    observeTree()
    expect(journal.forgetEntityTree(browserId)).toBeTrue()
    expect(journal.snapshot().envelopes.map(({observation}) => observation.subjectId))
      .not.toContain(browserId)
    expect(journal.snapshot().envelopes.map(({observation}) => observation.subjectId))
      .not.toContain(pageId)
    expect(journal.snapshot().envelopes.map(({observation}) => observation.subjectId))
      .not.toContain(transportId)

    observeTree()
    expect(journal.snapshot().envelopes.map(({observation}) => observation.subjectId))
      .toEqual(expect.arrayContaining([browserId, pageId, transportId]))
  })

  test("starts a restarted retained scope from an explicit monotonic revision base", () => {
    const journal = new HamiltonianLifecycleRetainedJournal("service-worker:stable", {
      initialRevision: 10_000,
    })
    expect(journal.snapshot().revision).toBe(10_000)
    const source = new HamiltonianLifecycleSource({
      id: "service-worker:runtime-a",
      kind: "service-worker",
      incarnation: "runtime-a",
      startedAt: 1,
    })
    expect(journal.observe(source.next(pageBorn))).toBeTrue()
    expect(journal.snapshot().revision).toBe(10_001)
    expect(() => new HamiltonianLifecycleRetainedJournal("service-worker:stable", {
      initialRevision: -1,
    })).toThrow("invalid Hamiltonian lifecycle initial revision")
  })

  test("accepts directed lifecycle only from the exact connected page source", () => {
    const source = new HamiltonianLifecycleSource({
      id: "page:page-a",
      kind: "page",
      incarnation: "page-a",
      startedAt: 1,
    })
    const envelope = source.next(pageBorn)
    expect(isHamiltonianLifecycleEnvelopeFromSource(
      envelope,
      "page:page-a",
      "page",
      "page-a",
    )).toBeTrue()
    expect(isHamiltonianLifecycleEnvelopeFromSource(
      envelope,
      "page:page-b",
      "page",
      "page-b",
    )).toBeFalse()
    expect(isHamiltonianLifecycleSnapshotFromSource(
      new HamiltonianLifecycleRetainedJournal("page:page-a").snapshot(),
      "page:page-a",
      "page:page-a",
      "page",
      "page-a",
    )).toBeFalse()
  })

  test("retires an owned RTC subtree when its peer process ends", () => {
    const serverId = "server:epoch-a"
    const processId = "peer-process:incarnation-a"
    const serverRtcId = "rtc-peer:session-a%3Aserver"
    const browserRtcId = "rtc-peer:session-a%3Abrowser"
    const dataChannelId = "data-channel:session-a%3Aforce"
    const source = new HamiltonianLifecycleSource({
      id: processId,
      kind: "peer-process",
      incarnation: "incarnation-a",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal(serverId)
    for (const observation of [
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: processId,
        subjectKind: "peer-process",
        ownerId: serverId,
      }),
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: serverRtcId,
        subjectKind: "rtc-peer",
        ownerId: processId,
        attributes: {endpoint: "server"},
      }),
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: browserRtcId,
        subjectKind: "rtc-peer",
        ownerId: "window-main:page-a",
        attributes: {endpoint: "browser"},
      }),
      createHamiltonianLifecycleObservation({
        type: "transport",
        phase: "opened",
        subjectId: dataChannelId,
        subjectKind: "data-channel",
        ownerId: serverRtcId,
        sourceEntityId: serverRtcId,
        targetEntityId: browserRtcId,
        transportId: dataChannelId,
        attributes: {lane: "force"},
      }),
    ]) journal.observe(source.next(observation))

    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: processId,
      subjectKind: "peer-process",
      ownerId: serverId,
    })))

    const retained = journal.snapshot().envelopes.map(({observation}) => observation.subjectId)
    expect(retained).toEqual([browserRtcId])

    expect(journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: serverRtcId,
      subjectKind: "rtc-peer",
      ownerId: processId,
      attributes: {endpoint: "server", state: "connected"},
    })))).toBeTrue()
    expect(journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: dataChannelId,
      subjectKind: "data-channel",
      ownerId: serverRtcId,
      sourceEntityId: serverRtcId,
      targetEntityId: browserRtcId,
      transportId: dataChannelId,
      attributes: {lane: "force"},
    })))).toBeTrue()
    expect(journal.snapshot().envelopes.map(({observation}) => observation.subjectId))
      .toEqual([browserRtcId])

    const neverRetainedRtcId = "rtc-peer:late-session%3Aserver"
    const neverRetainedChannelId = "data-channel:late-session%3Aforce"
    expect(journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: neverRetainedChannelId,
      subjectKind: "data-channel",
      ownerId: neverRetainedRtcId,
      sourceEntityId: neverRetainedRtcId,
      targetEntityId: browserRtcId,
      transportId: neverRetainedChannelId,
      attributes: {lane: "force"},
    })))).toBeTrue()
    expect(journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: neverRetainedRtcId,
      subjectKind: "rtc-peer",
      ownerId: processId,
      attributes: {endpoint: "server", state: "connected"},
    })))).toBeTrue()
    expect(journal.snapshot().envelopes.map(({observation}) => observation.subjectId))
      .toEqual([browserRtcId])
  })

  test("retains one latest transport incarnation per logical slot, including closed state", () => {
    const serverId = "server:host-a"
    const workerId = "service-worker:worker-a"
    const source = new HamiltonianLifecycleSource({
      id: workerId,
      kind: "service-worker",
      incarnation: "worker-a",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal(workerId)
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: workerId,
      subjectKind: "service-worker",
      ownerId: workerId,
    })))
    const opened = source.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: "websocket:one",
      subjectKind: "websocket",
      ownerId: workerId,
      sourceEntityId: workerId,
      targetEntityId: serverId,
      transportId: "websocket:one",
      attributes: {protocol: "ws"},
    }))
    journal.observe(opened)
    const closed = source.next(createHamiltonianLifecycleObservation({
      ...opened.observation,
      phase: "closed",
      attributes: {code: 1006, reason: "network"},
    }))
    journal.observe(closed)

    const terminalSnapshot = journal.snapshot()
    expect(isHamiltonianLifecycleSnapshot(terminalSnapshot)).toBeTrue()
    expect(terminalSnapshot.envelopes.map(({observation}) => [observation.subjectId, observation.phase]))
      .toContainEqual(["websocket:one", "closed"])

    const replacement = source.next(createHamiltonianLifecycleObservation({
      ...opened.observation,
      phase: "opening",
      subjectId: "websocket:two",
      transportId: "websocket:two",
      attributes: {protocol: "ws"},
    }))
    journal.observe(replacement)
    const replacedSnapshot = journal.snapshot()
    expect(replacedSnapshot.envelopes.filter(({observation}) => observation.type === "transport"))
      .toEqual([replacement])
    expect(isHamiltonianLifecycleSnapshot({
      ...replacedSnapshot,
      envelopes: [closed, replacement],
    })).toBeFalse()

    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: workerId,
      subjectKind: "service-worker",
      ownerId: workerId,
    })))
    expect(journal.snapshot().envelopes).toEqual([])
  })

  test("materializes an externally observed endpoint end without retaining a foreign source frontier", () => {
    const serverId = "server:host-a"
    const workerId = "service-worker:worker-old"
    const source = new HamiltonianLifecycleSource({
      id: serverId,
      kind: "server",
      incarnation: "host-a",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal(serverId)
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "closed",
      subjectId: "websocket:old",
      subjectKind: "websocket",
      ownerId: workerId,
      sourceEntityId: workerId,
      targetEntityId: serverId,
      transportId: "websocket:old",
      attributes: {observedBy: "server"},
    })))
    const before = journal.snapshot()

    expect(journal.retireEntity(workerId)).toBeTrue()
    expect(journal.retireEntity(workerId)).toBeFalse()
    const after = journal.snapshot()
    expect(after.revision).toBe(before.revision + 1)
    expect(after.frontier).toEqual(before.frontier)
    expect(after.envelopes).toEqual([])
  })

  test("retains Oracle and Force DataChannels as separate logical slots", () => {
    const source = new HamiltonianLifecycleSource({id: "peer:a", kind: "peer-process", incarnation: "a", startedAt: 1})
    const journal = new HamiltonianLifecycleRetainedJournal("peer:a")
    const channel = (id: string, lane: "oracle" | "force") => source.next(createHamiltonianLifecycleObservation({
      type: "transport",
      phase: "opened",
      subjectId: id,
      subjectKind: "data-channel",
      ownerId: "rtc-peer:server",
      sourceEntityId: "rtc-peer:server",
      targetEntityId: "rtc-peer:browser",
      transportId: id,
      attributes: {lane},
    }))
    journal.observe(channel("data-channel:oracle-one", "oracle"))
    journal.observe(channel("data-channel:force-one", "force"))
    journal.observe(channel("data-channel:oracle-two", "oracle"))
    expect(journal.snapshot().envelopes.map(({observation}) => observation.subjectId).sort())
      .toEqual(["data-channel:force-one", "data-channel:oracle-two"])
  })

  test("fails explicitly instead of trimming active structure from a snapshot", () => {
    const source = new HamiltonianLifecycleSource({
      id: "server:capacity",
      kind: "server",
      incarnation: "capacity",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal("server:capacity")
    for (let index = 0; index < 1025; index += 1) {
      expect(journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: `entity:${index}`,
        subjectKind: "probe",
        ownerId: "server:capacity",
      })))).toBeTrue()
    }
    expect(() => journal.snapshot()).toThrow("structural capacity exceeded")
  })

  test("keeps reborn sources separate even when their sequence restarts", () => {
    const oldSource = new HamiltonianLifecycleSource({id: "service-worker", kind: "service-worker", incarnation: "old", startedAt: 1})
    const newSource = new HamiltonianLifecycleSource({id: "service-worker", kind: "service-worker", incarnation: "new", startedAt: 2})
    const cursor = new HamiltonianLifecycleCursor()

    expect(cursor.accept(oldSource.next(pageBorn))?.gap).toBeNull()
    expect(cursor.accept(newSource.next(pageBorn))?.gap).toBeNull()
    expect(cursor.snapshot()).toEqual({"service-worker\u0000old": 1, "service-worker\u0000new": 1})
  })

  test("retires an ended source frontier behind a bounded stale-event tombstone", () => {
    const cursor = new HamiltonianLifecycleCursor({retiredSourceCapacity: 2})
    const sources = ["one", "two", "three"].map((incarnation) => new HamiltonianLifecycleSource({
      id: `dedicated-worker:${incarnation}`,
      kind: "dedicated-worker",
      incarnation,
      startedAt: 1,
    }))
    const envelopes = sources.map((source) => source.next(pageBorn))
    for (const envelope of envelopes) expect(cursor.accept(envelope)?.gap).toBeNull()
    expect(cursor.activeSourceCount).toBe(3)

    expect(cursor.retire("dedicated-worker:one", "one")).toBeTrue()
    expect(cursor.accept(envelopes[0])).toBeNull()
    expect(cursor.retire("dedicated-worker:two", "two")).toBeTrue()
    expect(cursor.retire("dedicated-worker:three", "three")).toBeTrue()
    expect(cursor.activeSourceCount).toBe(0)
    expect(cursor.retiredSourceCount).toBe(2)
  })

  test("uses one message identity for send and receive observations", () => {
    const sent = createHamiltonianLifecycleObservation({
      type: "message",
      phase: "sent",
      subjectId: "message:42",
      subjectKind: "control-message",
      ownerId: "page:a",
      sourceEntityId: "page:a",
      targetEntityId: "service-worker:b",
      transportId: "controller:c",
      messageId: "message:42",
      messageClass: "connect-window",
    })
    const received = createHamiltonianLifecycleObservation({...sent, phase: "received", ownerId: "service-worker:b"})
    expect(sent.messageId).toBe(received.messageId)
    expect(sent.subjectId).toBe(received.subjectId)
  })

  test("replays startup observations once and never batches delivered traffic to a late subscriber", () => {
    const singleton = Symbol.for("metafor.hamiltonian.lifecycle.singleton.v1")
    delete (globalThis as Record<symbol, unknown>)[singleton]
    const early = emitHamiltonianLifecycle(pageBorn, {at: 1})
    const first: string[] = []
    const unsubscribe = subscribeHamiltonianLifecycle((envelope) => first.push(envelope.eventId))
    const live = emitHamiltonianLifecycle(pageBorn, {at: 2})
    expect(first).toEqual([early.eventId, live.eventId])
    unsubscribe()

    const second: string[] = []
    const unsubscribeSecond = subscribeHamiltonianLifecycle((envelope) => second.push(envelope.eventId))
    expect(second).toEqual([])
    const next = emitHamiltonianLifecycle(pageBorn, {at: 3})
    expect(second).toEqual([next.eventId])
    unsubscribeSecond()
    delete (globalThis as Record<symbol, unknown>)[singleton]
  })

  test("seeds a late local subscriber after the page journal consumes bootstrap observations", () => {
    const singleton = Symbol.for("metafor.hamiltonian.lifecycle.singleton.v1")
    delete (globalThis as Record<symbol, unknown>)[singleton]
    const journal = new HamiltonianLifecycleRetainedJournal("page:bootstrap")
    const unsubscribeJournal = subscribeHamiltonianLifecycle((envelope) => journal.observe(envelope))
    const observations = [
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: "browser:bootstrap",
        subjectKind: "browser-runtime",
        ownerId: "browser:bootstrap",
      }),
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: "page:bootstrap",
        subjectKind: "page",
        ownerId: "browser:bootstrap",
      }),
      createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: "window-main:bootstrap",
        subjectKind: "window-main",
        ownerId: "page:bootstrap",
      }),
    ]
    for (const observation of observations) emitHamiltonianLifecycle(observation)

    expect(receiveHamiltonianLifecycleSnapshot(journal.snapshot())).toBeTrue()
    const snapshots: ReturnType<HamiltonianLifecycleRetainedJournal["snapshot"]>[] = []
    const unsubscribeSnapshots = subscribeHamiltonianLifecycleSnapshot((snapshot) => snapshots.push(snapshot))
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]?.frontier).toEqual([expect.objectContaining({sequence: 3})])

    const cursor = new HamiltonianLifecycleCursor()
    cursor.seed(snapshots[0]!.frontier)
    let live: ReturnType<typeof emitHamiltonianLifecycle> | null = null
    const unsubscribeLate = subscribeHamiltonianLifecycle((envelope) => {
      if (envelope.sequence === 4) live = envelope
    })
    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "changed",
      subjectId: "page:bootstrap",
      subjectKind: "page",
      ownerId: "browser:bootstrap",
      attributes: {visibility: "visible"},
    }))
    expect(live).not.toBeNull()
    expect(cursor.accept(live!)?.gap).toBeNull()

    unsubscribeLate()
    unsubscribeSnapshots()
    unsubscribeJournal()
    delete (globalThis as Record<symbol, unknown>)[singleton]
  })

  test("rebroadcasts the retained latest snapshot without notifying local subscribers twice", () => {
    const lifecycleSingleton = Symbol.for("metafor.hamiltonian.lifecycle.singleton.v1")
    const monitorSingleton = Symbol.for("metafor.hamiltonian.monitor.bootstrap.v1")
    delete (globalThis as Record<symbol, unknown>)[lifecycleSingleton]
    const monitor = (globalThis as any)[monitorSingleton]
    const channel = monitor.channels.get(HAMILTONIAN_LIFECYCLE_CHANNEL)
    const previousChannel = channel.channel
    const broadcasts: unknown[] = []
    channel.channel = {postMessage: (value: unknown) => broadcasts.push(value)}
    try {
      const source = new HamiltonianLifecycleSource({
        id: "service-worker:retained",
        kind: "service-worker",
        incarnation: "retained",
        startedAt: 1,
      })
      const journal = new HamiltonianLifecycleRetainedJournal("service-worker:retained")
      journal.observe(source.next(createHamiltonianLifecycleObservation({
        type: "entity",
        phase: "born",
        subjectId: "service-worker:retained",
        subjectKind: "service-worker",
        ownerId: "service-worker:retained",
      })))
      const snapshot = journal.snapshot()
      const localRevisions: number[] = []
      const unsubscribe = subscribeHamiltonianLifecycleSnapshot((value) => localRevisions.push(value.revision))
      expect(publishHamiltonianLifecycleSnapshot(snapshot)).toBeTrue()
      expect(publishHamiltonianLifecycleSnapshot(snapshot)).toBeTrue()
      expect(localRevisions).toEqual([snapshot.revision])
      expect(broadcasts).toEqual([snapshot, snapshot])
      unsubscribe()
    } finally {
      channel.channel = previousChannel
      delete (globalThis as Record<symbol, unknown>)[lifecycleSingleton]
    }
  })

  test("receives a directed lifecycle envelope without rebroadcasting it", () => {
    const lifecycleSingleton = Symbol.for("metafor.hamiltonian.lifecycle.singleton.v1")
    const monitorSingleton = Symbol.for("metafor.hamiltonian.monitor.bootstrap.v1")
    delete (globalThis as Record<symbol, unknown>)[lifecycleSingleton]
    const monitor = (globalThis as any)[monitorSingleton]
    const channel = monitor.channels.get(HAMILTONIAN_LIFECYCLE_CHANNEL)
    const previousChannel = channel.channel
    const broadcasts: unknown[] = []
    channel.channel = {postMessage: (value: unknown) => broadcasts.push(value)}
    try {
      const received: string[] = []
      const unsubscribe = subscribeHamiltonianLifecycle((envelope) => received.push(envelope.eventId))
      const source = new HamiltonianLifecycleSource({
        id: "page:directed",
        kind: "page",
        incarnation: "directed",
        startedAt: 1,
      })
      const envelope = source.next(pageBorn)
      expect(receiveHamiltonianLifecycleEnvelope(envelope)).toBeTrue()
      expect(received).toEqual([envelope.eventId])
      expect(broadcasts).toEqual([])
      unsubscribe()
    } finally {
      channel.channel = previousChannel
      delete (globalThis as Record<symbol, unknown>)[lifecycleSingleton]
    }
  })

  test("forgets a retained snapshot when its owning entity is observed ended", () => {
    const singleton = Symbol.for("metafor.hamiltonian.lifecycle.singleton.v1")
    delete (globalThis as Record<symbol, unknown>)[singleton]
    const scopeId = "service-worker:retired"
    const source = new HamiltonianLifecycleSource({
      id: scopeId,
      kind: "service-worker",
      incarnation: "retired",
      startedAt: 1,
    })
    const journal = new HamiltonianLifecycleRetainedJournal(scopeId)
    journal.observe(source.next(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: scopeId,
      subjectKind: "service-worker",
      ownerId: scopeId,
    })))
    const snapshot = journal.snapshot()
    expect(receiveHamiltonianLifecycleSnapshot(snapshot)).toBeTrue()
    const before: string[] = []
    const unsubscribeBefore = subscribeHamiltonianLifecycleSnapshot((value) => before.push(value.scopeId))
    expect(before).toEqual([scopeId])
    unsubscribeBefore()

    emitHamiltonianLifecycle(createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "ended",
      subjectId: scopeId,
      subjectKind: "service-worker",
      ownerId: scopeId,
      attributes: {reason: "superseded-by-observed-incarnation"},
    }))
    const late: string[] = []
    const unsubscribeLate = subscribeHamiltonianLifecycleSnapshot((value) => late.push(value.scopeId))
    expect(late).toEqual([])
    unsubscribeLate()
    delete (globalThis as Record<symbol, unknown>)[singleton]
  })

  test("rejects payloads, secret fields and unknown envelope fields", () => {
    expect(() => createHamiltonianLifecycleObservation({
      type: "entity",
      phase: "born",
      subjectId: "page:a",
      subjectKind: "page",
      attributes: {token: "secret"},
    })).toThrow()

    const safe = createHamiltonianLifecycleEnvelope({
      sourceId: "page:a",
      sourceKind: "page",
      sourceIncarnation: "a",
      sourceStartedAt: 1,
      sequence: 1,
      at: 2,
      observation: pageBorn,
    })
    expect(isHamiltonianLifecycleEnvelope(safe)).toBeTrue()
    expect(isHamiltonianLifecycleEnvelope({...safe, payload: "secret"})).toBeFalse()
    expect(isHamiltonianLifecycleEnvelope({...safe, eventId: "invented"})).toBeFalse()
  })

})
