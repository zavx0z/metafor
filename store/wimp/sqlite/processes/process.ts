import type { Processes, ProcessType } from "./index.ts"
import { ProcessAction } from "./action.ts"
import { ProcessFinally } from "./finally.ts"
import { ProcessEnvs } from "./env.ts"

export class Process {
  readonly env: ProcessEnvs
  readonly action: ProcessAction
  readonly finally: ProcessFinally

  constructor(
    readonly processes: Processes,
    readonly key: string,
  ) {
    this.env = new ProcessEnvs(this)
    this.action = new ProcessAction(this)
    this.finally = new ProcessFinally(this)
  }

  /**
   * Резолвит uuid строки `process` по (wimp, key). Throw если не найдено.
   */
  async uuid(): Promise<string> {
    const row = (
      await this.processes.wimp.sql<Array<{ uuid: string }>>`
        SELECT uuid FROM process
        WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
        LIMIT 1
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in wimp ${this.processes.wimp.src}`)
    return row.uuid
  }

  async type(): Promise<ProcessType> {
    const row = (
      await this.processes.wimp.sql<Array<{ type: ProcessType }>>`
        SELECT type FROM process WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in wimp ${this.processes.wimp.src}`)
    return row.type
  }

  async label(): Promise<string | undefined> {
    const row = (
      await this.processes.wimp.sql<Array<{ label: string | null }>>`
        SELECT label FROM process WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in wimp ${this.processes.wimp.src}`)
    return row.label ?? undefined
  }

  async setLabel(value: string | null): Promise<void> {
    await this.processes.wimp.sql`
      UPDATE process SET label = ${value}
      WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
    `
  }

  async desc(): Promise<string | undefined> {
    const row = (
      await this.processes.wimp.sql<Array<{ desc: string | null }>>`
        SELECT desc FROM process WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
      `
    )[0]
    if (!row) throw new Error(`process ${this.key} not found in wimp ${this.processes.wimp.src}`)
    return row.desc ?? undefined
  }

  async setDesc(value: string | null): Promise<void> {
    await this.processes.wimp.sql`
      UPDATE process SET desc = ${value}
      WHERE wimp = ${this.processes.wimp.src} AND key = ${this.key}
    `
  }
}
