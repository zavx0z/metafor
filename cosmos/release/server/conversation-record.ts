import {randomUUID} from "node:crypto"
import {mkdir, open, rename, rm} from "node:fs/promises"
import {dirname, join} from "node:path"

/** Запись малого файла Cosmos: подтверждённые bytes предшествуют атомарной замене имени. */
export async function writeConversationRecord(path: string, value: unknown): Promise<void> {
  const folder = dirname(path)
  await mkdir(folder, {recursive: true, mode: 0o700})
  const temporary = join(folder, `.record-${randomUUID()}.tmp`)
  try {
    const file = await open(temporary, "wx", 0o600)
    try {await file.writeFile(JSON.stringify(value) + "\n"); await file.sync()} finally {await file.close()}
    await rename(temporary, path)
    const parent = await open(folder, "r")
    try {await parent.sync()} finally {await parent.close()}
  } finally {await rm(temporary, {force: true})}
}
