import {QuantumAtom} from "./QuantumAtom.js"

/**
 * @param {Record<string, any>} snapshot
 * @throws {Error}
 */
export function validateSnapshot(snapshot) {
  if (!snapshot.types) throw new Error("В снапшоте отсутствуют типы полей контекста")
  if (!snapshot.id || typeof snapshot.id !== "string") throw new Error("В снапшоте отсутствует или некорректно указан id атома")
  if (!Array.isArray(snapshot.states) || snapshot.states.length === 0) throw new Error("В снапшоте отсутствуют или некорректно указаны состояния")
}

/**
 * @template {import("./types/index.ts").ContextDefinition} C
 * @template {string} S
 * @template {Record<string, unknown>} I
 *
 * @param {Record<string, any>} snapshot
 * @returns {import('./QuantumAtom.js').QuantumAtom<any, any, any>}
 */
export function AtomFromSnapshot(snapshot) {
  validateSnapshot(snapshot)
  const channel = new BroadcastChannel("channel")
  return new QuantumAtom({
    channel,
    id: snapshot.id,
    states: snapshot.states,
    contextDefinition: snapshot.types,
    collapses: snapshot.collapses,
    initialState: snapshot.state,
    contextData: snapshot.context,
    actions: {},
    core: () => ({}),
    coreData: {},
    reactions: [],
    onCollapse: () => {
    },
    destroy: () => {
    }
  })
}
