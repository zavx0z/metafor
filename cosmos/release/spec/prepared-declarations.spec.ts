import {expect, test} from "bun:test"
import {mkdtemp, rm} from "node:fs/promises"
import {join} from "node:path"
import {tmpdir} from "node:os"
import type {MetaDSL} from "@metafor/types/metafor/schema"

test("compiled explicit activation retains Agent identity, Field value and Chat Mass across old-to-new and restore", async () => {
  const directory = await mkdtemp(join(tmpdir(), "metafor-prepared-activation-")), executable = join(directory, "fixture.mjs")
  const persist = 'async ({mass}) => {await mass.session.write({proof:"retained native history"}); return true}'
  const old: Record<string, MetaDSL> = {
    "@metafor/agent": {name: "Agent fixture", fields: [{key: "title", type: "string", required: true, default: "initial"}, {key: "status", type: "string", required: true, default: "idle"}],
      superposition: [{name: "idle", transitions: null}], mass: [{key: "task", format: "json"}], processes: [], reactions: [], matter: [{kind: "wimp", src: "@metafor/chat"}]},
    "@metafor/chat": {name: "Chat fixture", fields: [{key: "ready", type: "boolean", required: true, default: false}],
      superposition: [{name: "persisting", transitions: {idle: {ready: {eq: true}}}}, {name: "idle", transitions: null}], mass: [{key: "session", format: "json"}], reactions: [], matter: [],
      processes: [{key: "persisting", declaration: {type: "action", env: ["server"], action: {src: persist, wrapperSrc: persist, read: []}, success: {src: '({update}) => update({ready:true})', read: [], write: ["ready"]}}}]},
  }
  const next = structuredClone(old)
  next["@metafor/agent"]!.fields = [...next["@metafor/agent"]!.fields, {key: "feedbackRequest", type: "string"}]
  next["@metafor/agent"]!.matter!.push({kind: "wimp", src: "@metafor/repl"})
  next["@metafor/chat"]!.fields = [...next["@metafor/chat"]!.fields, {key: "feedbackRequest", type: "string"}, {key: "feedbackSeen", type: "boolean", required: true, default: false}]
  next["@metafor/chat"]!.superposition[1]!.transitions = {"recording-feedback": {feedbackRequest: {null: false}}}
  next["@metafor/chat"]!.superposition = [...next["@metafor/chat"]!.superposition, {name: "recording-feedback", transitions: {idle: {feedbackSeen: {eq: true}}}}]
  const feedback = 'async ({mass,value}) => {const before=await mass.session.readJson(); await mass.session.write({...before,feedback:value.feedbackRequest}); return true}'
  next["@metafor/chat"]!.processes = [...next["@metafor/chat"]!.processes!, {key: "recording-feedback", declaration: {type: "action", env: ["server"], action: {src: feedback, wrapperSrc: feedback, read: ["feedbackRequest"]},
    success: {src: '({update}) => update({feedbackRequest:null,feedbackSeen:true})', read: [], write: ["feedbackRequest", "feedbackSeen"]}}}]
  next["@metafor/repl"] = {name: "New Tool", fields: [], superposition: [{name: "idle", transitions: null}], mass: [{key: "receipt", format: "json"}], processes: [], reactions: [], matter: []}
  await Bun.write(join(directory, "old.json"), JSON.stringify(old)); await Bun.write(join(directory, "next.json"), JSON.stringify(next))
  const built = await Bun.build({entrypoints: [join(import.meta.dir, "fixture/prepared-declarations.ts")], target: "bun", conditions: ["cosmos:server", "internal:server"], loader: {".wgsl": "text"}, external: ["bun-webgpu"]})
  expect(built.success, built.logs.map(String).join("\n")).toBe(true)
  await Bun.write(executable, built.outputs[0]!)
  let child: ReturnType<typeof Bun.spawn> | undefined, retained: any
  try {
    for (let run = 0; run < 2; run++) {
      const ready = Promise.withResolvers<any>(), activated = Promise.withResolvers<any>()
      child = Bun.spawn([process.execPath, executable], {cwd: directory, env: {...Bun.env, PREPARED_FIXTURE_ROOT: directory, METAFOR_WEAK_BACKEND: "cpu", DARK_CHECKPOINT_SIDEBAND: "1", COSMOS_QUANTUM_DOMAIN: undefined,
        METAFOR_META_ARTIFACT_ROOT: undefined, METAFOR_META_ARTIFACT_MAP: undefined, METAFOR_META_ARTIFACT_MAP_FILE: undefined, METAFOR_META_SOURCE_ROOT: undefined,
      }, stdout: "pipe", stderr: "pipe", ipc(message: any) {if (message.kind === "ready") ready.resolve(message); if (message.kind === "activated") activated.resolve(message); if (message.kind === "failed") activated.reject(new Error(message.error))}})
      const process_ = child, stdout = new Response(process_.stdout as ReadableStream).text(), stderr = new Response(process_.stderr as ReadableStream).text()
      const result = await Promise.race([ready.promise, process_.exited.then(async code => {throw new Error(`Fixture exit ${code}: ${await stderr}\n${await stdout}`)}), Bun.sleep(20000).then(() => {throw new Error("Prepared fixture readiness timed out")})])
      if (run === 0) {
        process_.send("activate")
        retained = await Promise.race([activated.promise, Bun.sleep(15000).then(() => {throw new Error("Prepared activation timed out")})])
        expect(retained.receipt.phase as string, String(retained.receipt.error ?? "")).toBe("complete")
        expect(retained.repeat).toEqual(retained.receipt)
        expect(retained.graph.runtime.roots[0].ref).toBe(result.graph.runtime.roots[0].ref)
        expect(retained.graph.runtime.roots[0].values.title).toBe("human retained")
        expect(retained.graph.runtime.roots[0].children[0].ref).toBe(result.graph.runtime.roots[0].children[0].ref)
        expect(retained.mass.content).toEqual(result.mass.content)
        expect(retained.feedbackMass.content.value).toEqual({proof: "retained native history", feedback: "observed annotation"})
        expect(retained.graph.runtime.roots[0].children.some((node: any) => node.meta === "@metafor/repl")).toBe(true)
        expect(retained.rejection).toContain("local identities")
        expect(retained.afterRejection).toEqual(retained.frontier)
      } else {
        expect(result.initialization.mode).toBe("restored"); expect(result.sourceReads).toBe(0)
        expect(result.graph).toEqual(retained.graph)
        expect(result.mass.content).toEqual(retained.feedbackMass.content)
      }
      process_.send("stop")
      await Promise.race([process_.exited, Bun.sleep(8000).then(() => {throw new Error("Prepared fixture cleanup timed out")})])
      expect(process_.exitCode, await stderr).toBe(0)
      child = undefined
      if (run === 0) await rm(join(directory, "old.json"))
    }
  } finally {if (child?.exitCode === null) {child.send("stop"); await Promise.race([child.exited, Bun.sleep(8000)]); if (child.exitCode === null) child.kill("SIGKILL"); await child.exited} await rm(directory, {recursive: true, force: true})}
}, 60000)
