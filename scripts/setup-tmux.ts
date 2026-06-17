import {existsSync} from "node:fs"
import {ensureMetaforTmuxProfile, METAFOR_TMUX_CONFIG_PATH} from "../pkg/pty/src/tmux-profile.ts"

const quiet = process.argv.includes("--quiet")

try {
  const result = ensureMetaforTmuxProfile()
  if (!quiet) {
    const status = result.changed ? "updated" : "ready"
    console.log(`[tmux] MetaFor profile ${status}: ${result.path}`)
  }
  if (existsSync(METAFOR_TMUX_CONFIG_PATH)) process.exit(0)
  process.exit(1)
} catch (error) {
  if (!quiet) console.error(`[tmux] setup failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
