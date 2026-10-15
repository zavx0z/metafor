import type {HTMLElement} from "@zavx0z/immersive"
import type {DevelopmentContent} from "../../../release/shared/development"
import type {DevelopmentAgentProfile, DevelopmentAgentProfileUpdate} from "../../../release/shared/development-agent"

/** Identity исполнителя в комнате задаёт Storybook Session, а не Quantum Atom. */
export type DevelopmentRoomAgent = Readonly<{
  executorId: string
  label: string
  profile?: DevelopmentAgentProfile
}>

/** Один Chat остаётся в том же Document при переносе между стеной и окном. */
export type DevelopmentRoomChatHost = Readonly<{
  element: HTMLElement
  moveTo(host: HTMLElement): void
  setVisible(visible: boolean): void
  setNativePreparationActive?(active: boolean): void
  setAgentSettings?(element: HTMLElement | null): void
  dispose(): void
}>

/** Узкие назначенные host-порты SourceRooms; загрузка участников происходит только для посещённой комнаты. */
export type DevelopmentRoomPorts = Readonly<{
  content(packageName: string, nodeId?: string): Promise<DevelopmentContent>
  agents: Readonly<{
    list(packageName: string): Promise<readonly DevelopmentRoomAgent[]>
    create(packageName: string, label: string): Promise<DevelopmentRoomAgent>
    prepareProfile?(packageName: string, executorId: string): Promise<DevelopmentAgentProfile>
    updateProfile?(packageName: string, executorId: string, update: DevelopmentAgentProfileUpdate): Promise<DevelopmentAgentProfile>
  }>
  chat(input: Readonly<{address: string; label: string; executorId: string}>): DevelopmentRoomChatHost
}>

/** Exact package и executor IDs образуют локальную identity visual actor без AtomRef. */
export function developmentActorId(packageName: string, executorId: string): string {
  if (!packageName || !executorId) throw new Error("Development actor requires package and executor identity")
  return JSON.stringify([packageName, executorId])
}
