import {expect, test} from "bun:test"
import {mkdtemp, rm, chmod, symlink, writeFile} from "node:fs/promises"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {OracleRpcPeer} from "shared/transport/oracle"
import {OracleRouter} from "../../../quantum/dark/oracle/router"
import {createLocalOracleChannelPair} from "../../../quantum/dark/oracle/local"
import {configuredNativeReplOracle, createNativeReplOracle, readNativeReplAssignment} from "../server/repl"
import {REPL_CHANNEL, REPL_METHODS, type ReplJob, type ReplJobReceipt, type ReplSession} from "../shared/repl"

const token = "native-repl-test-capability-0123456789"
const auth = {token}
const target = (session: ReplSession) => ({token, sessionId: session.sessionId, incarnation: session.incarnation})
const pause = () => Bun.sleep(5)
async function until<T>(get: () => T | Promise<T>, done: (value: T) => boolean, timeout = 4000): Promise<T> {
  const end = Date.now() + timeout
  while (true) {const result = await get(); if (done(result)) return result; if (Date.now() > end) throw new Error("Test observation deadline exceeded"); await pause()}
}
async function finish(service: ReturnType<typeof createNativeReplOracle>, session: ReplSession, requestId: string): Promise<ReplJob> {
  return await until(() => service.read({...target(session), cursor: 0}).jobs.find(job => job.requestId === requestId)!, job => !["running", "queued"].includes(job.state))
}

test("native Bun preserves heap, imports, top-level await, filesystem, process spawn and ordinary Oracle callback", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cosmos-native-repl-"))
  const service = createNativeReplOracle({assignment: {token, cwd}})
  const browser = createLocalOracleChannelPair("fixture-browser", () => []), browserPeer = new OracleRpcPeer(browser.peer)
  const domain = createLocalOracleChannelPair("fixture-domain", () => ["echo", "canonicalWrite"]), domainPeer = new OracleRpcPeer(domain.peer)
  domainPeer.expose("echo", (params, context) => ({params, source: context.source}))
  domainPeer.expose("canonicalWrite", (_params, context) => {if (context.source !== "energy") throw new Error("Existing canonical grant requires Energy"); return true})
  const router = new OracleRouter()
  for (const channel of [service.channel, browser.router, domain.router]) router.attach(channel)
  const call = <T>(method: string, params: unknown) => browserPeer.call<T>(REPL_CHANNEL, method, params)
  try {
    expect(router.channels().find(channel => channel.identity === REPL_CHANNEL)?.methods).toEqual([...REPL_METHODS].sort())
    await expect(call(REPL_METHODS[1], {requestId: "anonymous"})).rejects.toThrow("capability")
    const session = await call<ReplSession>(REPL_METHODS[1], {...auth, requestId: "open"})
    expect(session.pid).not.toBe(process.pid)
    expect(session.cwd).toBe(cwd)
    expect(await call<ReplSession>(REPL_METHODS[1], {...auth, requestId: "open"})).toEqual(session)
    const code = 'var fs = await import("node:fs/promises"); var total = 40; await fs.writeFile("owned.txt", "native"); console.log("native-output"); total += 2; total'
    const admitted = await call<ReplJobReceipt>(REPL_METHODS[2], {...target(session), requestId: "native", code})
    expect(admitted.job.state).toBe("running")
    expect((await finish(service, session, "native")).result).toBe("42")
    const duplicate = await call<ReplJobReceipt>(REPL_METHODS[2], {...target(session), requestId: "native", code})
    expect(duplicate.job.id).toBe(admitted.job.id)
    await expect(call(REPL_METHODS[2], {...target(session), requestId: "native", code: "total = 99"})).rejects.toThrow("different code")
    service.evaluate({...target(session), requestId: "read-native", code: `var child = Bun.spawn([process.execPath, "-e", ${JSON.stringify('process.stdout.write("spawned")')}], {stdout:"pipe"}); [await fs.readFile("owned.txt","utf8"), total, await new Response(child.stdout).text(), await child.exited, (await fs.readdir("/")).length > 0]`})
    const native = await finish(service, session, "read-native")
    expect(native.error).toBe(null)
    expect(native.result).toBe("[ 'native', 42, 'spawned', 0, true ]")
    service.evaluate({...target(session), requestId: "oracle", code: 'await oracle.call("fixture-domain", "echo", {answer:total})'})
    const oracle = await finish(service, session, "oracle")
    expect(oracle.state).toBe("completed"); expect(oracle.result).toContain("cosmos-repl"); expect(oracle.result).toContain("42")
    service.evaluate({...target(session), requestId: "denied", code: 'await oracle.call("fixture-domain", "canonicalWrite", {})'})
    expect((await finish(service, session, "denied")).error).toContain("canonical grant")
    const logs = await until(() => service.read({...target(session), cursor: 0}), receipt => receipt.logs.some(log => log.text.includes("native-output")))
    expect(logs.jobs).toHaveLength(4)
    service.evaluate({...target(session), requestId: "sync-error", code: 'throw new Error("sync failure")'})
    expect((await finish(service, session, "sync-error")).error).toContain("sync failure")
    service.evaluate({...target(session), requestId: "syntax-error", code: 'var = ;'})
    expect((await finish(service, session, "syntax-error")).state).toBe("failed")
    for (const [index, code] of ['throw null', 'throw false', 'await Promise.reject(null)', 'await Promise.reject(false)'].entries()) {
      const requestId = `falsy-${index}`
      service.evaluate({...target(session), requestId, code})
      const failed = await finish(service, session, requestId)
      expect(failed.state).toBe("failed"); expect(failed.error).not.toBe(null)
    }
    service.evaluate({...target(session), requestId: "after-error", code: "total"})
    for (const [index, code] of ['await oracle.call("readGraph", {})', 'await oracle.call(null, "readGraph", {})'].entries()) {
      const requestId = `invalid-oracle-${index}`
      service.evaluate({...target(session), requestId, code})
      const invalid = await finish(service, session, requestId)
      expect(invalid.state).toBe("failed")
      expect(invalid.error).toContain("oracle.call requires (target, method, params)")
    }
    expect((await finish(service, session, "after-error")).result).toBe("42")
    const closed = await service.closeSession(target(session))
    expect(closed.state).toBe("closed")
    expect(await call(REPL_METHODS[1], {...auth, requestId: "open"})).toMatchObject({sessionId: session.sessionId, state: "closed"})
    expect(() => process.kill(session.pid, 0)).toThrow()
  } finally {browserPeer.close(); domainPeer.close(); await service.close(); await browser.peer.close(); await domain.peer.close(); await rm(cwd, {recursive: true, force: true})}
})

test("serialized admission does not replay, applies only explicit timeout, and closes owned child group", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cosmos-native-repl-"))
  const service = createNativeReplOracle({assignment: {token, cwd}})
  try {
    const session = await service.open({...auth, requestId: "open"})
    service.evaluate({...target(session), requestId: "a", code: 'var sequence = []; await Bun.sleep(60); sequence.push("a"); sequence'})
    const b = service.evaluate({...target(session), requestId: "b", code: 'sequence.push("b"); sequence'})
    expect(b.job.state).toBe("queued"); expect(b.job.timeoutMs).toBe(null)
    expect((await finish(service, session, "b")).result).toBe("[ 'a', 'b' ]")
    service.evaluate({...target(session), requestId: "child", code: 'var owned = Bun.spawn([process.execPath,"-e","setInterval(()=>{},1000)"],{stdout:"inherit",stderr:"inherit"}); owned.pid'})
    const childPid = Number((await finish(service, session, "child")).result)
    expect(childPid).toBeGreaterThan(0); process.kill(childPid, 0)
    service.evaluate({...target(session), requestId: "timeout", code: 'await Bun.sleep(10000)', timeoutMs: 25})
    service.evaluate({...target(session), requestId: "never", code: 'await Bun.write("never.txt", "bad")'})
    expect((await finish(service, session, "timeout")).state).toBe("uncertain")
    expect((await finish(service, session, "never")).state).toBe("cancelled")
    await service.closeSession(target(session))
    expect(() => process.kill(childPid, 0)).toThrow()
    expect(await Bun.file(join(cwd, "never.txt")).exists()).toBe(false)
  } finally {await service.close(); await rm(cwd, {recursive: true, force: true})}
})

test("crash retains uncertain record, cancels queued work and rejects session from another incarnation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cosmos-native-repl-"))
  const service = createNativeReplOracle({assignment: {token, cwd}}), replacement = createNativeReplOracle({assignment: {token, cwd}})
  try {
    const session = await service.open({...auth, requestId: "open"})
    const code = "process.exit(7)"
    const first = service.evaluate({...target(session), requestId: "crash", code})
    service.evaluate({...target(session), requestId: "queued", code: 'await Bun.write("must-not-exist", "x")'})
    expect((await finish(service, session, "crash")).state).toBe("uncertain")
    expect((await finish(service, session, "queued")).state).toBe("cancelled")
    expect(service.evaluate({...target(session), requestId: "crash", code}).job.id).toBe(first.job.id)
    expect(() => replacement.evaluate({...target(session), requestId: "crash", code})).toThrow("incarnation")
    expect(await Bun.file(join(cwd, "must-not-exist")).exists()).toBe(false)
  } finally {await service.close(); await replacement.close(); await rm(cwd, {recursive: true, force: true})}
})

test("private assignment fails closed and disabled is not an anonymous capability", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cosmos-repl-config-")), config = join(cwd, "private.json")
  try {
    expect(await configuredNativeReplOracle({}, () => true)).toBe(null)
    await writeFile(config, JSON.stringify({token, cwd}), {mode: 0o600})
    expect(await readNativeReplAssignment({ORACLE_REPL_CONFIG: config})).toEqual({token, cwd})
    await symlink(config, join(cwd, "link"))
    await expect(readNativeReplAssignment({ORACLE_REPL_CONFIG: join(cwd, "link")})).rejects.toThrow()
    await chmod(config, 0o644)
    await expect(readNativeReplAssignment({ORACLE_REPL_CONFIG: config})).rejects.toThrow("private host configuration")
    await chmod(config, 0o600)
    await writeFile(config, JSON.stringify({token: "short", cwd}))
    await expect(readNativeReplAssignment({ORACLE_REPL_CONFIG: config})).rejects.toThrow("Invalid native REPL assignment")
  } finally {await rm(cwd, {recursive: true, force: true})}
})

test("bounded logs expose drop cursor, redact split secrets and fail admission after revocation", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "cosmos-repl-logs-"))
  let admitted = true
  const service = createNativeReplOracle({assignment: {token, cwd}, admitted: () => admitted})
  try {
    const session = await service.open({...auth, requestId: "open"})
    service.evaluate({...target(session), requestId: "secret", code: `console.log(${JSON.stringify(token)}); process.stdout.write(${JSON.stringify(token.slice(0, 12))}); await Bun.sleep(20); process.stdout.write(${JSON.stringify(token.slice(12))}); "done"`})
    await finish(service, session, "secret")
    const secret = await until(() => service.read({...target(session), cursor: 0}), receipt => receipt.logs.map(log => log.text).join("").split("[REDACTED]").length >= 3)
    expect(JSON.stringify(secret)).not.toContain(token)
    service.evaluate({...target(session), requestId: "flood", code: 'console.log("x".repeat(300000)); "done"'})
    await finish(service, session, "flood")
    const receipt = await until(() => service.read({...target(session), cursor: 0, limit: 1}), receipt => receipt.droppedThrough > 0)
    expect(receipt.logs).toHaveLength(1); expect(receipt.cursor).toBe(receipt.logs[0]!.sequence)
    expect(service.read({...target(session), cursor: receipt.cursor, limit: 1}).cursor).toBeGreaterThan(receipt.cursor)
    const first = receipt.jobs[0]!
    for (let index = 0; index < 35; index++) service.evaluate({...target(session), requestId: `bounded-${index}`, code: "1"})
    await finish(service, session, "bounded-34")
    expect(service.read({...target(session), cursor: receipt.cursor}).jobs).toHaveLength(32)
    expect(service.read({...target(session), cursor: receipt.cursor}).jobsTruncated).toBe(true)
    expect(service.read({...target(session), cursor: receipt.cursor, jobId: first.id}).jobs).toHaveLength(1)
    admitted = false
    expect(() => service.read({...target(session), cursor: 0})).toThrow("not admitted")
  } finally {await service.close(); await rm(cwd, {recursive: true, force: true})}
})
