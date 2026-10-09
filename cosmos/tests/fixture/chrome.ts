import {join} from "node:path"
import {rm} from "node:fs/promises"
import type {Protocol} from "devtools-protocol"
import {CdpConnection, type CdpSession} from "./cdp"

export interface ChromeFixture {
  connection: CdpConnection
  cdp: CdpSession
  targets: Map<string, Protocol.Target.TargetInfo>
  workers: Map<string, WorkerTarget>
  workerListeners: Set<(worker: WorkerTarget) => void>
  pages: ChromePage[]
  close(): Promise<void>
}

export interface WorkerTarget {
  info: Protocol.Target.TargetInfo
  session: CdpSession
}

export interface ChromePage {
  session: CdpSession
  targetId: string
  frameId: string
  url: string
  responses: Map<string, Protocol.Network.Response>
}

/** One temporary profile/process per fixture; no connection to the managed development Chrome. */
export async function launchChrome(executable: string, profile: string): Promise<ChromeFixture> {
  await rm(join(profile, "DevToolsActivePort"), {force: true})
  let stderr = ""
  const process = Bun.spawn([
    executable, "--headless=new", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--window-size=800,600", "about:blank",
  ], {stdout: "ignore", stderr: "pipe"})
  const stderrReader = process.stderr.getReader()
  const decoder = new TextDecoder()
  const output = (async () => {
    try {
      while (true) {
        const {done, value} = await stderrReader.read()
        if (done) break
        stderr = (stderr + decoder.decode(value, {stream: true})).slice(-32_768)
      }
    } finally {
      stderrReader.releaseLock()
    }
  })()
  const stopOutput = async () => {
    // После выхода этого Chrome другой процесс может ещё держать write-end pipe.
    // Завершаем собственное чтение, не ожидая выхода соседнего профиля.
    await stderrReader.cancel().catch(() => {})
    await output
  }
  let connection: CdpConnection | undefined
  try {
    let endpoint = ""
    for (let attempt = 0; attempt < 600; attempt++) {
      if (process.exitCode !== null) throw new Error(`Fixture Chrome exited: ${stderr}`)
      const announced = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/\S+)/)?.[1]
      if (announced) { endpoint = announced; break }
      const value = await Bun.file(join(profile, "DevToolsActivePort")).text().catch(() => "")
      const [port, path] = value.trim().split("\n")
      if (port && path) { endpoint = `ws://127.0.0.1:${port}${path}`; break }
      await Bun.sleep(50)
    }
    if (!endpoint) throw new Error(`Fixture Chrome CDP did not start: ${stderr}`)
    connection = await CdpConnection.connect(endpoint)
    const cdp = connection.session()
    const fixture: ChromeFixture = {
      connection, cdp, targets: new Map(), workers: new Map(), workerListeners: new Set(), pages: [],
      async close() {
        if (process.exitCode === null) {
          await cdp.send("Browser.close").catch(() => {})
          await Promise.race([process.exited, Bun.sleep(3_000)])
          if (process.exitCode === null) process.kill("SIGKILL")
        }
        await process.exited
        connection!.close()
        await stopOutput()
      },
    }
    cdp.on("Target.targetCreated", ({targetInfo}) => fixture.targets.set(targetInfo.targetId, targetInfo))
    cdp.on("Target.targetInfoChanged", ({targetInfo}) => {
      fixture.targets.set(targetInfo.targetId, targetInfo)
      const worker = fixture.workers.get(targetInfo.targetId)
      if (worker) {
        worker.info = targetInfo
        for (const listener of fixture.workerListeners) listener(worker)
      }
    })
    cdp.on("Target.targetDestroyed", ({targetId}) => {
      fixture.targets.delete(targetId)
      fixture.workers.delete(targetId)
    })
    cdp.on("Target.attachedToTarget", event => {
      if (event.targetInfo.type !== "service_worker") return
      const worker = {info: event.targetInfo, session: connection!.session(event.sessionId)}
      fixture.workers.set(event.targetInfo.targetId, worker)
      for (const listener of fixture.workerListeners) listener(worker)
      void worker.session.send("Runtime.enable")
        .then(() => worker.session.send("Runtime.runIfWaitingForDebugger"))
        .catch(() => {})
    })
    await cdp.send("Target.setDiscoverTargets", {discover: true})
    await cdp.send("Target.setAutoAttach", {autoAttach: true, waitForDebuggerOnStart: true, flatten: true,
      filter: [{type: "service_worker", exclude: false}, {exclude: true}]})
    return fixture
  } catch (error) {
    connection?.close()
    if (process.exitCode === null) process.kill("SIGKILL")
    await process.exited
    await stopOutput()
    throw error
  }
}

export async function openPage(browser: ChromeFixture): Promise<ChromePage> {
  const {targetId} = await browser.cdp.send("Target.createTarget", {url: "about:blank"})
  const {sessionId} = await browser.cdp.send("Target.attachToTarget", {targetId, flatten: true})
  const session = browser.connection.session(sessionId)
  const page: ChromePage = {session, targetId, frameId: "", url: "about:blank", responses: new Map()}
  browser.pages.push(page)
  session.on("Page.frameNavigated", ({frame}) => {
    if (frame.parentId) return
    page.frameId = frame.id
    page.url = frame.url
  })
  session.on("Network.responseReceived", event => {
    if (event.type === "Document") page.responses.set(event.loaderId, event.response)
  })
  await session.send("Page.enable")
  await session.send("Network.enable")
  await session.send("Runtime.enable")
  await session.send("Page.setLifecycleEventsEnabled", {enabled: true})
  page.frameId = (await session.send("Page.getFrameTree")).frameTree.frame.id
  return page
}

/** Waits for the next main-frame load and its matching Document response, including SW responses. */
export function waitForNavigation(page: ChromePage, timeout = 30_000) {
  const promise = new Promise<Protocol.Network.Response>((resolve, reject) => {
    let loader = ""
    const cleanup = () => { clearTimeout(timer); offNavigation(); offLoad(); offClose() }
    const timer = setTimeout(() => { cleanup(); reject(new Error("Fixture navigation timed out")) }, timeout)
    const offNavigation = page.session.on("Page.frameNavigated", ({frame}) => {
      if (!frame.parentId) loader = frame.loaderId
    })
    const offLoad = page.session.on("Page.lifecycleEvent", event => {
      if (!loader || event.loaderId !== loader || event.frameId !== page.frameId || event.name !== "load") return
      const response = page.responses.get(loader)
      cleanup()
      if (!response) reject(new Error("Fixture navigation has no Document response"))
      else resolve(response)
    })
    const offClose = page.session.connection.onClose(() => {
      cleanup()
      reject(new Error("CDP connection closed during navigation"))
    })
  })
  void promise.catch(() => {})
  return promise
}

export async function navigate(page: ChromePage, url: string) {
  const loaded = waitForNavigation(page)
  const result = await page.session.send("Page.navigate", {url})
  if (result.errorText) throw new Error(`Fixture navigation failed: ${result.errorText}`)
  return await loaded
}

export function observeDiagnostics(session: CdpSession, diagnostics: string[], prefix: string) {
  session.on("Runtime.consoleAPICalled", event => diagnostics.push(
    `${prefix}:${event.type}:${event.args.map(value => value.value ?? value.description ?? value.type).join(" ")}`,
  ))
  session.on("Runtime.exceptionThrown", ({exceptionDetails}) => diagnostics.push(
    `${prefix}-error:${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
  ))
}

export function observeNavigation(page: ChromePage, listener: () => void) {
  return page.session.on("Page.frameNavigated", ({frame}) => { if (!frame.parentId) listener() })
}
