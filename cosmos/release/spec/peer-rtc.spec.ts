/** Два Bun process передают graph и bytes по настоящему loopback RTC; IPC переносит только bootstrap SDP и результаты проверки. */
import {expect, test} from "bun:test"
import {join} from "node:path"
import {artifactIdentity, releaseGraph} from "./peer-fixture/data"

test("Два Bun process получают выпуск через надёжный RTC DataChannel", async () => {
  const path = join(import.meta.dir, "peer-fixture/rtc-process.ts")
  const ready = new Set<string>()
  const stages: string[] = []
  const stopped: {role: string, state: string, largestFrame: number, frames: number}[] = []
  let receiver: ReturnType<typeof Bun.spawn>
  let source: ReturnType<typeof Bun.spawn>
  let resolve!: (value: {graph: unknown, size: number, sha256: string, chunks: number}) => void
  let reject!: (reason: unknown) => void
  const completion = new Promise<{graph: unknown, size: number, sha256: string, chunks: number}>((yes, no) => {
    resolve = yes
    reject = no
  })
  const onMessage = (message: unknown) => {
    const value = message as {type: string, role: string, stage: string, message: string, description: unknown, graph: unknown, size: number, sha256: string, chunks: number, state: string, largestFrame: number, frames: number}
    if (value.type === "stage") stages.push(`${value.role}:${value.stage}`)
    else if (value.type === "offer") source.send({type: "offer", description: value.description})
    else if (value.type === "answer") receiver.send({type: "answer", description: value.description})
    else if (value.type === "ready") {
      ready.add(value.role)
      if (ready.size === 2) receiver.send({type: "run"})
    } else if (value.type === "result") resolve(value)
    else if (value.type === "failure") reject(new Error(value.message))
    else if (value.type === "stopped") stopped.push(value)
  }
  source = Bun.spawn([process.execPath, path, "source"], {ipc: onMessage, stdout: "ignore", stderr: "pipe"})
  receiver = Bun.spawn([process.execPath, path, "receiver"], {ipc: onMessage, stdout: "ignore", stderr: "pipe"})
  for (const child of [source, receiver]) void child.exited.then(async code => {
    if (code !== 0) reject(new Error(child.stderr instanceof ReadableStream ? await new Response(child.stderr).text() : `RTC child exited with ${code}`))
  })
  const timeout = setTimeout(() => reject(new Error("Two-process RTC fixture timed out")), 25_000)
  try {
    const result = await completion.catch(reason => {
      throw new Error(`${String(reason)}; stages=${JSON.stringify(stages)}`)
    })
    expect(result.graph, "Portable graph доставлен с проверкой ожидаемого digest").toEqual(releaseGraph)
    expect(result.size, "Все artifact bytes прошли через RTC, без IPC body").toBe(artifactIdentity.size)
    expect(result.sha256, "Переданные bytes сохраняют точный SHA256").toBe(artifactIdentity.sha256)
    expect(result.chunks, "Artifact больше максимального сообщения доставлен порциями").toBeGreaterThan(1)
  } finally {
    clearTimeout(timeout)
    try { source.send({type: "stop"}) } catch {}
    try { receiver.send({type: "stop"}) } catch {}
    const cleanup = setTimeout(() => {
      source.kill()
      receiver.kill()
    }, 5_000)
    await Promise.all([source.exited, receiver.exited])
    clearTimeout(cleanup)
  }
  expect(source.exitCode, "Источник закрыл собственный RTC и завершился").toBe(0)
  expect(receiver.exitCode, "Получатель закрыл собственный RTC и завершился").toBe(0)
  expect(stopped.map(value => value.state), "Оба endpoint закрыты до выхода процессов").toEqual(["closed", "closed"])
  expect(stopped.every(value => value.largestFrame <= 16_384), "Размер включает transport header и body").toBeTrue()
}, 35_000)
