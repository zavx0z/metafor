/**
 * Изолированный process-adapter интеграционных тестов. Он запускает штатный
 * singleton `server.ts`; IPC используется только для прежних crash/rebirth
 * проверок и не добавляет HTTP endpoints в production server.
 */
import {server, stopHamiltonianServer} from "./server.ts"
import {
  acceptsServerAuthorityForTest,
  bunEmbodiments,
  bunReady,
  crashBunEmbodimentForTest,
  crashPeerProcessForTest,
  getHamiltonianStatus,
  hostEpoch,
  identity,
  placement,
  rebirthBunEmbodiment,
  reportPeerErrorForTest,
  requestPeerRepairForTest,
  settleHamiltonianTestBundle,
  token,
  updateServiceWorkerReleaseForTest,
  version,
} from "./server-runtime.ts"

process.send?.({
  kind: "hamiltonian-test-ready",
  server: {
    url: server.url.href,
    hostname: server.hostname,
    port: server.port,
    protocol: server.protocol,
  },
  identity,
  version,
  token,
  hostEpoch,
  placement,
})

void bunReady.then((embodiments) => {
  process.send?.({kind: "hamiltonian-test-bun-ready", embodiments})
})

process.on("message", async (rawMessage) => {
  const message = rawMessage as {
    kind?: string
    id?: number
    command?: string
    args?: unknown[]
    name?: string
    ok?: boolean
    source?: string
    error?: string
  }
  if (message.kind === "hamiltonian-test-bundle-result" && typeof message.name === "string") {
    settleHamiltonianTestBundle(message.name, message.ok
      ? {ok: true, source: message.source ?? ""}
      : {ok: false, error: message.error ?? "Hamiltonian test bundle failed"})
    return
  }
  if (message.kind !== "hamiltonian-test-command" || typeof message.id !== "number") return
  try {
    const args = message.args ?? []
    let value: unknown
    switch (message.command) {
      case "rebirth-bun":
        value = await rebirthBunEmbodiment(typeof args[0] === "string" ? args[0] : undefined)
        break
      case "crash-bun":
        value = crashBunEmbodimentForTest(typeof args[0] === "string" ? args[0] : undefined)
        break
      case "accepts-server-authority":
        value = acceptsServerAuthorityForTest((args[0] ?? null) as Parameters<typeof acceptsServerAuthorityForTest>[0])
        break
      case "crash-peer":
        value = crashPeerProcessForTest()
        break
      case "request-peer-repair":
        value = {
          assignment: requestPeerRepairForTest(String(args[0] ?? "")),
          status: getHamiltonianStatus(),
        }
        break
      case "report-peer-error":
        reportPeerErrorForTest(String(args[0] ?? ""), String(args[1] ?? ""))
        value = null
        break
      case "update-service-worker-release":
        value = await updateServiceWorkerReleaseForTest(String(args[0] ?? ""))
        break
      case "stop":
        await stopHamiltonianServer()
        value = {serverEmbodiments: bunEmbodiments.snapshot()}
        break
      default:
        throw new Error(`Unknown Hamiltonian test command: ${message.command}`)
    }
    process.send?.({kind: "hamiltonian-test-command-result", id: message.id, ok: true, value})
    if (message.command === "stop") setTimeout(() => process.exit(0), 0)
  } catch (error) {
    process.send?.({
      kind: "hamiltonian-test-command-result",
      id: message.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
