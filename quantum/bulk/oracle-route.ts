import type {OracleTransport} from "shared/transport/oracle"

/**
 * Bulk's Oracle callback endpoint. Dark calls this endpoint after the domain
 * has registered its channel; it must reach the same transport that opened it.
 */
export const bulkOracleRoutes = (transport: OracleTransport) => ({
  "/oracle/channel": {
    POST(request: Request) {
      return transport.receive(request)
    },
  },
})
