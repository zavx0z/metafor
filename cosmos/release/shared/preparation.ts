import type {ReleasePublicationPlan} from "@metafor/tech-release"

/** Проверка исходников и подготовка кандидата принадлежат одному владельцу запроса Source. */
export interface DevelopmentPreparationProgress {
  readonly requestId: string
  readonly phase: "checking" | "checked" | "publishing" | "published" | "composing" | "installing" | "complete" | "failed"
  readonly detail?: string
}

/** Ограниченный результат проверок хоста; идентификатор не выдаёт полномочие. */
export interface DevelopmentPreparationCheck {
  readonly id: string
  readonly passed: boolean
  readonly detail: string
}

export interface DevelopmentCheckReceipt {
  readonly schemaVersion: 1
  readonly kind: "check"
  readonly requestId: string
  readonly checkId: string
  readonly subject: string
  readonly assignmentRevision: string
  readonly inventorySha256: string
  readonly passed: boolean
  readonly checks: readonly DevelopmentPreparationCheck[]
  readonly error?: string
}

/** Публичная сводка сохранённых эффектов без путей хоста и полного графа выходов. */
export interface DevelopmentPreparationEffects {
  readonly root: Readonly<{manifestSha256: string; matchesPlan: boolean}>
  readonly packages: readonly Readonly<{
    name: string
    version: string
    childVersion: string | null
    ready: boolean
    prepared: readonly Readonly<{env: string; outputsCount: number; inventorySha256: string | null}>[]
  }>[]
}

/** Эффект публикации сохраняется отдельно от исхода установки кандидата. */
export interface DevelopmentPrepareReceipt {
  readonly schemaVersion: 1
  readonly kind: "prepare"
  readonly requestId: string
  readonly subject: string
  readonly checkId: string
  readonly assignmentRevision: string
  readonly inventorySha256: string
  readonly expected: Readonly<{digest: string; revision: number}>
  readonly fingerprint: string
  readonly plan: ReleasePublicationPlan
  readonly state: "running" | "unknown" | "complete" | "failed"
  readonly publication?: Readonly<{success: boolean}>
  readonly effects?: DevelopmentPreparationEffects
  /** Назначенный digest до записи в хранилище; готовность подтверждается отдельно. */
  readonly target?: Readonly<{digest: string; compatibilityLine: string}>
  readonly candidate?: Readonly<{digest: string; compatibilityLine: string}>
  readonly error?: string
  /** После перезапуска неизвестный исход требует явного чтения перед новым решением. */
  readonly operatorReadback?: boolean
}

export type DevelopmentPreparationReceipt = DevelopmentCheckReceipt | DevelopmentPrepareReceipt

export interface DevelopmentPreparationRequest {
  readonly requestId: string
  readonly subject: string
  readonly checkId: string
  readonly expected: Readonly<{digest: string; revision: number}>
}
