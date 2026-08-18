/**
 * Неизменяемая Service Worker оболочка `@hamiltonian/startup`.
 *
 * Она синхронно регистрирует browser listeners, сразу запускает release и
 * оставляет всё прикладное поведение самому release.
 *
 * @packageDocumentation
 */

import * as loader from "./loader"
import {createReleaseHost, registerReleaseListeners, type StartupEventScope} from "./runtime"
import type {ReleaseLoader} from "@hamiltonian/release"

const serviceReleaseRequest = new Request(
  new URL("/@hamiltonian/release?env=service-worker", location.origin),
)
const releaseLoader = loader satisfies ReleaseLoader
const host = createReleaseHost(serviceReleaseRequest, releaseLoader)

registerReleaseListeners(globalThis as unknown as StartupEventScope, host)
void host.boot().catch((error) => {
  console.error("Не удалось запустить Service Worker release", error)
})
