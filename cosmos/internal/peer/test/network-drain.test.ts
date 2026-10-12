import {expect, test} from "bun:test"
import {mkdtemp, rm, writeFile} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {startReleaseNode, type ReleaseNode} from "@cosmos/release/node"
import {createRendezvousServer} from "@metafor/tech-peer/rendezvous"
import {publishedReleaseGraphDigest, type PublishedReleaseGraph} from "@metafor/tech-release/installed"
import stop, {type MetaforCosmosInternalPeerProcessStop as Stop} from "../process/stop"

test("Meta stop rejects new source calls while an accepted real release transfer drains before network close", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meta-network-drain-"))
  const tokenFile = join(directory, "token")
  const token = "test-only-meta-drain-room-credential"
  await writeFile(tokenFile, token, {mode: 0o600})
  const graph: PublishedReleaseGraph = {schemaVersion: 1, packages: [{name: "@fixture/drain", version: "1.0.0", dependencies: {}, environments: [{env: "server", publicArtifacts: {}, outputs: [{artifact: ".", kind: "entry-point", type: "text/javascript", sha256: new Bun.CryptoHasher("sha256").update("x").digest("hex"), size: 1}]}]}]}
  const digest = publishedReleaseGraphDigest(graph)
  const broker = createRendezvousServer({token, relay: true})
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const admission = {open: true}
  let leaseReleased = false
  let source: ReleaseNode | undefined
  let receiver: ReleaseNode | undefined
  const energy: Stop.Input["energy"] = {}
  const noRtc = () => {throw new Error("This fixture exercises the admitted WebSocket reserve")}
  try {
    source = await startReleaseNode({config: {id: "drain-source", signalingUrl: broker.url, tokenFile, allowedPeers: ["drain-receiver"]}, source: {
      async readGraph(expected) {
        if (!admission.open || expected !== digest) throw new Error("Source admission closed")
        entered.resolve()
        await release.promise
        return graph
      },
      async read() {throw new Error("No artifact request is expected")},
    }}, {rtc: noRtc})
    receiver = await startReleaseNode({config: {id: "drain-receiver", signalingUrl: broker.url, tokenFile, allowedPeers: ["drain-source"]}, source: {
      async readGraph() {throw new Error("Receiver is not a publisher")}, async read() {throw new Error("Receiver is not a publisher")},
    }}, {rtc: noRtc})
    const remote = await receiver.peer("drain-source")
    const accepted = remote.getGraph(digest)
    await entered.promise
    energy.resource = {node: source, admission, digest, configurationFile: join(directory, "peer.json"),
      lease: {path: directory, signal: new AbortController().signal, async release() {leaseReleased = true}},
    }
    let completed = false
    const stopping = stop({energy, signal: new AbortController().signal, requestId: "drain-stop"}).then(result => {completed = true; return result})
    await Bun.sleep(0)
    expect(admission.open).toBeFalse()
    expect(completed).toBeFalse()
    expect(leaseReleased).toBeFalse()
    expect(source.snapshot().links.some(link => link.state === "open")).toBeTrue()
    await expect(remote.getGraph(digest)).rejects.toThrow()
    expect(completed).toBeFalse()
    release.resolve()
    expect(await accepted).toEqual(graph)
    expect(await stopping).toEqual({ackId: "drain-stop", status: "stopped", error: null})
    expect(leaseReleased).toBeTrue()
    expect(energy.resource).toBeUndefined()
    expect(source.snapshot().links).toEqual([])
  } finally {
    release.resolve()
    await stop.cleanup({energy})
    await source?.close()
    await receiver?.close()
    await broker.close()
    await rm(directory, {recursive: true, force: true})
  }
}, 10_000)
