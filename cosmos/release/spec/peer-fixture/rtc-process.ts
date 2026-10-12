import {createHash} from "node:crypto"
import {createRequire} from "node:module"
import {dirname, resolve} from "node:path"
import {RTCPeerConnection} from "werift"
import {createReleasePeer, createWeriftReleaseChannel, type ReleasePeer} from "../../server/peer/index.ts"
import {artifactBytes, artifactIdentity, releaseDigest, releaseGraph} from "./data"

const role = process.argv[2]
const pc = new RTCPeerConnection({
  iceServers: [],
  iceUseIpv4: true,
  iceUseIpv6: false,
  iceInterfaceAddresses: {udp4: "127.0.0.1"},
  iceAdditionalHostAddresses: ["127.0.0.1"],
  iceFilterCandidatePair: pair => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1",
})
let peer: ReleasePeer | undefined
let largestFrame = 0
let frames = 0
let stopping = false
const notify = (value: unknown) => process.send?.(value)
const resolvedLibrary = createRequire(import.meta.url).resolve("werift")
const libraryManifest = await Bun.file(resolve(dirname(resolvedLibrary), "../../../package.json")).json()
if (libraryManifest.version !== "0.23.0") throw new Error(`Unexpected werift version ${libraryManifest.version}`)
notify({type: "stage", role, stage: "boot:" + libraryManifest.version})
pc.connectionStateChange.subscribe(state => notify({type: "stage", role, stage: state}))
const attach = (channel: Parameters<typeof createWeriftReleaseChannel>[0]) => {
  const port = createWeriftReleaseChannel(channel)
  peer = createReleasePeer({
    get readyState() { return port.readyState },
    get bufferedAmount() { return port.bufferedAmount },
    get maxMessageSize() { return port.maxMessageSize },
    send(message) {
      largestFrame = Math.max(largestFrame, message.byteLength)
      frames += 1
      port.send(message)
    },
    subscribe: port.subscribe,
  }, {timeoutMs: 10_000})
  if (role === "source") peer.serve({
    async readGraph(digest) {
      if (digest !== releaseDigest) throw new Error("Unknown fixture release")
      return releaseGraph
    },
    async read(identity) {
      if (JSON.stringify(identity) !== JSON.stringify(artifactIdentity)) throw new Error("Unknown fixture artifact")
      return artifactBytes
    },
  })
  notify({type: "ready", role})
}

const fail = async (reason: unknown) => {
  notify({type: "failure", message: reason instanceof Error ? reason.message : String(reason)})
  peer?.close(reason)
  await pc.close()
  process.exit(1)
}

pc.onDataChannel.subscribe(channel => {
  if (channel.readyState === "open") attach(channel)
  else channel.stateChange.once(state => {
    if (state === "open") attach(channel)
    else void fail(new Error("Fixture channel failed before opening"))
  })
})

process.on("message", message => {
  void (async () => {
    const command = message as {type: string, description?: {type: "offer" | "answer", sdp: string}}
    notify({type: "stage", role, stage: "command:" + command.type})
    if (command.type === "offer") {
      await pc.setRemoteDescription(command.description!)
      await pc.setLocalDescription(await pc.createAnswer())
      notify({type: "answer", description: pc.localDescription})
    } else if (command.type === "answer") {
      await pc.setRemoteDescription(command.description!)
    } else if (command.type === "run") {
      if (!peer) throw new Error("Fixture peer is not ready")
      const graph = await peer.getGraph(releaseDigest)
      const received: Uint8Array[] = []
      for await (const bytes of peer.readArtifact(artifactIdentity)) received.push(bytes)
      const bytes = Buffer.concat(received)
      notify({type: "result", graph, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), chunks: received.length, largestFrame, frames})
    } else if (command.type === "stop" && !stopping) {
      stopping = true
      peer?.close()
      await peer?.whenIdle()
      await pc.close()
      notify({type: "stopped", role, state: pc.connectionState, largestFrame, frames})
      process.exit(0)
    }
  })().catch(fail)
})

if (role === "receiver") {
  const channel = pc.createDataChannel("release", {ordered: true})
  channel.stateChange.once(state => {
    if (state === "open") attach(channel)
    else void fail(new Error("Fixture channel failed before opening"))
  })
  notify({type: "stage", role, stage: "creating-offer"})
  await pc.setLocalDescription(await pc.createOffer())
  notify({type: "offer", description: pc.localDescription})
}
