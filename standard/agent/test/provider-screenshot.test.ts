import {expect, test} from "bun:test"
import {createProviderScreenshot, type ProviderScreenshotVideo} from "../provider-screenshot"
import type {CapsuleScreenshotCanvasLike} from "@capsule/screenshot/browser"

class Socket extends EventTarget {
  readyState = 0
  bufferedAmount = 0
  sent: Array<string | Uint8Array> = []
  send(value: string | Uint8Array) {this.sent.push(value)}
  open() {this.readyState = 1; this.dispatchEvent(new Event("open"))}
  close() {this.readyState = 3; this.dispatchEvent(new Event("close"))}
  request(id: string, instanceId = "assigned-instance") {this.dispatchEvent(new MessageEvent("message", {data: JSON.stringify({v: 1, type: "screenshot.request", requestId: id, instanceId, mimeType: "image/png", maxWidth: 640, maxHeight: 360})}))}
}
const settle = async () => {for (let index = 0; index < 12; index++) await Promise.resolve()}
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
function fixture(defer = false) {
  const socket = new Socket(), signal = new AbortController(), drawn: unknown[] = []
  let encode: ((blob: Blob | null) => void) | undefined, creates = 0, paused = 0
  const video: ProviderScreenshotVideo & {readyState: number} = {readyState: 0, videoWidth: 1280, videoHeight: 720, srcObject: null, autoplay: false, muted: false, playsInline: false,
    async play() {this.readyState = 2}, pause() {paused++}}
  const canvas: CapsuleScreenshotCanvasLike = {width: 0, height: 0, getContext() {return {drawImage(source) {drawn.push(source)}}},
    toBlob(callback) {if (defer) encode = callback; else callback(new Blob([png], {type: "image/png"}))}}
  const create = () => createProviderScreenshot({instanceId: "assigned-instance", origin: "https://cosmos.test", signal: signal.signal,
    videoFactory() {creates++; return video}, socketFactory(url) {expect(url).toBe("wss://cosmos.test/api/screenshots/provider"); return socket}, canvasFactory: () => canvas})
  return {socket, signal, video, drawn, canvas, create, creates: () => creates, paused: () => paused, finish: () => encode?.(new Blob([png], {type: "image/png"}))}
}

test("public PNG provider captures only its assigned RTC frame and preserves Capsule instance/request correlation", async () => {
  const f = fixture(), capture = f.create()
  try {
    f.socket.open()
    expect(JSON.parse(String(f.socket.sent[0]))).toMatchObject({type: "screenshot.provider.register", instanceId: "assigned-instance"})
    f.socket.request("before-stream")
    await settle()
    expect(JSON.parse(String(f.socket.sent.at(-1)))).toMatchObject({type: "screenshot.error", requestId: "before-stream", errorCode: "frame-not-ready"})
    const stream = {getVideoTracks() {return []}}
    await capture.attach(stream)
    expect(f.video.srcObject).toBe(stream)
    expect(f.video).toMatchObject({muted: true, autoplay: true, playsInline: true})
    f.socket.request("wrong-instance", "other-instance")
    await settle()
    expect(JSON.parse(String(f.socket.sent.at(-1)))).toMatchObject({type: "screenshot.error", requestId: "wrong-instance", errorCode: "invalid-request"})
    expect(f.drawn).toEqual([])
    f.socket.request("owner-save-correlation")
    await settle()
    expect(JSON.parse(String(f.socket.sent.at(-2)))).toMatchObject({type: "screenshot.result", requestId: "owner-save-correlation", instanceId: "assigned-instance", mimeType: "image/png", width: 640, height: 360, byteLength: png.length})
    expect(f.socket.sent.at(-1)).toEqual(png)
    expect(f.drawn).toEqual([f.video])
  } finally {capture.close()}
  expect(f.video.srcObject).toBeNull()
  expect(f.socket.readyState).toBe(3)
  expect(capture.snapshot().status).toBe("closed")
})

test("closing during encoding suppresses late PNG, releases decoder and prevents inactive capture or reopening", async () => {
  const f = fixture(true), capture = f.create()
  f.socket.open()
  await capture.attach({getVideoTracks() {return []}})
  f.socket.request("pending")
  await settle()
  const sent = f.socket.sent.length
  f.signal.abort()
  f.finish()
  await settle()
  f.socket.request("inactive")
  await settle()
  expect(f.socket.sent).toHaveLength(sent)
  expect(f.drawn).toHaveLength(1)
  expect(f.video.srcObject).toBeNull()
  expect(f.paused()).toBe(1)
  await expect(capture.attach({})).rejects.toThrow("closed")
  capture.close()
  expect(f.paused()).toBe(1)
  const unopened = fixture()
  unopened.signal.abort()
  expect(() => unopened.create()).toThrow()
  expect(unopened.creates()).toBe(0)
  expect(unopened.socket.sent).toEqual([])
})
