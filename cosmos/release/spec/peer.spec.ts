/** Transport contract: trusted graph digest, bounded delivery и проверяемые отмены без исполнения artifacts. */
import {expect, test} from "bun:test"
import {createReleasePeer} from "../server/peer/index.ts"
import {artifactBytes, artifactIdentity, releaseDigest, releaseGraph} from "./peer-fixture/data"
import {channelPair} from "./peer-fixture/channel"

test("Graph и большой artifact проходят ограниченными wire frames", async () => {
  const wire = channelPair(1024)
  const receiver = createReleasePeer(wire.left)
  const source = createReleasePeer(wire.right)
  const reads: unknown[] = []
  source.serve({
    async readGraph() { return releaseGraph },
    async read(identity) {
      reads.push(identity)
      return artifactBytes
    },
  })
  try {
    expect(await receiver.getGraph(releaseDigest), "Graph соответствует назначенному digest").toEqual(releaseGraph)
    const chunks: Uint8Array[] = []
    for await (const bytes of receiver.readArtifact(artifactIdentity)) chunks.push(bytes)
    expect(Buffer.concat(chunks), "Все bytes получены с исходным порядком и длиной").toEqual(artifactBytes)
    expect(reads, "Источник получает exact identity вместе с ожидаемыми hash и size").toEqual([artifactIdentity])
    expect(wire.frames.every(bytes => bytes.length <= 1024), "Negotiated limit ограничивает body вместе с framing").toBeTrue()
  } finally {
    receiver.close()
    source.close()
  }
  expect(wire.subscriptions(), "Закрытие transport снимает собственные подписки").toBe(0)
  expect(wire.left.readyState, "Borrowed RTC channel остаётся у своего владельца").toBe("open")
})

test("Источник не подменяет graph с другим ожидаемым digest", async () => {
  const wire = channelPair()
  const receiver = createReleasePeer(wire.left)
  const source = createReleasePeer(wire.right)
  source.serve({async readGraph() { return releaseGraph }, async read() { return artifactBytes }})
  try {
    await expect(receiver.getGraph("f".repeat(64)), "Несовпадающий graph не принимается").rejects.toThrow("Remote release source failed")
  } finally {
    receiver.close()
    source.close()
  }
})

test("Короткий artifact stream не выдаётся за завершённый", async () => {
  const wire = channelPair()
  const receiver = createReleasePeer(wire.left)
  const source = createReleasePeer(wire.right)
  source.serve({async readGraph() { return releaseGraph }, async read() { return artifactBytes.subarray(0, 12) }})
  try {
    const receive = async () => { for await (const _ of receiver.readArtifact(artifactIdentity)) {} }
    await expect(receive(), "End требует ровно ожидаемое число bytes").rejects.toThrow("Remote release source failed")
  } finally {
    receiver.close()
    source.close()
  }
})

test("Timeout освобождает неподтверждённый запрос", async () => {
  const wire = channelPair()
  const receiver = createReleasePeer(wire.left, {timeoutMs: 20})
  try {
    await expect(receiver.getGraph(releaseDigest), "Молчание endpoint завершается явным timeout").rejects.toThrow("timed out")
  } finally { receiver.close() }
})

test("Прерывание consumer отменяет source и освобождает iterator", async () => {
  const wire = channelPair()
  const receiver = createReleasePeer(wire.left)
  const source = createReleasePeer(wire.right)
  let returned = false
  source.serve({
    async readGraph() { return releaseGraph },
    async read() {
      return (async function* () {
        try { yield artifactBytes } finally { returned = true }
      })()
    },
  })
  try {
    const iterator = receiver.readArtifact(artifactIdentity)[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first.done, "Первый chunk принят до отмены").toBeFalse()
    await iterator.return?.()
    await Bun.sleep(0)
    expect(returned, "Cancel закрывает source iterator, ожидающий ACK").toBeTrue()
  } finally {
    receiver.close()
    source.close()
  }
})

test("Disconnect отклоняет pending и отменяет source", async () => {
  const wire = channelPair()
  const receiver = createReleasePeer(wire.left)
  const source = createReleasePeer(wire.right)
  source.serve({async readGraph() { return releaseGraph }, async read() { return artifactBytes }})
  try {
    const iterator = receiver.readArtifact(artifactIdentity)[Symbol.asyncIterator]()
    await iterator.next()
    wire.disconnect()
    await expect(iterator.next(), "Следующий chunk не остаётся зависшим после закрытия RTC").rejects.toThrow("disconnected")
    expect(wire.subscriptions(), "Disconnect снимает обе transport subscriptions").toBe(0)
  } finally {
    receiver.close()
    source.close()
  }
})

test("AbortSignal прекращает ожидание и bounded request slots", async () => {
  const wire = channelPair()
  const receiver = createReleasePeer(wire.left, {maxRequests: 1})
  const abort = new AbortController()
  const first = receiver.getGraph(releaseDigest, {signal: abort.signal})
  void first.catch(() => {})
  try {
    await expect(receiver.getGraph(releaseDigest), "Число одновременно ожидающих запросов ограничено").rejects.toThrow("pending request limit")
    abort.abort(new Error("fixture abort"))
    await expect(first, "Abort прекращает ожидание ответа").rejects.toThrow("fixture abort")
  } finally { receiver.close() }
})


test("whenIdle ждёт принятую передачу и source cleanup при отмене", async () => {
  const wire = channelPair()
  const receiver = createReleasePeer(wire.left)
  const source = createReleasePeer(wire.right)
  let releaseCleanup!: () => void
  const cleanup = new Promise<void>(resolve => { releaseCleanup = resolve })
  source.serve({
    async readGraph() { return releaseGraph },
    async read() {
      return (async function* () {
        try { yield artifactBytes } finally { await cleanup }
      })()
    },
  })
  try {
    const iterator = receiver.readArtifact(artifactIdentity)[Symbol.asyncIterator]()
    await iterator.next()
    let idle = false
    const drained = source.whenIdle().then(() => { idle = true })
    expect(idle, "Принятая передача ждёт дальнейшего потребления").toBeFalse()
    await iterator.return?.()
    await Promise.resolve()
    expect(idle, "Cancel ещё не завершил source cleanup").toBeFalse()
    releaseCleanup()
    await drained
    expect(idle, "Source cleanup завершён до idle").toBeTrue()
    await receiver.whenIdle()
  } finally {
    releaseCleanup()
    receiver.close()
    source.close()
    await Promise.all([receiver.whenIdle(), source.whenIdle()])
  }
})

test("whenIdle завершается при request timeout и закрытии transport", async () => {
  const wire = channelPair()
  const receiver = createReleasePeer(wire.left, {timeoutMs: 20})
  const request = receiver.getGraph(releaseDigest)
  void request.catch(() => {})
  const drained = receiver.whenIdle()
  await expect(request, "Timeout завершает принятую попытку").rejects.toThrow("timed out")
  await drained
  receiver.close()
  await receiver.whenIdle()
  expect(wire.subscriptions(), "Закрытый idle transport не сохраняет подписки").toBe(0)
})
