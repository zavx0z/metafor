import {createHash} from "node:crypto"
import {readFileSync, writeFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

import {
  HamiltonianLifecycleSource,
  createHamiltonianLifecycleObservation,
} from "../../../hamiltonian/core/lifecycle.js"
import {HamiltonianLifecycleProjection} from "../../../hamiltonian/browser/orchestration/lifecycle-projection.ts"
import {MetaForNodeSystemWorkerLayouter} from "../../../pkg/nodes/layout-engine.ts"
import type {LayoutWorkerClient} from "../../../pkg/nodes/layout-worker.ts"
import type {LayoutGraph} from "../../../pkg/nodes/layout/types/protocol.ts"

const directory = dirname(fileURLToPath(import.meta.url))
const runtimeContext = {
  origin: "https://127.0.0.1:4400",
  deviceId: "device-a",
  tabId: "tab-a",
  pageIncarnation: "page-a",
  observedAt: 11,
  navigationId: "navigation-a",
  servedAt: 10,
  server: {
    identity: "hamiltonian-lab",
    hostEpoch: "host-a",
    version: "webpush-001-layout-evidence",
  },
}

const projection = new HamiltonianLifecycleProjection(runtimeContext)
const sources = new Map<string, HamiltonianLifecycleSource>()
const observe = (
  sourceId: string,
  sourceKind: string,
  observation: Parameters<typeof createHamiltonianLifecycleObservation>[0],
): void => {
  let source = sources.get(sourceId)
  if (source === undefined) {
    source = new HamiltonianLifecycleSource({
      id: sourceId,
      kind: sourceKind,
      incarnation: sourceId,
      startedAt: 1,
    })
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
  [pageId, "page", browserId, "browser-runtime", browserId, {runtime: "Chrome", state: "active", deviceId: "device-a"}],
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
  observe(sourceId, sourceKind, {
    type: "entity",
    phase: "changed",
    subjectId,
    subjectKind,
    ownerId,
    attributes,
  })
}

for (const [sourceId, sourceKind, subjectId, subjectKind, ownerId, sourceEntityId, targetEntityId, attributes] of [
  [pageId, "page", "service-worker-controller:page", "controller", pageId, pageId, workerId, {}],
  [pageId, "page", "message-port:page", "message-port", pageId, workerId, pageId, {}],
  [secondPageId, "page", "service-worker-controller:page-b", "controller", secondPageId, secondPageId, workerId, {}],
  [secondPageId, "page", "message-port:page-b", "message-port", secondPageId, workerId, secondPageId, {}],
  [dedicatedId, "dedicated-worker", "worker-message:worker", "worker-message", dedicatedId, mainId, dedicatedId, {}],
  ["bun-process:main", "bun-process", "ipc:main", "ipc", "bun-process:main", "server:host-a", "bun-process:main", {state: "connected"}],
  ["bun-process:worker", "bun-process", "ipc:worker", "ipc", "bun-process:worker", "server:host-a", "bun-process:worker", {state: "connected"}],
  [peerId, "peer-process", "ipc:peer", "ipc", peerId, "server:host-a", peerId, {state: "connected"}],
  [peerId, "peer-process", "data-channel:oracle", "data-channel", serverRtcId, serverRtcId, browserRtcId, {lane: "oracle", state: "open"}],
  [peerId, "peer-process", "data-channel:force", "data-channel", serverRtcId, serverRtcId, browserRtcId, {lane: "force", state: "open"}],
  [workerId, "service-worker", "websocket:control", "websocket", workerId, workerId, "server:host-a", {state: "connected"}],
  ["server:host-a", "server", "web-push:worker", "web-push", "server:host-a", "server:host-a", workerId, {state: "ready", mediatedBy: "browser-push-service"}],
] as const) {
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

let captured: LayoutGraph | null = null
const worker = {
  layout(input: Readonly<{graph: LayoutGraph}>): Promise<never> {
    captured = structuredClone(input.graph)
    return Promise.reject(new Error("NODES-003 fixture captured"))
  },
}

try {
  await new MetaForNodeSystemWorkerLayouter(
    worker as unknown as LayoutWorkerClient,
    {measureText: (value, fontPx) => value.length * fontPx * 0.55},
  ).layout(projection.document(), {viewport: {width: 722, height: 1_088}}, 1)
} catch (error) {
  if (!(error instanceof Error) || error.message !== "NODES-003 fixture captured") throw error
}

if (captured === null) throw new Error("LayoutGraph was not captured")
const output = `${JSON.stringify(captured, null, 2)}\n`
const fixturePath = join(directory, "two-tab-layout-portrait.json")
writeFileSync(fixturePath, output)

const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex")
const provenance = {
  fixture: "two-tab-layout-portrait.json",
  fixtureSha256: sha256(output),
  nodes: captured.nodes.length,
  ports: captured.ports.length,
  edges: captured.edges.length,
  viewport: captured.viewport,
  sourceSha256: {
    projection: sha256(readFileSync(join(directory, "../../../hamiltonian/browser/orchestration/lifecycle-projection.ts"), "utf8")),
    projectionTest: sha256(readFileSync(join(directory, "../../../hamiltonian/browser/orchestration/lifecycle-projection.spec.ts"), "utf8")),
  },
}
process.stdout.write(`${JSON.stringify(provenance, null, 2)}\n`)
