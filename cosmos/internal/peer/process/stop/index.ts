import type {MetaforCosmosInternalPeerProcessStop as Stop} from "./contract"
export type {MetaforCosmosInternalPeerProcessStop} from "./contract"

/** Stops new source admission, drains accepted work, then closes the one owned participant and releases its Mass lease. */
async function cleanup({energy}: Stop.Cleanup): Promise<void> {
  const resource = energy.resource
  if (!resource) return
  resource.admission.open = false
  const errors: unknown[] = []
  try {await resource.node?.whenIdle()} catch (error) {errors.push(error)}
  let closed = false
  try {await resource.node?.close(); closed = true} catch (error) {errors.push(error)}
  if (closed) {
    try {
      await resource.lease.release()
      if (energy.resource === resource) delete energy.resource
    } catch (error) {errors.push(error)}
  }
  if (errors.length) throw new AggregateError(errors, "Owned network cleanup failed")
}

/** Meta-declared stop and structural destroy share one cleanup; destroy has no synthetic request or Field proposal. */
function stopNetwork(input: Stop.Input): Promise<Stop.Output>
function stopNetwork(input: Stop.Cleanup): Promise<void>
async function stopNetwork(input: Stop.Input | Stop.Cleanup): Promise<Stop.Output | void> {
  if (!("requestId" in input)) return await cleanup(input)
  const ackId = input.requestId
  input.signal.throwIfAborted()
  try {
    await cleanup(input)
    input.signal.throwIfAborted()
    return {ackId, status: "stopped", error: null}
  } catch {
    input.signal.throwIfAborted()
    return {ackId, status: "failed", error: "Network cleanup failed"}
  }
}
export default Object.assign(stopNetwork, {cleanup})
