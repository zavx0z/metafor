import type {BoundaryUpdateMessage} from "boundary"
import type {EnergyEnv, EnergyMass, EnergyProcessResult, EnergyProcessTask} from "./energy.t.ts"

export type EnergyBridgeIncomingMessage =
  | {type: "force"; parts: BoundaryUpdateMessage["parts"]}
  | {type: "process-task"; version: 1; task: EnergyProcessTask}
  | {type: "claim-accepted"; actorId: number; processId: number; token?: string}
  | {type: "claim-rejected"; actorId: number; processId: number; reason: string}
  | {type: "error"; error: string}

export type EnergyBridgeOutgoingMessage =
  | {type: "hello"; runtime: "energy"; env: EnergyEnv; pid: number; startedAt: string}
  | {type: "force"; parts: BoundaryUpdateMessage["parts"]}
  | {type: "claim"; actorId: number; processId: number; token: string; env: EnergyEnv; mass?: EnergyMass}
  /** Telemetry only. Canonical process completion remains Force `w+` / `w-`. */
  | {type: "process-result"; result: EnergyProcessResult}

export type EnergyServerSocketState = "idle" | "connecting" | "connected" | "closed" | "error"

export type EnergyServerStatus = {
  ok: true
  runtime: "energy"
  pid: number
  startedAt: string
  host: string
  port: number
  bridgeUrl: string
  socketState: EnergyServerSocketState
  connected: boolean
  env: EnergyEnv
  activeTasks: number
  completedTasks: number
  failedTasks: number
  lastTaskAt: string | null
  lastResultAt: string | null
  lastError: string | null
}
