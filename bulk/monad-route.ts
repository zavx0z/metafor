import type {MonadTransport} from "shared/transport/monad"

/**
 * Bulk's Monad callback endpoint. Dark calls this endpoint after the domain
 * has registered its channel; it must reach the same transport that opened it.
 */
export const bulkMonadRoutes = (transport: MonadTransport) => ({
  "/monad/channel": {
    POST(request: Request) {
      return transport.receive(request)
    },
  },
})
