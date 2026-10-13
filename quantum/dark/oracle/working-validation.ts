import {parseMetaAddress, type MetaAddress, type MetaMatterParticle} from "@metafor/types/metafor/graph"
import type {MetaDSL} from "@metafor/types/metafor/schema"
import type {MatterParticle} from "@metafor/types/metafor/matter"
import type {MetaMatterRequest} from "shared/protocol/metafor/authoring"

/**
 * Preflights named Mass aliases in a validated, closed working composition.
 * Partial declaration streams keep Boundary's readiness wait; a closed Oracle
 * add/move must not report applied while silently waiting for an unknown key.
 * Whole bindings preserve matching-key/codec intersection semantics. Remove
 * remains available for repairing a dangling composition.
 * [Owner law](../../../create-metafor/rules/rpc.md#рабочая-версия-и-явная-публикация).
 * [Tests](./working-validation.spec.ts) cover nested owner scope and moves.
 */
export async function validateWorkingMatter(
  request: MetaMatterRequest,
  readCanonical: (address: MetaAddress) => Promise<MetaDSL>,
): Promise<void> {
  if (request.operation === "remove") return
  const snapshots = new Map<MetaAddress, Promise<MetaDSL>>()
  const read = (address: MetaAddress) => {
    let snapshot = snapshots.get(address)
    if (!snapshot) {
      snapshot = readCanonical(address)
      snapshots.set(address, snapshot)
    }
    return snapshot
  }
  const address = (value: string): MetaAddress => {
    const parsed = parseMetaAddress(value)
    if (!parsed) throw new Error("Working Matter references an invalid canonical Meta")
    return parsed
  }
  let ownerAddress = request.to.address
  let owner = await read(ownerAddress)
  const locator = request.to.parent
  if (locator) {
    if (locator.address !== request.to.address) throw new Error("Working Matter parent locator belongs to another Meta")
    let entries: Array<{edgeSlot: string, particle: MatterParticle}> = (owner.matter ?? []).map(particle => ({edgeSlot: "root", particle}))
    for (const step of locator.path) {
      const entry = entries[step.position]
      if (!entry || entry.edgeSlot !== step.edgeSlot) throw new Error("Working Matter parent locator is unavailable")
      if (entry.particle.kind === "wimp") {
        ownerAddress = address(entry.particle.src)
        owner = await read(ownerAddress)
      }
      entries = entry.particle.children ?? []
    }
  }
  const pending: Array<{particle: MetaMatterParticle, ownerAddress: MetaAddress, owner: MetaDSL}> = [{particle: request.particle, ownerAddress, owner}]
  for (let index = 0; index < pending.length; index++) {
    const current = pending[index]!
    let childOwner = current.owner
    let childAddress = current.ownerAddress
    if (current.particle.kind === "wimp") {
      childAddress = current.particle.src
      childOwner = await read(childAddress)
      const binding = current.particle.massBinding
      const direct = binding && typeof binding === "object" ? binding.directMass : undefined
      if (direct?.kind === "keys") for (const entry of direct.entries) {
        const source = current.owner.mass?.find(key => key.key === entry.source)
        const target = childOwner.mass?.find(key => key.key === entry.target)
        if (!source) throw new Error(`Working Matter source Mass key is undeclared: ${current.ownerAddress}#${entry.source}`)
        if (!target) throw new Error(`Working Matter target Mass key is undeclared: ${childAddress}#${entry.target}`)
        if (source.format !== target.format) throw new Error(`Working Matter direct Mass formats differ: ${current.ownerAddress}#${entry.source} -> ${childAddress}#${entry.target}`)
      }
    }
    for (const child of current.particle.children ?? []) pending.push({particle: child.particle, ownerAddress: childAddress, owner: childOwner})
  }
}
