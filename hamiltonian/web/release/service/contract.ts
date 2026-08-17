/** Минимальный startup API, необходимый сменяемому Service Worker release. */
export interface ReleaseLoader {
  verify(response: Response): Response
  cache(name: string, request: Request, response: Response): Promise<void>
  read(name: string, request: Request): Promise<Response | undefined>
  remove(name: string, request: Request): Promise<boolean>
  run(source: string, bindings?: Readonly<Record<string, unknown>>): unknown
}
