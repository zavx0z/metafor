import type {BrowserPackageArtifactIdentity} from "../../shared/artifact-integrity"
import {browserPackageIdentitySlot} from "../../shared/artifact-url"

let desired: readonly BrowserPackageArtifactIdentity[] = Object.freeze([])

/** Возвращает immutable in-memory desired browser projection текущего process. */
export function readDesiredBrowserArtifacts() {
  return desired
}

/**
Атомарно заменяет projection после cold recovery всего release composition.

Вход содержит только roots и eager outputs. Функция не пишет filesystem,
manifest, protocol или cache state.

@throws Если identity slot повторяется либо non-root artifact не имеет root той
  же package version.
*/
export function replaceDesiredBrowserArtifacts(
  artifacts: readonly BrowserPackageArtifactIdentity[],
) {
  desired = validateDesiredBrowserArtifacts(artifacts)
}

/**
Атомарно заменяет projection только опубликованных packages, сохраняя
неизменившихся участников уже восстановленного process state.

@param packages - Канонические package names, полностью заменяемые этой
  publication.
@param artifacts - Root и eager identities новых версий указанных packages.

@throws Если artifact принадлежит другому package либо итоговый projection
  теряет root/version coherence.
*/
export function replaceDesiredPackageArtifacts(
  packages: readonly string[],
  artifacts: readonly BrowserPackageArtifactIdentity[],
) {
  const selected = new Set(packages)
  if (artifacts.some(({name}) => !selected.has(name)))
    throw new Error("Desired package projection contains an unselected package")
  replaceDesiredBrowserArtifacts([
    ...desired.filter(({name}) => !selected.has(name)),
    ...artifacts,
  ])
}

function validateDesiredBrowserArtifacts(
  artifacts: readonly BrowserPackageArtifactIdentity[],
) {
  const identities = artifacts.map((artifact) => Object.freeze({...artifact}))
  const slots = new Set<string>()
  const roots = new Map<string, string>()
  for (const artifact of identities) {
    const slot = browserPackageIdentitySlot(artifact)
    if (slots.has(slot)) throw new Error(`Desired browser artifact duplicates slot ${slot}`)
    slots.add(slot)
    if (artifact.artifact === undefined)
      roots.set(`${artifact.name}\u0000${artifact.env}`, artifact.version)
  }
  for (const artifact of identities) {
    const rootVersion = roots.get(`${artifact.name}\u0000${artifact.env}`)
    if (rootVersion !== artifact.version)
      throw new Error(`Desired browser artifact lacks matching root ${artifact.name}:${artifact.env}`)
  }
  return Object.freeze(identities.sort((left, right) =>
    left.name.localeCompare(right.name)
    || left.env.localeCompare(right.env)
    || (left.artifact ?? "").localeCompare(right.artifact ?? "")))
}
