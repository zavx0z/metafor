import type {AgentConfiguration, AgentPresentation} from "@metafor/types/metafor/agents"

/** Одна default проекция: беседа сначала, остальные tabs раскрывают того же owning Atom. */
export const DEFAULT_AGENT_PRESENTATION: AgentPresentation = Object.freeze({
  kind: "agent-inspector",
  defaultTab: "chat",
  tabs: Object.freeze(["chat", "provider", "tools", "context"] as const),
})

/** Локальный выбор tab не записывается в canonical Agent configuration. */
export type AgentViewTab = AgentPresentation["tabs"][number]

/**
Проецирует сохранённую декларацию UI без materialization и без выдачи прав.
Authored tools/displays возвращаются полностью и в исходном порядке; служебный
чат присутствует независимо от добавленных displays. Сценарии —
[presentation tests](./test/atom.test.ts).
*/
export function projectAgentPresentation(configuration: AgentConfiguration) {
  const presentation = configuration.presentation ?? DEFAULT_AGENT_PRESENTATION
  if (presentation.kind !== "agent-inspector" || presentation.defaultTab !== "chat"
    || presentation.tabs.length !== 4 || presentation.tabs.some((tab, index) => tab !== DEFAULT_AGENT_PRESENTATION.tabs[index])) {
    throw new TypeError("Agent default presentation не соответствует объявленному контракту")
  }
  const ids = new Set<string>()
  for (const display of configuration.displays) {
    if (!display.id.trim() || ids.has(display.id)) throw new TypeError("Agent display требует уникальную identity")
    ids.add(display.id)
  }
  return Object.freeze({
    id: configuration.id,
    atom: configuration.atom,
    defaultTab: presentation.defaultTab,
    tabs: presentation.tabs,
    tools: configuration.tools,
    displays: configuration.displays,
  })
}
