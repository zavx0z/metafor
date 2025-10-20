export { threadLog } from "./logger"

export function shortUUID(uuid: string): string {
  return uuid.slice(0, 8)
}