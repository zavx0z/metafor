export const HAMILTONIAN_CONTROL_SOCKET_REJECTION_CODE = 4008
export const HAMILTONIAN_CONTROL_SOCKET_REJECTION_REASON_MAX_BYTES = 123

interface HamiltonianBrowserCloseSocket {
  close(code?: number, reason?: string): void
}

interface HamiltonianBrowserCloseSocketSlot {
  readonly current: HamiltonianBrowserCloseSocket | null
}

const utf8 = new TextEncoder()

function boundedCloseReason(reason: string): string {
  if (utf8.encode(reason).byteLength <= HAMILTONIAN_CONTROL_SOCKET_REJECTION_REASON_MAX_BYTES) {
    return reason
  }
  let bounded = ""
  let bytes = 0
  for (const character of reason) {
    const characterBytes = utf8.encode(character).byteLength
    if (bytes + characterBytes > HAMILTONIAN_CONTROL_SOCKET_REJECTION_REASON_MAX_BYTES) break
    bounded += character
    bytes += characterBytes
  }
  return bounded
}

export function rejectHamiltonianControlSocket(
  slot: HamiltonianBrowserCloseSocketSlot,
  socket: HamiltonianBrowserCloseSocket | null,
  reason: string,
): boolean {
  if (socket === null || slot.current !== socket) return false
  socket.close(HAMILTONIAN_CONTROL_SOCKET_REJECTION_CODE, boundedCloseReason(reason))
  return true
}
