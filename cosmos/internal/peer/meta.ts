import type {ReleaseNode} from "@cosmos/release/node"
import type {MassDirectoryLease} from "@metafor/types/metafor/mass"

/** Declared participation; request correlation and completion are canonical ordinary Fields. */
export default MetaFor("Участник сети")
  .fields(field => ({
    request: field.string.optional(),
    requestId: field.string.required(""),
    ack: field.boolean.required(false),
    ackId: field.string.required(""),
    status: field.string.required("idle"),
    error: field.string.optional(),
  }))
  .superposition({
    idle: {preparing: {request: {eq: "prepare"}, ack: {eq: false}}, starting: {request: {eq: "start"}, ack: {eq: false}}, stopping: {request: {eq: "stop"}, ack: {eq: false}}},
    preparing: {prepared: {status: {eq: "prepared"}, ack: {eq: true}}, failed: {status: {eq: "failed"}, ack: {eq: true}}},
    prepared: {preparing: {request: {eq: "prepare"}, ack: {eq: false}}, starting: {request: {eq: "start"}, ack: {eq: false}}, stopping: {request: {eq: "stop"}, ack: {eq: false}}},
    starting: {running: {status: {eq: "running"}, ack: {eq: true}}, failed: {status: {eq: "failed"}, ack: {eq: true}}},
    running: {starting: {request: {eq: "start"}, ack: {eq: false}}, stopping: {request: {eq: "stop"}, ack: {eq: false}}},
    stopping: {stopped: {status: {eq: "stopped"}, ack: {eq: true}}, failed: {status: {eq: "failed"}, ack: {eq: true}}},
    stopped: {preparing: {request: {eq: "prepare"}, ack: {eq: false}}, starting: {request: {eq: "start"}, ack: {eq: false}}, stopping: {request: {eq: "stop"}, ack: {eq: false}}},
    failed: {preparing: {request: {eq: "prepare"}, ack: {eq: false}}, starting: {request: {eq: "start"}, ack: {eq: false}}, stopping: {request: {eq: "stop"}, ack: {eq: false}}},
  })
  .mass(mass => ({configuration: mass.directory()}))
  .energy<{resource?: {
    node?: ReleaseNode
    lease: MassDirectoryLease
    digest: string
    configurationFile: string
    admission: {open: boolean}
  }}>()
  .processes((process, destroy) => [
    process("preparing", {env: ["server"]})
      .action(async ({value, mass, energy, signal}): Promise<{ackId: string, status: string, error: string | null}> => {
        const action = await import("@internal/network-provision")
        return action.default({requestId: value.requestId, mass, energy, signal})
      })
      .success(({update, data}) => update({ack: true, ackId: data.ackId, status: data.status, error: data.error})),
    process("starting", {env: ["server"]})
      .action(async ({value, mass, energy, signal}): Promise<{ackId: string, status: string, error: string | null}> => {
        const action = await import("@internal/network-start")
        return action.default({requestId: value.requestId, mass, energy, signal})
      })
      .success(({update, data}) => update({ack: true, ackId: data.ackId, status: data.status, error: data.error})),
    process("stopping", {env: ["server"]})
      .action(async ({value, energy, signal}): Promise<{ackId: string, status: string, error: string | null}> => {
        const action = await import("@internal/network-stop")
        return action.default({requestId: value.requestId, energy, signal})
      })
      .success(({update, data}) => update({ack: true, ackId: data.ackId, status: data.status, error: data.error})),
    destroy("stopped", {env: ["server"]}).before(async ({energy}): Promise<void> => {
      const action = await import("@internal/network-stop")
      return action.default({energy})
    }),
  ])
  .reactions()
  .matter()
  .bulk()
