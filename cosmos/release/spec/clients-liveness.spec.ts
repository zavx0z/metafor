import {expect, spyOn, test} from "bun:test"
import {createClientRegistry, type ClientSocketData} from "../server/clients"
import type {ClientStatus} from "@metafor/types/cosmos/client"

// Управляем только server timers; Window с минутным heartbeat не требует browser runtime.
test("hidden Window keeps its incarnation between minute heartbeats, visible expiry stays fast and explicit override stays exact", async () => {
  const nativeTimeout = globalThis.setTimeout, nativeClear = globalThis.clearTimeout
  let now = 0
  const timers = new Map<unknown, {at: number; run(): void}>()
  const schedule = spyOn(globalThis, "setTimeout").mockImplementation(Object.assign((callback: Parameters<typeof nativeTimeout>[0], delay?: number) => {
    const timer = nativeTimeout(() => {}, 2_147_483_647)
    timer.unref()
    timers.set(timer, {at: now + (delay ?? 0), run() {if (typeof callback === "function") callback()}})
    return timer
  }, nativeTimeout))
  const cancel = spyOn(globalThis, "clearTimeout").mockImplementation(timer => {timers.delete(timer); nativeClear(Number(timer))})
  const advance = (milliseconds: number) => {
    const until = now + milliseconds
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      now = next[1].at; timers.delete(next[0]); nativeClear(Number(next[0])); next[1].run()
    }
    now = until
  }
  const world = async () => ({root: "liveness-world", cutId: "liveness-cut"})
  const registry = createClientRegistry({world}), explicit = createClientRegistry({world, heartbeatMs: 75})
  const status = (visible: boolean): ClientStatus => ({visible, focused: false, boot: {phase: "ready", trace: []}})
  const connect = async (owner: typeof registry, visible: boolean) => {
    let data: ClientSocketData | undefined
    const closed: Array<{code: number | undefined; reason: string | undefined}> = []
    const response = await owner.fetch(new Request("http://localhost/clients/socket", {headers: {origin: "http://localhost"}}), {
      requestIP: () => ({address: "127.0.0.1"}), upgrade(_request, options) {data = options.data; return true},
    })
    expect(response).toBeUndefined()
    if (!data) throw new Error("Client upgrade did not assign an incarnation")
    const socket = {data, send() {return 0}, close(code?: number, reason?: string) {closed.push({code, reason})}}
    owner.websocket.open(socket)
    owner.websocket.message(socket, JSON.stringify({type: "hello", version: 1, clientId: null, kind: "Window", capabilities: ["inspect"], status: status(visible)}))
    return {closed, connectionId: data.connectionId, heartbeat(visible: boolean) {
      owner.websocket.message(socket, JSON.stringify({type: "heartbeat", connectionId: socket.data.connectionId, status: status(visible)}))
    }}
  }
  try {
    const hidden = await connect(registry, false)
    for (let minute = 0; minute < 4; minute++) {
      advance(60_000)
      expect(hidden.closed).toEqual([])
      expect((await registry.read({})).clients[0]?.connectionId).toBe(hidden.connectionId)
      hidden.heartbeat(false)
    }
    hidden.heartbeat(true)
    advance(29_999)
    expect(hidden.closed).toEqual([])
    advance(1)
    expect(hidden.closed).toEqual([{code: 1001, reason: "Client heartbeat expired"}])
    expect((await registry.read({})).clients).toEqual([])
    const custom = await connect(explicit, false)
    advance(74)
    expect(custom.closed).toEqual([])
    advance(1)
    expect(custom.closed).toEqual([{code: 1001, reason: "Client heartbeat expired"}])
    const hiddenWithoutHeartbeat = await connect(registry, false)
    advance(179_999)
    expect(hiddenWithoutHeartbeat.closed).toEqual([])
    advance(1)
    expect(hiddenWithoutHeartbeat.closed).toEqual([{code: 1001, reason: "Client heartbeat expired"}])
  } finally {
    registry.close(); explicit.close()
    for (const timer of timers.keys()) nativeClear(Number(timer))
    cancel.mockRestore(); schedule.mockRestore()
  }
})
