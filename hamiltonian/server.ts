import {networkInterfaces} from "node:os"
import {HamiltonianServerComposition} from "./server/composition.ts"
import {hamiltonianRouteFallback} from "./server/routes.ts"
import type {HamiltonianControlSocketData} from "./server/control/endpoint.ts"

const composition = new HamiltonianServerComposition()
const {configuration} = composition

/** Фактический production Bun listener Hamiltonian. */
export const server = Bun.serve<HamiltonianControlSocketData>({
  hostname: configuration.hostname,
  port: configuration.port,
  ...composition.tls,
  routes: composition.routes.table,
  fetch: hamiltonianRouteFallback,
  websocket: composition.control.websocket,
})

const running = composition.attach(server)
const scheme = server.protocol ?? "http"
const port = server.port
console.log(`Hamiltonian ${running.identity} · version ${running.version}`)
console.log(`One listener: ${scheme}://${server.hostname}:${port}`)
void running.bunReady.then((embodiments) => {
  for (const [role, embodiment] of Object.entries(embodiments)) {
    console.log(`Bun ${role}: ${embodiment.state} · pid ${embodiment.pid} · incarnation ${embodiment.incarnation}`)
  }
})
for (const address of advertisedHosts(server.hostname ?? "127.0.0.1")) {
  const joinUrl = isLoopbackHostname(address)
    ? `${scheme}://${address}:${port}/`
    : `${scheme}://${address}:${port}/?token=${encodeURIComponent(running.token)}`
  console.log(`Join: ${joinUrl}`)
}
if (scheme === "http" && server.hostname !== "127.0.0.1" && server.hostname !== "localhost") {
  console.warn("Remote browsers need trusted HTTPS before they can register the Service Worker.")
}

function advertisedHosts(hostname: string): string[] {
  if (hostname !== "0.0.0.0" && hostname !== "::") return [hostname]
  const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? []).filter((entry) => entry.family === "IPv4" && !entry.internal).map((entry) => entry.address))
  return addresses.length > 0 ? addresses : ["127.0.0.1"]
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}
