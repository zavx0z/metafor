export type ParsedActionHandler = {
  fn: Function
  read: string[]
}

export type ParsedHandler = {
  fn: Function
  read: string[]
  write: string[]
}

export type ParsedProcess = {
  action?: ParsedActionHandler
  success?: ParsedHandler
  error?: ParsedHandler
}
