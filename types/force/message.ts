import type {ForcePartInput, Particle, SourcedParticle} from "./particle.ts"

export interface ForceMessage {
  parts: [Particle]
}

/** Сообщение на проводе Force: источник уже назначен и обязателен. */
export interface SourcedForceMessage extends ForceMessage {
  parts: [SourcedParticle]
}

export interface ForceMessageInput {
  parts: [ForcePartInput]
}

export const sourceForceMessage = (message: ForceMessageInput, by: string): SourcedForceMessage => ({
  parts: [{...message.parts[0], by}],
})

/** Возвращает Patch в состояние до испускания, не доверяя входному `by`. */
export const unsourceForceMessage = (message: ForceMessage): ForceMessageInput => {
  const {by: _by, ...part} = message.parts[0]
  return {parts: [part]}
}
