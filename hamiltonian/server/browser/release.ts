import {
  hamiltonianBrowserManifest,
  hamiltonianServiceWorkerRelease,
  hamiltonianVersionedModuleRelease,
  type HamiltonianServiceWorkerRelease,
} from "../../update/host/browser-release.ts"
import {
  HamiltonianServiceWorkerAdmissionRegistry,
  type HamiltonianServiceWorkerAdmissionClaim,
} from "../../update/host/service-worker-admission.ts"
import type {HamiltonianControlSocketData} from "../control/endpoint.ts"
import type {HamiltonianBrowserPublication} from "./publication.ts"
import {hamiltonianSecurityHeaders} from "./publication.ts"
import type {HamiltonianServerObservation} from "../observation.ts"

type ControlSocket = Bun.ServerWebSocket<HamiltonianControlSocketData>

export interface HamiltonianBrowserReleaseOptions {
  identity: string
  version: string
  publication: HamiltonianBrowserPublication
  observation: HamiltonianServerObservation
  connections(): Iterable<ControlSocket>
  disconnectApplication(connectionId: string): void
  broadcastTopology(): void
  peerOperations(): Promise<void>
  sendControl(socket: ControlSocket, message: Readonly<{kind: string}> & Record<string, unknown>): void
}

/** Владеет host-side release identity и admission Service Worker. */
export class HamiltonianBrowserRelease {
  readonly #options: HamiltonianBrowserReleaseOptions
  readonly #admission = new HamiltonianServiceWorkerAdmissionRegistry()
  readonly #source: string
  readonly #moduleRelease: ReturnType<typeof hamiltonianVersionedModuleRelease>
  #serviceWorkerOverride: string | null = null

  constructor(options: HamiltonianBrowserReleaseOptions) {
    this.#options = options
    this.#source = moduleSource(options.version)
    this.#moduleRelease = hamiltonianVersionedModuleRelease(options.version, this.#source)
  }

  get modulePath(): string {
    return this.#moduleRelease.moduleUrl
  }

  embodimentVersionPayload(): {version: string; source: string; sha256: string} {
    return {version: this.#options.version, source: this.#source, sha256: this.#moduleRelease.sha256}
  }

  workerCodeVersion(workerEntityId: string): string | undefined {
    return this.#admission.embodiment(workerEntityId)?.codeVersion
  }

  forgetWorker(workerEntityId: string): void {
    this.#admission.forgetEmbodiment(workerEntityId)
  }

  applicationMessageAllowed(applicationAdmitted: boolean, kind: string): boolean {
    return this.#admission.applicationMessageAllowed(applicationAdmitted, kind)
  }

  decideIdentity(claim: HamiltonianServiceWorkerAdmissionClaim, target: HamiltonianServiceWorkerRelease) {
    return this.#admission.decideIdentity(claim, target)
  }

  confirmCurrent(claim: HamiltonianServiceWorkerAdmissionClaim): void {
    this.#admission.confirmCurrent(claim)
  }

  async currentServiceWorkerRelease(): Promise<HamiltonianServiceWorkerRelease> {
    const source = this.#serviceWorkerOverride ?? await this.#options.publication.serviceWorkerBundle()
    return hamiltonianServiceWorkerRelease(source)
  }

  async manifest(): Promise<Response> {
    const serviceWorker = await this.currentServiceWorkerRelease()
    return Response.json(
      hamiltonianBrowserManifest(this.#options.identity, this.#moduleRelease, serviceWorker),
      {headers: hamiltonianSecurityHeaders("application/json; charset=utf-8")},
    )
  }

  versionedModule(): Response {
    const headers = new Headers(hamiltonianSecurityHeaders("text/javascript; charset=utf-8"))
    headers.set("x-hamiltonian-sha256", this.#moduleRelease.sha256)
    return new Response(this.#source, {headers})
  }

  async reconcile(target: HamiltonianServiceWorkerRelease): Promise<void> {
    const updates = this.#admission.reconcileRelease([...this.#options.connections()].map((socket) => ({
      endpoint: socket,
      profileId: socket.data.deviceId,
      workerEntityId: socket.data.workerEntityId,
      runtimeIncarnation: socket.data.workerRuntimeIncarnation,
      codeVersion: socket.data.workerCodeVersion,
      applicationAdmitted: socket.data.identityConfirmed,
    })), target)
    for (const {endpoint} of updates) this.markUpdateRequired(endpoint)
    const revoked = updates.filter(({revokeApplication}) => revokeApplication).map(({endpoint}) => endpoint)
    for (const socket of revoked) this.#options.disconnectApplication(socket.data.connectionId)
    if (revoked.length > 0) {
      this.#options.broadcastTopology()
      await this.#options.peerOperations()
    }
    for (const {endpoint, target: updateTarget} of updates) this.sendUpdate(endpoint, updateTarget)
  }

  async reconcileSource(source: string): Promise<void> {
    await this.reconcile(hamiltonianServiceWorkerRelease(source))
  }

  markUpdateRequired(socket: ControlSocket): void {
    socket.data.identityConfirmed = false
    socket.data.retainAuthorityOnClose = false
    socket.data.workerUpdateRequired = true
  }

  async revokeApplication(sockets: readonly ControlSocket[]): Promise<void> {
    for (const socket of sockets) this.#options.disconnectApplication(socket.data.connectionId)
    if (sockets.length === 0) return
    this.#options.broadcastTopology()
    await this.#options.peerOperations()
  }

  sendUpdate(socket: ControlSocket, target: HamiltonianServiceWorkerRelease): void {
    this.#options.sendControl(socket, {kind: "service-worker-update", target})
    this.#options.observation.record({
      at: Date.now(),
      kind: "service-worker-update-required",
      connectionId: socket.data.connectionId,
      detail: `${socket.data.workerEntityId} ${socket.data.workerCodeVersion ?? "unknown"} -> ${target.version}`,
    })
  }

  async updateForTest(source: string): Promise<HamiltonianServiceWorkerRelease> {
    this.#serviceWorkerOverride = source
    const target = hamiltonianServiceWorkerRelease(source)
    await this.reconcile(target)
    return target
  }
}

function moduleSource(version: string): string {
  return [
    `export const version = ${JSON.stringify(version)};`,
    "export function createEmbodiment(context) {",
    "  const runtime = String(context.runtime);",
    "  const role = String(context.role ?? runtime);",
    "  const incarnation = String(context.incarnation);",
    "  const authority = context.authority ?? null;",
    "  let state = 'created';",
    "  const snapshot = () => ({runtime, role, incarnation, version, state, authority});",
    "  return {",
    "    start() {",
    "      if (state !== 'created') throw new Error(`cannot start embodiment from ${state}`);",
    "      state = 'active';",
    "      return snapshot();",
    "    },",
    "    stop() {",
    "      if (state === 'active') state = 'stopped';",
    "      return snapshot();",
    "    },",
    "    snapshot,",
    "  };",
    "}",
    "export function describe() {",
    "  return `versioned module ${version} loaded through Hamiltonian cache`;",
    "}",
    "",
  ].join("\n")
}
