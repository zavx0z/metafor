/** Signaling callback возвращает answer до connected; helpers владеют только своими RTC endpoints. */
import {expect, test} from "bun:test"
import {acceptReleasePeer, createConnectedReleasePeer} from "../server/peer/connect"
import {artifactBytes, artifactIdentity, releaseDigest, releaseGraph} from "./peer-fixture/data"

const rtc = {
  iceServers: [],
  iceUseIpv4: true,
  iceUseIpv6: false,
  iceInterfaceAddresses: {udp4: "127.0.0.1"},
  iceAdditionalHostAddresses: ["127.0.0.1"],
  iceFilterCandidatePair: (pair: {localCandidate: {host: string}, remoteCandidate: {host: string}}) => pair.localCandidate.host === "127.0.0.1" && pair.remoteCandidate.host === "127.0.0.1",
}

test("Caller-supplied signaling соединяет RTC release peers без отдельного сервера", async () => {
  let publisher: Awaited<ReturnType<typeof acceptReleasePeer>> | undefined
  let receiver: Awaited<ReturnType<typeof createConnectedReleasePeer>> | undefined
  let offers = 0
  const preparation = new AbortController()
  try {
    receiver = await createConnectedReleasePeer(async offer => {
      offers += 1
      publisher = await acceptReleasePeer(offer, {
        async readGraph() { return releaseGraph },
        async read() { return artifactBytes },
      }, {rtc, signal: preparation.signal})
      return publisher.answer
    }, {rtc, signal: preparation.signal})
    await publisher!.connected
    preparation.abort(new Error("Preparation already complete"))
    expect(offers, "Signaling передаёт один offer/answer; graph и artifact идут RTC").toBe(1)
    expect(await receiver.peer.getGraph(releaseDigest), "Источник подтверждает назначенный graph").toEqual(releaseGraph)
    const chunks: Uint8Array[] = []
    for await (const bytes of receiver.peer.readArtifact(artifactIdentity)) chunks.push(bytes)
    expect(Buffer.concat(chunks), "Подключённый peer предоставляет точные artifact bytes").toEqual(artifactBytes)
    const closing = publisher!.close()
    expect(publisher!.close(), "Owned close возвращает тот же cleanup promise").toBe(closing)
    await receiver.closed
    await closing
    await receiver.close()
  } finally {
    await Promise.all([receiver?.close(), publisher?.close()])
  }
}, 25_000)


test("Abort отменяет connector и accepted endpoint во время подготовки", async () => {
  const abort = new AbortController()
  let publisher: Awaited<ReturnType<typeof acceptReleasePeer>> | undefined
  let signalEntered!: () => void
  const pendingSignal = new Promise<void>(resolve => { signalEntered = resolve })
  const connecting = createConnectedReleasePeer(async (offer, options) => {
    publisher = await acceptReleasePeer(offer, {
      async readGraph() { return releaseGraph },
      async read() { return artifactBytes },
    }, {rtc, signal: abort.signal})
    signalEntered()
    return new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(options.signal.reason), {once: true})
    })
  }, {rtc, signal: abort.signal})
  void connecting.catch(() => {})
  try {
    await pendingSignal
    abort.abort(new Error("cancel RTC preparation"))
    await expect(connecting, "Connector прекращает ожидающий signaling callback").rejects.toThrow("cancel RTC preparation")
    await expect(publisher!.connected, "Accepted endpoint прекращает ожидание ICE/DataChannel").rejects.toThrow("cancel RTC preparation")
    await publisher!.closed
    const cleanup = publisher!.close()
    expect(publisher!.close(), "Отмена сохраняет идемпотентность cleanup").toBe(cleanup)
    await cleanup
  } finally {
    abort.abort()
    await publisher?.close()
  }
}, 25_000)

test("Заранее отменённый signal не начинает RTC signaling", async () => {
  const abort = new AbortController()
  abort.abort(new Error("already cancelled"))
  let called = false
  await expect(createConnectedReleasePeer(async () => {
    called = true
    throw new Error("Unexpected signaling")
  }, {signal: abort.signal}), "Отмена проверяется до создания owned RTC").rejects.toThrow("already cancelled")
  expect(called, "Отменённая подготовка не вызывает внешний callback").toBeFalse()
})
