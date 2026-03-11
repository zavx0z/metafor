import type { Collapse } from "../schema.t"
import type { ConvertedSuperposition } from "../../weak/program.t"

export interface NamedSuperposition {
  [state: string]: Record<string, any> | null
}

export function convertToNumeric(
  superposition: NamedSuperposition,
  fieldNameIndex: Map<string, number>,
): ConvertedSuperposition {
  const states = Object.keys(superposition)
  const stateIndex = new Map<string, number>()
  states.forEach((name, index) => stateIndex.set(name, index))

  const transitions: Array<Array<Collapse>> = []

  for (const fromState of states) {
    const transObj = superposition[fromState]
    if (!transObj) {
      transitions.push([null])
      continue
    }

    const fromTransitions: Array<Collapse> = []
    for (const [toState, conditions] of Object.entries(transObj)) {
      const toIdx = stateIndex.get(toState)
      if (toIdx === undefined) {
        throw new Error(`Unknown state: ${toState}`)
      }
      if (!conditions) {
        fromTransitions.push(null)
      } else {
        const converted: Record<number, any> = {}
        for (const [fieldName, condition] of Object.entries(conditions)) {
          const fieldIdx = fieldNameIndex.get(fieldName)
          if (fieldIdx === undefined) {
            throw new Error(`Field '${fieldName}' not found`)
          }
          converted[fieldIdx] = condition
        }
        fromTransitions.push([toIdx, converted])
      }
    }

    transitions.push(fromTransitions)
  }

  return {
    states,
    boundary: { transitions },
  }
}
