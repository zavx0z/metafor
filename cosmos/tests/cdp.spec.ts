import {expect, test} from "bun:test"
import {CdpConnection, evaluate} from "./fixture/cdp"
import {waitForNavigation} from "./fixture/chrome"

test("CDP correlates out-of-order replies and isolates flattened session events", async () => {
  const requests: Array<{id: number; sessionId: string}> = []
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request, server) {
      if (server.upgrade(request)) return
      return new Response(null, {status: 404})
    },
    websocket: {
      message(socket, message) {
        requests.push(JSON.parse(String(message)))
        if (requests.length !== 2) return
        for (const request of [...requests].reverse()) {
          socket.send(JSON.stringify({id: request.id, result: {result: {type: "string", value: request.sessionId}}}))
          socket.send(JSON.stringify({sessionId: request.sessionId, method: "Runtime.consoleAPICalled",
            params: {type: "log", args: [{type: "string", value: request.sessionId}], executionContextId: 1, timestamp: 1}}))
        }
      },
    },
  })
  const connection = await CdpConnection.connect(`ws://127.0.0.1:${server.port}`)
  try {
    const first = connection.session("first"), second = connection.session("second")
    const events: string[] = []
    let ready!: () => void
    const received = new Promise<void>(resolve => { ready = resolve })
    const record = (value: string) => { events.push(value); if (events.length === 2) ready() }
    first.on("Runtime.consoleAPICalled", event => record(`first:${event.args[0]?.value}`))
    second.on("Runtime.consoleAPICalled", event => record(`second:${event.args[0]?.value}`))
    expect(await Promise.all([evaluate(first, () => "one"), evaluate(second, () => "two")]))
      .toEqual(["first", "second"])
    await received
    expect(events).toEqual(["second:second", "first:first"])
  } finally {
    connection.close()
    await server.stop(true)
  }
})

test("CDP propagates protocol errors and rejects outstanding commands when closed", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request, server) {
      if (server.upgrade(request)) return
      return new Response(null, {status: 404})
    },
    websocket: {
      message(socket, message) {
        const request = JSON.parse(String(message))
        if (request.method === "Page.enable")
          socket.send(JSON.stringify({id: request.id, error: {code: -32000, message: "fixture failure"}}))
      },
    },
  })
  const connection = await CdpConnection.connect(`ws://127.0.0.1:${server.port}`)
  try {
    const session = connection.session()
    await expect(session.send("Page.enable")).rejects.toThrow("fixture failure")
    const pending = session.send("Runtime.enable")
    const navigation = waitForNavigation({session, targetId: "fixture", frameId: "main", url: "about:blank", responses: new Map()})
    connection.close()
    await expect(pending).rejects.toThrow("CDP connection closed")
    await expect(navigation).rejects.toThrow("closed during navigation")
  } finally {
    connection.close()
    await server.stop(true)
  }
})
