import {parseMetaAddress, type Graph, type RuntimeAtom} from "@metafor/types/metafor/graph"
import type {OracleWorldIdentity} from "@metafor/types/metafor/peer-oracle"
import {PROFILE_READ_METHOD, PROFILE_INTENT_METHOD, PROFILE_RECONFIGURE_INPUT_PREFIX, validProfileTemplateReference, type ProfileIntentRequest, type ProfileTargetDescriptor, type ProfileIntentReceipt, type ProfileCatalogReceipt} from "@metafor/types/metafor/profile-intent"
import type {OracleRpcPeer} from "shared/transport/oracle"

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value) && Object.keys(value).sort().join(",") === keys.sort().join(",")
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value)

/** Closed user intent; no caller-selected Field, native path or command is accepted. */
export function parseProfileIntent(value: unknown): ProfileIntentRequest {
  if (!object(value) || !exact(value, value.operation === "profile.reconfigure" ? ["id", "operation", "target", "expectedProfile", "templatePath"] : ["id", "operation", "target", "expectedProfile"]) || !text(value.id) ||
      value.operation !== "profile.open" && value.operation !== "profile.save" && value.operation !== "profile.reconfigure" ||
      value.operation === "profile.reconfigure" && (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value.id) || !validProfileTemplateReference(value.templatePath)) ||
      !exact(value.target, ["worldIdentity", "atomRef"]) || typeof value.target.atomRef !== "string" || !/^atom:[1-9][0-9]*$/.test(value.target.atomRef) ||
      !exact(value.target.worldIdentity, ["peerId", "root", "cutId"]) || !text(value.target.worldIdentity.peerId) || !text(value.target.worldIdentity.cutId) ||
      typeof value.target.worldIdentity.root !== "string" || !parseMetaAddress(value.target.worldIdentity.root) ||
      !exact(value.expectedProfile, ["name", "saveId"]) || !text(value.expectedProfile.name) || value.expectedProfile.saveId !== null && !text(value.expectedProfile.saveId)) throw new Error("Invalid closed profile intent")
  return structuredClone(value) as unknown as ProfileIntentRequest
}

/** Owning device roots advertise only declared actions; Capsule save also requires its running exact instance. */
export function profileTargets(graph: Graph, worldIdentity: OracleWorldIdentity): ProfileTargetDescriptor[] {
  if (graph.root !== worldIdentity.root) throw new Error("Profile world identity changed")
  return graph.runtime.roots.flatMap(node => {
    if (node.kind !== "atom" || !["intel-macos-chrome-studio", "workspace-capsule"].includes(node.meta) || node.meta !== graph.root || typeof node.values.profileName !== "string" || !text(node.values.profileName)) return []
    const template = graph.template[node.meta]
    if (!["input", "profileName", "saveId"].every(key => template?.fields.some(field => field.key === key && field.type === "string"))) return []
    const ready = template?.superposition.find(state => state.name === "ready")
    const supportedOperations: ProfileTargetDescriptor["supportedOperations"] = []
    for (const [state, operation, input] of [["opening", "profile.open", "open"], ["saving", "profile.save", "save"]] as const) {
      const wave = ready?.transitions?.[state]
      if (object(wave) && object(wave.input) && Reflect.get(wave.input, "eq") === input) {
        if (node.meta === "workspace-capsule" && operation === "profile.save" && (node.values.capsuleStatus !== "running" || typeof node.values.instanceId !== "string" || !text(node.values.instanceId))) continue
        supportedOperations.push(operation)
      }
    }
    const reconfiguration = ready?.transitions?.reconfiguring
    if (node.meta === "workspace-capsule" && node.values.capsuleStatus === "running" && text(node.values.instanceId)
      && template?.fields.some(field => field.key === "reconfigureTemplatePath" && field.type === "string")
      && object(reconfiguration) && object(reconfiguration.input) && Reflect.get(reconfiguration.input, "startsWith") === PROFILE_RECONFIGURE_INPUT_PREFIX) supportedOperations.push("profile.reconfigure")
    const saveId = node.values.saveId
    if (saveId !== null && saveId !== undefined && !text(saveId)) return []
    return [{worldIdentity, atomRef: node.ref, meta: node.meta, expectedProfile: {name: node.values.profileName, saveId: saveId ?? null},
      supportedOperations, state: node.state ?? "unknown", available: node.state === "ready" && (node.values.input === null || node.values.input === undefined)}]
  })
}

/** Resolve against current ordinary Graph; expected frontier protects the subsequent Field admission. */
export function resolveProfileTarget(graph: Graph, world: OracleWorldIdentity, request: ProfileIntentRequest): RuntimeAtom {
  const target = profileTargets(graph, world).find(target => target.atomRef === request.target.atomRef)
  if (!target || JSON.stringify(request.target.worldIdentity) !== JSON.stringify(world)) throw new Error("Profile target world or Atom scope changed")
  if (!target.supportedOperations.includes(request.operation)) throw new Error("Profile operation is unsupported by the owning Meta")
  if (!target.available) throw new Error("Profile owner is busy or unavailable")
  if (target.expectedProfile.name !== request.expectedProfile.name || target.expectedProfile.saveId !== request.expectedProfile.saveId) throw new Error("Assigned profile changed")
  const atom = graph.runtime.roots.find(node => node.kind === "atom" && node.ref === target.atomRef)
  if (!atom || atom.kind !== "atom") throw new Error("Profile owner is absent")
  return atom
}

/** Register before the Energy channel opens; absent native assignment remains unavailable. */
export function installProfileOracle(peer: Pick<OracleRpcPeer, "expose">, service: () => {readProfiles(): Promise<ProfileCatalogReceipt>, profileIntent(value: unknown): Promise<ProfileIntentReceipt>} | undefined) {
  peer.expose(PROFILE_READ_METHOD, async params => {
    if (!exact(params, [])) throw new Error("Profile read requires empty arguments")
    const current = service()
    if (!current) throw new Error("Profile Oracle is unavailable")
    return await current.readProfiles()
  })
  peer.expose(PROFILE_INTENT_METHOD, async params => {
    const current = service()
    if (!current) throw new Error("Profile Oracle is unavailable")
    return await current.profileIntent(params)
  })
}
