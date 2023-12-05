import type { StateNode } from "xstate"

export function flatten<T>(array: Array<T | T[]>): T[] {
    return ([] as T[]).concat(...array)
}
export function getChildren(stateNode: StateNode): StateNode[] {
    if (!stateNode.states) return []
    const children = Object.keys(stateNode.states).map((key) => stateNode.states[key])
    children.sort((a, b) => b.order - a.order)
    return children
}