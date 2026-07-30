import type {MonadRpcPeer} from "shared/transport/monad"

export const BULK_TIME_STACK_METHOD = "dark.force.stack" as const
export const BULK_TIME_PAUSE_METHOD = "dark.force.pause" as const
export const BULK_TIME_RESUME_METHOD = "dark.force.resume" as const

export type BulkTimeControlMethod =
  | typeof BULK_TIME_STACK_METHOD
  | typeof BULK_TIME_PAUSE_METHOD
  | typeof BULK_TIME_RESUME_METHOD

export const bulkTimeControlResponse = async (
  peer: Pick<MonadRpcPeer, "call">,
  method: BulkTimeControlMethod,
  params: unknown = {},
): Promise<Response> => {
  try {
    const result = await peer.call("dark", method, params, {waitMs: 1_000})
    return Response.json(result)
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, {status: 503})
  }
}
