import {expect, test} from "bun:test"
import {execFileSync} from "node:child_process"
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {connectWebSocketSignaling, type SignalingSocketContext, type SignalingSocketFactory} from "../signaling"
import {createRendezvousHandler, createRendezvousServer, type RendezvousSession} from "../rendezvous"

const token = "test-only-socket-factory-room-token"
const BunSocket = WebSocket as unknown as {new(url: string | URL, options?: Bun.WebSocketOptions): WebSocket}

async function until(check: () => boolean) {
  const deadline = Date.now() + 2000
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Socket fixture timed out")
    await Bun.sleep(5)
  }
}

test("platform socket factory distinguishes WSS signaling/control from separate application relay sockets", async () => {
  const root = await mkdtemp(join(tmpdir(), "peer-socket-tls-"))
  const key = join(root, "key.pem")
  const cert = join(root, "cert.pem")
  const config = join(root, "openssl.cnf")
  await writeFile(config, "[req]\ndistinguished_name=subject\nx509_extensions=extension\nprompt=no\n[subject]\nCN=127.0.0.1\n[extension]\nsubjectAltName=IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\n", {mode: 0o600})
  execFileSync(Bun.which("openssl") ?? "openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-config", config, "-keyout", key, "-out", cert], {stdio: "pipe"})
  const ca = await readFile(cert, "utf8")
  const handler = createRendezvousHandler({token, relay: true})
  const server = Bun.serve<RendezvousSession>({hostname: "127.0.0.1", port: 0, tls: {key: Bun.file(key), cert: Bun.file(cert)},
    fetch(request, server) {return handler.upgrade(request, (request, data) => server.upgrade(request, {data}))},
    websocket: {...handler.recommendedWebSocketOptions, ...handler.websocket},
  })
  const contexts = [[], []] as [SignalingSocketContext[], SignalingSocketContext[]]
  const factory = (index: number): SignalingSocketFactory => (url, context) => {
    expect(url.protocol).toBe("wss:")
    expect(url.search).toBe("")
    contexts[index]!.push(context)
    return new BunSocket(url, {tls: {ca}})
  }
  let a: Awaited<ReturnType<typeof connectWebSocketSignaling>> | undefined
  let b: Awaited<ReturnType<typeof connectWebSocketSignaling>> | undefined
  try {
    const url = `wss://127.0.0.1:${server.port}/peer`
    a = await connectWebSocketSignaling({url, id: "a", token, relay: true, reconnect: false, socketFactory: factory(0)})
    b = await connectWebSocketSignaling({url, id: "b", token, relay: true, reconnect: false, socketFactory: factory(1)})
    await until(() => a!.peers().includes("b"))
    const received: string[] = []
    b.subscribeRelay(event => received.push(event.frame))
    await a.sendRelay("b", "control", "peer:control")
    await a.sendRelay("b", "artifact", "cosmos.release.v1")
    await a.sendRelay("b", "ACP", "provider-acp-v1")
    await until(() => received.length === 3)
    expect(received).toEqual(["control", "artifact", "ACP"])
    for (const [index, remote] of [[0, "b"], [1, "a"]] as const) {
      expect(contexts[index]).toEqual([
        {kind: "signaling"},
        {kind: "relay", peerId: remote, channel: "peer:control"},
        {kind: "relay", peerId: remote, channel: "cosmos.release.v1"},
        {kind: "relay", peerId: remote, channel: "provider-acp-v1"},
      ])
    }
    expect(JSON.stringify(contexts)).not.toContain(token)
    expect(JSON.stringify(contexts)).not.toContain("sessionKey")
  } finally {
    a?.close()
    b?.close()
    handler.close()
    await server.stop(true)
    await rm(root, {recursive: true, force: true})
  }
}, 10_000)

test("socket factory failure is sanitized and reconnect retries the platform constructor", async () => {
  await expect(connectWebSocketSignaling({url: "ws://127.0.0.1:1/peer", id: "initial", token,
    socketFactory() {throw new Error("private-constructor-detail")},
  })).rejects.toThrow("Rendezvous socket creation failed")
  let broker = createRendezvousServer({token, relay: true})
  const url = broker.url
  const port = Number(new URL(url).port)
  let calls = 0
  const transport = await connectWebSocketSignaling({url, id: "reconnect", token, relay: true,
    socketFactory(url) {
      calls++
      if (calls === 2) throw new Error("private-proxy-constructor-detail")
      return new WebSocket(url)
    },
  })
  try {
    await broker.close()
    await until(() => !transport.open)
    broker = createRendezvousServer({token, relay: true, port})
    await until(() => calls >= 3 && transport.open)
    expect(calls).toBe(3)
  } finally {transport.close()
    await broker.close()}
})
