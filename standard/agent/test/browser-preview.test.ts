import {expect, test} from "bun:test"
import {CapsuleRtcViewer, type CapsuleRtcViewerPeerConnectionLike} from "@capsule/webrtc/viewer"
import {CapsuleRtcMediaController, type CapsuleRtcVideoElementLike} from "@capsule/webrtc/media"
import {connectProviderBrowserPreview} from "../browser-preview"
import type {AtomBrowserConnection} from "../atom"

class Events {
  private listeners = new Map<string, Array<(event: never) => void>>()
  addEventListener(type: string, listener: (event: never) => void) {
    this.listeners.set(type, [...this.listeners.get(type) ?? [], listener])
  }
  emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event as never)
  }
}
class Socket extends Events {
  readyState = 0
  bufferedAmount = 0
  sent: Array<string | Uint8Array> = []
  send(payload: string | Uint8Array) {this.sent.push(payload)}
  close() {this.readyState = 3; this.emit("close")}
  open() {this.readyState = 1; this.emit("open")}
  message(value: unknown) {this.emit("message", {data: JSON.stringify(value)})}
}
class Channel extends Events {
  readyState = "open"
  sent: string[] = []
  constructor(readonly label: string) {super()}
  send(payload: string) {this.sent.push(payload)}
  close() {this.readyState = "closed"; this.emit("close")}
}
class Peer extends Events implements CapsuleRtcViewerPeerConnectionLike {
  connectionState = "new"
  localDescription: unknown
  channels: Channel[] = []
  transceivers: Array<{kind: string; direction: string}> = []
  addTransceiver(kind: "video" | "audio", init: {direction: "recvonly" | "sendrecv"}) {
    this.transceivers.push({kind, ...init})
    return {sender: {track: null, async replaceTrack() {}}}
  }
  createDataChannel(label: string) {const channel = new Channel(label); this.channels.push(channel); return channel}
  async createOffer() {return {type: "offer", sdp: "test"}}
  async setLocalDescription(value: unknown) {this.localDescription = value}
  async setRemoteDescription() {}
  async addIceCandidate() {}
  close() {this.connectionState = "closed"}
}
const settle = async () => {for (let index = 0; index < 10; index++) await Promise.resolve()}
function fixture(audio = true) {
  const socket = new Socket(), peer = new Peer()
  let grantsClosed = 0
  const requests: unknown[] = []
  const binding = {id: "browser", service: "capsule", host: "remote", remotePeerId: "peer:remote", executorId: "browser:one"}
  const connection: AtomBrowserConnection = {binding, iceServers: [{urls: "stun:example.test"}], client: {
    async describe(selection) {requests.push(selection); return {instanceId: "instance:one", profile: "saved-profile", controlEnabled: true, media: {audio, microphoneTransport: null}}},
    socket(selection) {requests.push(selection); return socket},
    async close() {grantsClosed++},
  }}
  const video: CapsuleRtcVideoElementLike = {autoplay: false, defaultMuted: false, muted: true, playsInline: false, paused: true, readyState: 4,
    currentTime: 0, videoWidth: 1280, videoHeight: 720, srcObject: null, addEventListener() {}, async play() {this.paused = false}, pause() {this.paused = true}}
  return {socket, peer, requests, connection, video, media: new CapsuleRtcMediaController(video), grantsClosed: () => grantsClosed}
}

test("real public Viewer uses assigned signaling, fresh media capabilities, host input readiness and exclusive cleanup", async () => {
  const f = fixture()
  const abort = new AbortController()
  const view = await connectProviderBrowserPreview({connection: f.connection, media: f.media, origin: "https://cosmos.test", signal: abort.signal,
    viewerFactory: options => new CapsuleRtcViewer({...options, peerConnectionFactory: () => f.peer})})
  f.socket.open()
  f.socket.message({type: "sender-ready", fromRole: "host-sender", from: "page"})
  await settle()
  expect(f.peer.transceivers).toEqual([{kind: "video", direction: "recvonly"}, {kind: "audio", direction: "recvonly"}])
  expect(f.requests[1]).toMatchObject({peerId: "peer:remote", executorId: "browser:one", instanceId: "instance:one"})
  const control = f.peer.channels[0]!
  control.emit("open")
  expect(view.snapshot().controlReady).toBe(false)
  expect(view.sendTransient({v: 1, id: "input-one", type: "keyDown", key: "a", code: "KeyA", modifiers: []})).toBe(false)
  control.emit("message", {data: JSON.stringify({type: "controlStatus", status: "open"})})
  expect(view.snapshot().controlReady).toBe(true)
  const stream = {getVideoTracks: () => []}
  f.peer.emit("track", {streams: [stream]})
  await settle()
  expect(f.video.srcObject).toBe(stream)
  f.media.setMuted(false)
  expect(f.video.muted).toBe(false)
  abort.abort()
  await view.close()
  expect(f.video.srcObject).toBeNull()
  expect(f.grantsClosed()).toBe(1)
  expect(f.peer.connectionState).toBe("closed")
})

test("aborted grant is released before describe and absent media never guesses audio capability", async () => {
  const f = fixture(false)
  const abort = new AbortController()
  abort.abort()
  await expect(connectProviderBrowserPreview({connection: f.connection, media: f.media, origin: "https://cosmos.test", signal: abort.signal})).rejects.toThrow()
  expect(f.requests).toHaveLength(0)
  expect(f.grantsClosed()).toBe(1)
  const live = fixture(false)
  const view = await connectProviderBrowserPreview({connection: live.connection, media: live.media, origin: "https://cosmos.test", signal: new AbortController().signal,
    viewerFactory: options => new CapsuleRtcViewer({...options, peerConnectionFactory: () => live.peer})})
  live.socket.open()
  live.socket.message({type: "sender-ready", fromRole: "host-sender", from: "page"})
  await settle()
  expect(live.peer.transceivers).toEqual([{kind: "video", direction: "recvonly"}])
  await expect(view.toggleMicrophone()).rejects.toThrow("unavailable")
  await view.close()
})

test("active Viewer binds the public screenshot provider to the same profile, instance and received stream", async () => {
  const f = fixture(), socket = new Socket(), abort = new AbortController(), calls: unknown[] = []
  const capture = {...f.video, srcObject: null as unknown, async play() {this.paused = false}}
  const connection: AtomBrowserConnection = {...f.connection, client: {...f.connection.client,
    screenshotProvider(selection) {calls.push(selection); return socket},
  }}
  const view = await connectProviderBrowserPreview({connection, media: f.media, origin: "https://cosmos.test", signal: abort.signal,
    screenshotVideoFactory: () => capture,
    viewerFactory: options => new CapsuleRtcViewer({...options, peerConnectionFactory: () => f.peer})})
  try {
    expect(calls).toMatchObject([{peerId: "peer:remote", executorId: "browser:one", instanceId: "instance:one", profile: "saved-profile"}])
    socket.open()
    expect(JSON.parse(String(socket.sent[0]))).toMatchObject({type: "screenshot.provider.register", instanceId: "instance:one"})
    f.socket.open()
    f.socket.message({type: "sender-ready", fromRole: "host-sender", from: "page"})
    await settle()
    const stream = {getVideoTracks() {return []}}
    f.peer.emit("track", {streams: [stream]})
    await settle()
    expect(f.video.srcObject).toBe(stream)
    expect(capture.srcObject).toBe(stream)
    expect(view.snapshot().screenshot?.status).toBe("connecting")
    abort.abort()
    await view.close()
    expect(socket.readyState).toBe(3)
    expect(capture.srcObject).toBeNull()
    expect(f.video.srcObject).toBeNull()
    expect(f.grantsClosed()).toBe(1)
  } finally {await view.close()}
})
