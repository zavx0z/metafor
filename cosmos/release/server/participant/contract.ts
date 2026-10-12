import type {PeerConnectionFactory, PeerNetwork, PeerSnapshot, createRoutedPeerNetwork} from "@metafor/tech-peer"
import type {connectWebSocketSignaling} from "@metafor/tech-peer/signaling"
import type {Configuration as PeerConfiguration} from "./configuration-contract"

/** Release-owned physical participant. Meta retains its resource lifecycle; [release law](../../README.md#знакомство-участников). */
export declare namespace ReleaseParticipant {
  type Configuration = PeerConfiguration
  type Input = Readonly<{config: Configuration}>
  type Output = Readonly<{
    id: string
    network: PeerNetwork
    snapshot(): PeerSnapshot
    close(): Promise<void>
  }>
  /** Локальные platform substitutions; удалённый участник их не назначает. */
  type Slots = Readonly<{
    rtc?: PeerConnectionFactory
    network?: typeof createRoutedPeerNetwork
    connect?: typeof connectWebSocketSignaling
  }>
}
