import {HamiltonianServerComposition} from "./composition.ts"
import type {HamiltonianServerOptions} from "./configuration.ts"
import {hamiltonianRouteFallback} from "./routes.ts"
import type {HamiltonianControlSocketData} from "./control/endpoint.ts"

/** Creates a test listener from the same concrete owner composition as production. */
export function createHamiltonianTestServer(options: HamiltonianServerOptions = {}) {
  const composition = new HamiltonianServerComposition(options)
  const {configuration} = composition
  const server = Bun.serve<HamiltonianControlSocketData>({
    hostname: configuration.hostname,
    port: configuration.port,
    ...composition.tls,
    routes: composition.routes.table,
    fetch: hamiltonianRouteFallback,
    websocket: composition.control.websocket,
  })
  return composition.attach(server)
}
