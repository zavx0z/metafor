import {expect, test} from "bun:test"
import {createDevelopmentSocket} from "./development-client"

test("shared Chat socket receives its own push stream and closes only the observer", async () => {
  const scopes: unknown[] = [], messages: unknown[] = []
  let detach = 0, receive: ((snapshot: unknown) => void) | undefined
  const socket = createDevelopmentSocket((scope, listener) => {
    scopes.push(scope)
    receive = listener
    return () => {detach++}
  })
  socket.addEventListener("message", event => messages.push(JSON.parse(String((event as MessageEvent).data))))
  await Promise.resolve()
  socket.send(JSON.stringify({type: "subscribe", topic: "chat:/cosmos/package/metafor", executorId: "agent", sessionId: "session"}))
  receive?.({address: "/cosmos/package/metafor", status: "running"})
  expect(scopes).toEqual([{address: "/cosmos/package/metafor", executorId: "agent", sessionId: "session"}])
  expect(messages).toEqual([{type: "chat.snapshot", address: "/cosmos/package/metafor", snapshot: {address: "/cosmos/package/metafor", status: "running"}}])
  socket.close()
  socket.close()
  receive?.({status: "idle"})
  expect(detach).toBe(1)
  expect(messages).toHaveLength(1)
})

test("an inline observer denial also releases its late subscription handle", () => {
  let detached = 0
  const socket = createDevelopmentSocket((_scope, _receive, failed) => {
    failed(new Error("Host did not assign this source"))
    return () => {detached++}
  })
  socket.send(JSON.stringify({type: "subscribe", topic: "chat:/cosmos/package/metafor"}))
  expect(detached).toBe(1)
  expect(() => socket.send("{}")).toThrow("Invalid development subscription")
})
