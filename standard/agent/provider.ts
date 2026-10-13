import {useAtom, type AtomContext, type AtomBrowserConnection} from "./atom"
import type {ProviderBinding} from "@metafor/types/metafor/providers"

const tuple = (binding: ProviderBinding) => JSON.stringify([binding.id, binding.service, binding.host, binding.remotePeerId, binding.executorId, binding.assignmentId ?? null])

/**
Explicit [Provider view binding](./README.md) of the passed Atom. Reads the same
canonical registry snapshot as Chat; no global context or independent catalog.
connectBrowser is an assigned Environment action, not an invented RPC endpoint.
The returned exclusive grant must be closed by its consumer. A changed executor
or aborted request is rejected and released rather than silently replacing the
selected binding. [Checks](./test/provider.test.ts).
*/
export function useProvider(atom: AtomContext) {
  const owner = useAtom(atom)
  return {
    getSnapshot: () => owner.getSnapshot().providers ?? null,
    subscribe: (listener: () => void) => owner.subscribe(listener),
    async connectBrowser(entryId: string, signal: AbortSignal): Promise<AtomBrowserConnection> {
      signal.throwIfAborted()
      const entry = owner.getSnapshot().providers?.registry.entries.find(entry => entry.id === entryId)
      if (!entry || !entry.capabilities.browserPreview || !owner.actions.connectBrowser) throw new Error("Provider browser preview is not assigned")
      const expected = tuple(entry)
      const connection = await owner.actions.connectBrowser(entryId, signal)
      const current = owner.getSnapshot().providers?.registry.entries.find(entry => entry.id === entryId)
      if (signal.aborted || !current || tuple(current) !== expected || tuple(connection.binding) !== expected) {
        await connection.client.close()
        signal.throwIfAborted()
        throw new Error("Provider browser binding changed")
      }
      return connection
    },
  }
}

/** Equality of the public assignment tuple; checks and connection observations remain separate. */
export function sameProviderBinding(left: ProviderBinding, right: ProviderBinding): boolean {
  return tuple(left) === tuple(right)
}
