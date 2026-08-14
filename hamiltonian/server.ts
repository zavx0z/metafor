import {networkInterfaces} from "node:os"
import {createHamiltonianHost} from "./host.ts"

function advertisedHosts(hostname: string): string[] {
  if (hostname !== "0.0.0.0" && hostname !== "::") return [hostname]
  const addresses = Object.values(networkInterfaces()).flatMap((entries) =>
    (entries ?? [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address)
  )
  return addresses.length > 0 ? addresses : ["127.0.0.1"]
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1"
}

if (import.meta.main) {
  const host = createHamiltonianHost()
  const scheme = host.server.protocol ?? "http"
  const port = host.server.port
  console.log(`Hamiltonian ${host.identity} · version ${host.version}`)
  console.log(`One listener: ${scheme}://${host.server.hostname}:${port}`)
  void host.bunReady.then((embodiments) => {
    for (const [role, embodiment] of Object.entries(embodiments)) {
      console.log(`Bun ${role}: ${embodiment.state} · pid ${embodiment.pid} · incarnation ${embodiment.incarnation}`)
    }
  })
  for (const address of advertisedHosts(host.server.hostname ?? "127.0.0.1")) {
    const joinUrl = isLoopbackHostname(address)
      ? `${scheme}://${address}:${port}/`
      : `${scheme}://${address}:${port}/?token=${encodeURIComponent(host.token)}`
    console.log(`Join: ${joinUrl}`)
  }
  if (scheme === "http" && host.server.hostname !== "127.0.0.1" && host.server.hostname !== "localhost") {
    console.warn("Remote browsers need trusted HTTPS before they can register the Service Worker.")
  }
}
