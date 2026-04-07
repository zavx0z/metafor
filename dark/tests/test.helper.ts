import { disposeMetaDbContext } from "../load.context.ts"

export function resetDarkLoadContext(): void {
  disposeMetaDbContext()
}
