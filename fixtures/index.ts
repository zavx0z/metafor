export {messagesFixture} from "./broadcast"
export {createGraphFixture} from "./graph.fixture"
export function deepClone(obj: any) {
  if (obj === null || typeof obj !== "object") return obj

  const clone = Array.isArray(obj) ? [] : {}

  for (let key in obj) {
    if (Object.hasOwn(obj, key)) {
      // @ts-ignore
      clone[key] = deepClone(obj[key])
    }
  }

  return clone
}
