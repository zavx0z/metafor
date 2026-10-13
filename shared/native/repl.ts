import {open} from "node:fs/promises"
import {constants} from "node:fs"
import {isAbsolute} from "node:path"

/** Назначение владельца даёт полный доступ к ОС через отдельный Bun process. */
export interface NativeReplAssignment {readonly token: string; readonly cwd: string}
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)

/**
Читает только явно назначенный приватный regular file с mode 0600. Отсутствие
назначения отключает capability; неверное назначение останавливает подключение.
Токен не включается в environment дочернего процесса или публичные receipts.
*/
export async function readNativeReplAssignment(environment: Readonly<Record<string, string | undefined>>): Promise<NativeReplAssignment | null> {
  const path = environment.ORACLE_REPL_CONFIG
  if (path === undefined) return null
  if (!isAbsolute(path) || path.includes("\0")) throw new Error("Invalid native REPL assignment")
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.uid !== process.getuid?.() || stat.size > 16384) throw new Error("Native REPL assignment must be an owned private regular file (0600)")
    const value: unknown = JSON.parse(await file.readFile("utf8"))
    if (!record(value) || Object.keys(value).sort().join(",") !== "cwd,token" || typeof value.token !== "string" || value.token.length < 24 || value.token.length > 1024 ||
        typeof value.cwd !== "string" || !isAbsolute(value.cwd) || value.cwd.includes("\0")) throw new Error("Invalid native REPL assignment")
    return {token: value.token, cwd: value.cwd}
  } catch {
    throw new Error("Invalid native REPL assignment; inspect the private host configuration")
  } finally {await file.close()}
}

