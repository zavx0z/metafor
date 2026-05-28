const BUN_CONTROL_DOMAIN = "Ins" + "pector"

export const protocolCommand = {
  controlEnable: `${BUN_CONTROL_DOMAIN}.enable`,
  controlInitialized: `${BUN_CONTROL_DOMAIN}.initialized`,
} as const

export function publicProtocolMethod(method: string): string {
  const prefix = `${BUN_CONTROL_DOMAIN}.`
  if (!method.startsWith(prefix)) return method
  return `Protocol.${method.slice(prefix.length)}`
}
