/** Минимальный startup API, необходимый env `service-worker` release. */
export interface ReleaseLoader {
  verify(response: Response): Response
  cache(name: string, request: Request, response: Response): Promise<void>
  read(name: string, request: Request): Promise<Response | undefined>
  run(source: string, bindings?: Readonly<Record<string, unknown>>): unknown
}

/** Один inert либо запущенный экземпляр сменяемого Service Worker release. */
export interface ReleaseRuntime {
  start(): Promise<void>
  fetch(event: FetchEvent): Promise<Response>
  message(event: ExtendableMessageEvent): Promise<void>
  destroy(): Promise<void>
}

/** Односторонние зависимости, которые неизменяемый startup передаёт release. */
export interface ReleaseDependencies {
  readonly loader: Readonly<ReleaseLoader>
  readonly runtime: Readonly<{
    prepare(request?: Request): Promise<ReleaseRuntime>
    activate(candidate: ReleaseRuntime): Promise<void>
  }>
}

/** Factory release только создаёт inert runtime и не запускает side effects. */
export type ReleaseFactory = (
  dependencies: ReleaseDependencies,
) => ReleaseRuntime | Promise<ReleaseRuntime>
