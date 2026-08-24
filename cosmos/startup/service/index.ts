/**
 * Неизменяемая Service Worker оболочка `@cosmos/startup`.
 *
 * Она синхронно регистрирует browser listeners, сразу запускает release и
 * оставляет всё прикладное поведение самому release.
 * Пользовательский lifecycle задан [startup owner law](../README.md#как-начинается-работа).
 *
 * @packageDocumentation
 */

import * as loader from "./loader"
import {createReleaseHost, registerReleaseListeners, type StartupEventScope} from "./runtime"
import type {ReleaseLoader} from "@cosmos/release"

const serviceReleaseRequest = new Request(
  new URL("/@cosmos/release?env=service", location.origin),
)
const releaseLoader = loader satisfies ReleaseLoader
const host = createReleaseHost(serviceReleaseRequest, releaseLoader)

registerReleaseListeners(globalThis as unknown as StartupEventScope, host)
void host.boot().catch(() => {})
