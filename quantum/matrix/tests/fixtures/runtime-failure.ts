import type {BoundaryInitialState} from "shared/protocol/boundary/initial"
import {prepareMatrixBirth} from "../../birth.ts"

const sockets: FakeWebSocket[] = []

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  onopen: ((event: Event) => unknown) | null = null
  onmessage: ((event: MessageEvent) => unknown) | null = null
  onclose: ((event: CloseEvent) => unknown) | null = null
  onerror: ((event: Event) => unknown) | null = null

  constructor() {
    sockets.push(this)
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN
      this.onopen?.(new Event("open"))
    })
  }

  send(): void {}

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
  }

  receive(payload: unknown): void {
    this.onmessage?.({data: JSON.stringify(payload)} as MessageEvent)
  }
}

Object.defineProperty(globalThis, "WebSocket", {
  configurable: true,
  value: FakeWebSocket,
})

const initial: BoundaryInitialState = {
  version: 2,
  reactionRelations: [],
  pendingProcessExecutions: [],
  atoms: [{
    id: 17,
    wimp: "owner/runtime-failure",
    values: [{field: 101, valueId: 1001, value: "ready"}],
    state: null,
  }],
  declarations: [{
    src: "owner/runtime-failure",
    section: "fields",
    localId: "1",
    value: {id: 101, key: "value", type: "string", default: "", position: 0},
  }],
}

Bun.env.FORCE_RECONNECT = "0"
await prepareMatrixBirth(initial)
await import("../../matrix.ts")
await Bun.sleep(0)

sockets.at(-1)?.receive({
  parts: [{
    part: "gluon",
    op: "replace",
    path: 17,
    by: "boundary",
    ts: 1,
    value: {fields: {"101": 42}},
  }],
})

await Bun.sleep(1_000)
throw new Error("Matrix did not exit after a critical runtime failure")
