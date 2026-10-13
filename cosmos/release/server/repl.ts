import {createHash, timingSafeEqual} from "node:crypto"
import {isAbsolute} from "node:path"
import {OracleRpcPeer} from "shared/transport/oracle"
import {readNativeReplAssignment, type NativeReplAssignment} from "shared/native/repl"
export {readNativeReplAssignment, type NativeReplAssignment} from "shared/native/repl"
import {createLocalOracleChannelPair} from "../../../quantum/dark/oracle/local"
import {REPL_CHANNEL, REPL_METHODS, type ReplCapabilities, type ReplJob, type ReplJobReceipt, type ReplLog, type ReplReadReceipt, type ReplSession} from "../shared/repl"
// Bun встраивает исходный текст в server artifact; установленному выпуску checkout не нужен.
// @ts-expect-error Bun text import загружает JavaScript как строку, а не как модуль.
import workerSource from "./repl-worker.js" with {type: "text"}

type Session = {view: ReplSession; child: Bun.Subprocess<"ignore", "pipe", "pipe">; jobs: Map<string, ReplJob>; queue: ReplJob[]; active: ReplJob | null;
  logs: ReplLog[]; sequence: number; droppedThrough: number; logBytes: number; timer?: ReturnType<typeof setTimeout>; ready: Promise<void>; drained: Promise<unknown>[]}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/.test(value)
const integer = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max

/**
Release владеет сессиями и их группами процессов. Heap и dedupe records существуют
только в этой incarnation; crash даёт uncertain активному заданию и cancelled
очереди. evaluate немедленно возвращает receipt, read наблюдает выполнение.
Oracle callbacks проходят через обычный peer.call без повторов или новых grants.
См. [назначенное нативное исполнение](../README.md#назначенное-нативное-исполнение)
и [проверки с настоящими Bun children](../spec/repl.spec.ts).
*/
export function createNativeReplOracle(options: {assignment: NativeReplAssignment; admitted?: () => boolean}) {
  const {assignment} = options
  if (assignment.token.length < 24 || !isAbsolute(assignment.cwd)) throw new Error("Invalid native REPL assignment")
  const incarnation = crypto.randomUUID()
  const sessions = new Map<string, Session>(), opens = new Map<string, Promise<ReplSession>>()
  let closed = false, peer: OracleRpcPeer
  const local = createLocalOracleChannelPair(REPL_CHANNEL, () => peer.methods())
  peer = new OracleRpcPeer(local.peer)
  const redact = (text: string) => text.split(assignment.token).join("[REDACTED]")
  const snapshot = <T>(value: T): T => {
    const clean = (item: unknown): unknown => typeof item === "string" ? redact(item) : Array.isArray(item) ? item.map(clean)
      : record(item) ? Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, clean(entry)])) : item
    return clean(value) as T
  }
  const jobView = (job: ReplJob): ReplJob => ({...job, code: job.code.slice(0, 16384), codeTruncated: job.code.length > 16384,
    result: job.result && job.result.length > 65536 ? `${job.result.slice(0, 65536)}\n[output truncated]` : job.result,
    error: job.error && job.error.length > 65536 ? `${job.error.slice(0, 65536)}\n[output truncated]` : job.error})
  const authorize = (input: unknown, required: string[], optional: string[] = []) => {
    if (closed || options.admitted?.() === false) throw new Error("Native REPL is not admitted")
    if (!record(input) || Object.keys(input).some(key => !["token", ...required, ...optional].includes(key)) || required.some(key => !(key in input))) throw new Error("Invalid native REPL request")
    if (typeof input.token !== "string" || Buffer.byteLength(input.token) !== Buffer.byteLength(assignment.token) || !timingSafeEqual(Buffer.from(input.token), Buffer.from(assignment.token))) throw new Error("Native REPL capability is required")
    return input
  }
  const target = (input: Record<string, unknown>) => {
    if (input.incarnation !== incarnation || typeof input.sessionId !== "string" || !sessions.has(input.sessionId)) throw new Error("Native REPL session incarnation is unavailable; never replay automatically")
    return sessions.get(input.sessionId)!
  }
  const kill = (session: Session) => {
    // detached создаёт новую process group: завершаем только собственное дерево.
    try {process.kill(-session.child.pid, "SIGKILL")} catch {try {session.child.kill("SIGKILL")} catch {}}
  }
  const finishSession = (session: Session, reason: string) => {
    if (session.view.state === "closed") return
    session.view.state = "closed"; session.view.closedAt = Date.now(); session.view.reason = reason
    clearTimeout(session.timer)
    if (session.active) {session.active.state = "uncertain"; session.active.finishedAt = Date.now(); session.active.error = reason; session.active = null}
    for (const job of session.queue.splice(0)) {job.state = "cancelled"; job.finishedAt = Date.now(); job.error = reason}
    kill(session)
  }
  const log = (session: Session, stream: ReplLog["stream"], text: string) => {
    for (let offset = 0; offset < text.length; offset += 8192) {
      const item: ReplLog = {sequence: ++session.sequence, at: Date.now(), jobId: session.active?.id ?? null, stream, text: text.slice(offset, offset + 8192)}
      session.logs.push(item); session.logBytes += Buffer.byteLength(item.text)
      while (session.logs.length > 512 || session.logBytes > 128 * 1024) {const removed = session.logs.shift()!; session.logBytes -= Buffer.byteLength(removed.text); session.droppedThrough = removed.sequence}
    }
  }
  const consume = async (session: Session, stream: ReplLog["stream"], source: ReadableStream<Uint8Array>) => {
    const reader = source.getReader(), decoder = new TextDecoder()
    let pending = ""
    try {
      while (true) {
        const item = await reader.read()
        if (item.done) break
        pending += decoder.decode(item.value, {stream: true})
        // Удерживаем хвост, чтобы токен, разделённый pipe chunks, не утёк.
        pending = redact(pending)
        let held = 0
        for (let length = Math.min(pending.length, assignment.token.length - 1); length > 0; length--) {
          if (pending.endsWith(assignment.token.slice(0, length))) {held = length; break}
        }
        const cut = pending.length - held
        if (cut) {log(session, stream, pending.slice(0, cut)); pending = pending.slice(cut)}
      }
    } finally {pending += decoder.decode(); if (pending) log(session, stream, redact(pending)); reader.releaseLock()}
  }
  const dispatch = (session: Session) => {
    if (session.view.state !== "ready" || session.active || !session.queue.length) return
    const job = session.queue.shift()!
    session.active = job; job.state = "running"; job.startedAt = Date.now()
    if (job.timeoutMs !== null) session.timer = setTimeout(() => finishSession(session, "Explicit command deadline exceeded; outcome is uncertain"), job.timeoutMs)
    try {session.child.send({kind: "evaluate", id: job.id, code: job.code})}
    catch {finishSession(session, "Native REPL delivery failed; outcome is uncertain")}
  }
  const capabilities = (input: unknown): ReplCapabilities => {
    authorize(input, [])
    return {schema: "cosmos/repl-capabilities/v1", version: 1, available: true, execution: "native-bun-process", heapPersistence: "session-process-only", historyPersistence: "server-incarnation-only", automaticReplay: false, defaultTimeoutMs: null}
  }
  const openSession = async (input: unknown): Promise<ReplSession> => {
    const value = authorize(input, ["requestId"])
    if (!id(value.requestId)) throw new Error("Invalid native REPL open requestId")
    const existing = opens.get(value.requestId)
    if (existing) return snapshot(await existing)
    if (sessions.size >= 16) throw new Error("Native REPL session capacity exceeded")
    const promise = (async () => {
      const sessionId = crypto.randomUUID()
      let ready!: () => void, failed!: (reason: Error) => void
      const readiness = new Promise<void>((resolve, reject) => {ready = resolve; failed = reject})
      void readiness.catch(() => {})
      let session: Session
      const environment = {...Bun.env}
      delete environment.ORACLE_REPL_CONFIG
      const child = Bun.spawn([process.execPath, "--eval", workerSource as string], {cwd: assignment.cwd, env: environment, detached: true, stdin: "ignore", stdout: "pipe", stderr: "pipe",
        ipc(message: unknown) {
          if (!record(message) || !session || session.view.state === "closed") return
          if (message.kind === "ready") {session.view.state = "ready"; ready(); dispatch(session)}
          else if (message.kind === "finished" && session.active?.id === message.id) {
            const job = session.active!; clearTimeout(session.timer)
            job.state = message.error ? "failed" : "completed"; job.finishedAt = Date.now(); job.result = typeof message.result === "string" ? message.result : null; job.error = typeof message.error === "string" ? message.error : null
            if (typeof message.cwd === "string") session.view.cwd = message.cwd
            session.active = null; dispatch(session)
          } else if (message.kind === "oracle-call" && typeof message.id === "string" && typeof message.target === "string" && typeof message.method === "string") {
            void Promise.resolve().then(() => peer.call(message.target as string, message.method as string, message.params)).then(
              result => {if (session.view.state !== "closed") child.send({kind: "oracle-result", id: message.id, ok: true, value: result})},
              error => {if (session.view.state !== "closed") child.send({kind: "oracle-result", id: message.id, ok: false, error: redact(error instanceof Error ? error.message : String(error))})},
            ).catch(() => {})
          }
        },
        onExit() {if (!session) return; finishSession(session, "Native REPL process exited; outcome may be uncertain"); failed(new Error("Native REPL exited before readiness"))},
      })
      session = {view: {sessionId, incarnation, state: "starting", cwd: assignment.cwd, pid: child.pid, openedAt: Date.now(), closedAt: null, reason: null}, child, jobs: new Map(), queue: [], active: null, logs: [], sequence: 0, droppedThrough: 0, logBytes: 0, ready: readiness, drained: []}
      sessions.set(sessionId, session)
      session.drained.push(consume(session, "stdout", child.stdout), consume(session, "stderr", child.stderr))
      await readiness
      return session.view
    })()
    opens.set(value.requestId, promise)
    return snapshot(await promise)
  }
  const evaluate = (input: unknown): ReplJobReceipt => {
    const value = authorize(input, ["sessionId", "incarnation", "requestId", "code"], ["timeoutMs"]), session = target(value)
    if (!id(value.requestId) || typeof value.code !== "string" || Buffer.byteLength(value.code) > 512 * 1024 || value.timeoutMs !== undefined && !integer(value.timeoutMs, 1, 2147483647)) throw new Error("Invalid native REPL evaluation")
    const codeHash = createHash("sha256").update(value.code).digest("hex"), prior = session.jobs.get(value.requestId)
    if (prior && prior.codeHash !== codeHash) throw new Error("Native REPL requestId already binds different code")
    if (!prior && (session.view.state !== "ready" || session.jobs.size >= 2048 || session.queue.length >= 256)) throw new Error("Native REPL session is closed or command capacity exceeded")
    const job: ReplJob = prior ?? {id: crypto.randomUUID(), requestId: value.requestId, codeHash, code: value.code, state: "queued", admittedAt: Date.now(), startedAt: null, finishedAt: null, timeoutMs: typeof value.timeoutMs === "number" ? value.timeoutMs : null, result: null, error: null}
    if (!prior) {session.jobs.set(value.requestId, job); session.queue.push(job); dispatch(session)}
    return snapshot({schema: "cosmos/repl-job/v1", version: 1, sessionId: session.view.sessionId, incarnation, job: jobView(job)})
  }
  const read = (input: unknown): ReplReadReceipt => {
    const value = authorize(input, ["sessionId", "incarnation", "cursor"], ["limit", "jobId"]), session = target(value)
    if (!integer(value.cursor, 0, Number.MAX_SAFE_INTEGER) || value.cursor > session.sequence || value.limit !== undefined && !integer(value.limit, 1, 512) || value.jobId !== undefined && !id(value.jobId)) throw new Error("Invalid native REPL read cursor, jobId or limit")
    const logs = session.logs.filter(item => item.sequence > (value.cursor as number)).slice(0, typeof value.limit === "number" ? value.limit : 128)
    const all = [...session.jobs.values()], jobs = typeof value.jobId === "string" ? all.filter(job => job.id === value.jobId) : all.slice(-32)
    return snapshot({schema: "cosmos/repl-read/v1", version: 1, session: session.view, jobs: jobs.map(jobView), jobsTotal: all.length, jobsTruncated: jobs.length < all.length,
      logs, cursor: logs.at(-1)?.sequence ?? Math.max(value.cursor, session.droppedThrough), droppedThrough: session.droppedThrough})
  }
  const closeSession = async (input: unknown): Promise<ReplSession> => {
    const session = target(authorize(input, ["sessionId", "incarnation"]))
    finishSession(session, "Native REPL session closed; in-flight outcome may be uncertain")
    await session.child.exited; await Promise.allSettled(session.drained)
    return snapshot(session.view)
  }
  peer.expose(REPL_METHODS[0], capabilities); peer.expose(REPL_METHODS[1], openSession); peer.expose(REPL_METHODS[2], evaluate); peer.expose(REPL_METHODS[3], read); peer.expose(REPL_METHODS[4], closeSession)
  let closing: Promise<void> | undefined
  return {channel: local.router, capabilities, open: openSession, evaluate, read, closeSession,
    close() {return closing ??= (async () => {closed = true; for (const session of sessions.values()) finishSession(session, "Release REPL incarnation closed; in-flight outcome may be uncertain"); await Promise.allSettled([...sessions.values()].flatMap(session => [session.child.exited, ...session.drained])); peer.close(); await local.peer.close(); await local.router.close()})()},
  }
}

/** Подключает нативное назначение к существующему Oracle router выпуска. */
export async function configuredNativeReplOracle(environment: Readonly<Record<string, string | undefined>>, admitted: () => boolean) {
  const assignment = await readNativeReplAssignment(environment)
  return assignment ? createNativeReplOracle({assignment, admitted}) : null
}
