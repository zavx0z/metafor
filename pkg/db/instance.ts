import { Database } from "bun:sqlite"
import type { DbFieldOrbitSnapshot, DbFieldValueKind, DbParticleShellSnapshot, DbWorldSnapshot } from "./instance.t.ts"

export interface DbInstanceSqliteOptions {
  filename?: string
}

const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS db_particle_shell (
  particle_id TEXT PRIMARY KEY,
  root_src TEXT NOT NULL,
  parent_particle_id TEXT,
  particle_kind TEXT NOT NULL CHECK (particle_kind IN ('wimp', 'fuzzy', 'axion', 'macho')),
  src TEXT,
  meta_src TEXT,
  label TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  shell_order INTEGER NOT NULL CHECK (shell_order >= 0),
  local_x REAL NOT NULL,
  local_y REAL NOT NULL,
  local_z REAL NOT NULL,
  shell_scale REAL NOT NULL CHECK (shell_scale > 0),
  shell_radius REAL NOT NULL CHECK (shell_radius > 0),
  shell_tube REAL NOT NULL CHECK (shell_tube > 0),
  color_r REAL NOT NULL,
  color_g REAL NOT NULL,
  color_b REAL NOT NULL,
  FOREIGN KEY (parent_particle_id) REFERENCES db_particle_shell(particle_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS db_particle_shell_by_root
  ON db_particle_shell(root_src, parent_particle_id, shell_order);

CREATE INDEX IF NOT EXISTS db_particle_shell_by_root_depth
  ON db_particle_shell(root_src, depth, shell_order);

CREATE TABLE IF NOT EXISTS db_field_orbit (
  id TEXT PRIMARY KEY,
  root_src TEXT NOT NULL,
  particle_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_order INTEGER NOT NULL CHECK (field_order >= 0),
  value_kind TEXT NOT NULL CHECK (value_kind IN ('number', 'text', 'bool', 'other')),
  value_text TEXT,
  local_x REAL NOT NULL,
  local_y REAL NOT NULL,
  local_z REAL NOT NULL,
  sphere_radius REAL NOT NULL CHECK (sphere_radius > 0),
  color_r REAL NOT NULL,
  color_g REAL NOT NULL,
  color_b REAL NOT NULL,
  FOREIGN KEY (particle_id) REFERENCES db_particle_shell(particle_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS db_field_orbit_by_root
  ON db_field_orbit(root_src, particle_id, field_order);
`

/**
 * Вставляет один shell-carrier в `db_particle_shell` под указанным `rootSrc`.
 *
 * Используется как incremental write API: streaming materialize вызывает на каждый узел
 * descriptor-дерева, не накапливая `DbWorldSnapshot` в памяти.
 */
export const insertDbParticleShell = (
  db: Database,
  rootSrc: string,
  shell: DbParticleShellSnapshot,
): void => {
  db.query(
    `INSERT INTO db_particle_shell (
      particle_id,
      root_src,
      parent_particle_id,
      particle_kind,
      src,
      meta_src,
      label,
      depth,
      shell_order,
      local_x,
      local_y,
      local_z,
      shell_scale,
      shell_radius,
      shell_tube,
      color_r,
      color_g,
      color_b
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    shell.particleId,
    rootSrc,
    shell.parentParticleId,
    shell.kind,
    shell.src,
    shell.metaSrc,
    shell.label,
    shell.depth,
    shell.shellOrder,
    shell.localX,
    shell.localY,
    shell.localZ,
    shell.shellScale,
    shell.shellRadius,
    shell.shellTube,
    shell.colorR,
    shell.colorG,
    shell.colorB,
  )
}

/**
 * Вставляет одну точку field-orbit в `db_field_orbit` под указанным `rootSrc`.
 *
 * Используется как incremental write API: streaming materialize вызывает на каждый field
 * после вставки particle-родителя.
 */
export const insertDbFieldOrbit = (db: Database, rootSrc: string, orbit: DbFieldOrbitSnapshot): void => {
  db.query(
    `INSERT INTO db_field_orbit (
      id,
      root_src,
      particle_id,
      field_key,
      field_label,
      field_order,
      value_kind,
      value_text,
      local_x,
      local_y,
      local_z,
      sphere_radius,
      color_r,
      color_g,
      color_b
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    orbit.id,
    rootSrc,
    orbit.particleId,
    orbit.fieldKey,
    orbit.fieldLabel,
    orbit.fieldOrder,
    orbit.fieldValueKind,
    orbit.valueText,
    orbit.localX,
    orbit.localY,
    orbit.localZ,
    orbit.sphereRadius,
    orbit.colorR,
    orbit.colorG,
    orbit.colorB,
  )
}

export const initializeDbInstanceSqliteSchema = (db: Database): void => {
  db.exec(schemaSql)

  const fieldOrbitColumns = db
    .query(`PRAGMA table_info(db_field_orbit)`)
    .all() as Array<{ name: string }>

  if (!fieldOrbitColumns.some((column) => column.name === "value_kind")) {
    db.exec(`ALTER TABLE db_field_orbit ADD COLUMN value_kind TEXT NOT NULL DEFAULT 'other';`)
  }
}

export const openDbInstanceSqlite = (options: DbInstanceSqliteOptions = {}): Database => {
  const filename = options.filename ?? ":memory:"
  const db = new Database(filename)
  if (filename !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;")
    db.exec("PRAGMA synchronous = NORMAL;")
    db.exec("PRAGMA busy_timeout = 5000;")
  }
  initializeDbInstanceSqliteSchema(db)
  return db
}

export const resetDbInstanceSqlite = (db: Database): void => {
  initializeDbInstanceSqliteSchema(db)
  db.exec(`
    DELETE FROM db_field_orbit;
    DELETE FROM db_particle_shell;
  `)
}

/** Очищает все particles/fields для указанного `rootSrc`. Используется перед re-materialize. */
export const clearDbWorld = (db: Database, rootSrc: string): void => {
  initializeDbInstanceSqliteSchema(db)
  const tx = db.transaction(() => {
    db.query(`DELETE FROM db_field_orbit WHERE root_src = ?`).run(rootSrc)
    db.query(`DELETE FROM db_particle_shell WHERE root_src = ?`).run(rootSrc)
  })
  tx()
}

interface ParticleShellRow {
  particle_id: string
  parent_particle_id: string | null
  particle_kind: DbParticleShellSnapshot["kind"]
  src: string | null
  meta_src: string | null
  label: string
  depth: number
  shell_order: number
  local_x: number
  local_y: number
  local_z: number
  shell_scale: number
  shell_radius: number
  shell_tube: number
  color_r: number
  color_g: number
  color_b: number
}

interface FieldOrbitRow {
  id: string
  particle_id: string
  field_key: string
  field_label: string
  field_order: number
  value_kind: DbFieldValueKind
  value_text: string | null
  local_x: number
  local_y: number
  local_z: number
  sphere_radius: number
  color_r: number
  color_g: number
  color_b: number
}

const PARTICLE_SHELL_COLUMNS = `
  particle_id,
  parent_particle_id,
  particle_kind,
  src,
  meta_src,
  label,
  depth,
  shell_order,
  local_x,
  local_y,
  local_z,
  shell_scale,
  shell_radius,
  shell_tube,
  color_r,
  color_g,
  color_b
`

const FIELD_ORBIT_COLUMNS = `
  id,
  particle_id,
  field_key,
  field_label,
  field_order,
  value_kind,
  value_text,
  local_x,
  local_y,
  local_z,
  sphere_radius,
  color_r,
  color_g,
  color_b
`

const mapParticleShellRow = (row: ParticleShellRow): DbParticleShellSnapshot => ({
  particleId: row.particle_id,
  parentParticleId: row.parent_particle_id,
  kind: row.particle_kind,
  src: row.src,
  metaSrc: row.meta_src,
  label: row.label,
  depth: row.depth,
  shellOrder: row.shell_order,
  localX: row.local_x,
  localY: row.local_y,
  localZ: row.local_z,
  shellScale: row.shell_scale,
  shellRadius: row.shell_radius,
  shellTube: row.shell_tube,
  colorR: row.color_r,
  colorG: row.color_g,
  colorB: row.color_b,
})

const mapFieldOrbitRow = (row: FieldOrbitRow): DbFieldOrbitSnapshot => ({
  id: row.id,
  particleId: row.particle_id,
  fieldKey: row.field_key,
  fieldLabel: row.field_label,
  fieldOrder: row.field_order,
  fieldValueKind: row.value_kind,
  valueText: row.value_text,
  localX: row.local_x,
  localY: row.local_y,
  localZ: row.local_z,
  sphereRadius: row.sphere_radius,
  colorR: row.color_r,
  colorG: row.color_g,
  colorB: row.color_b,
})

/**
 * Читает все particle-shell-ы под `rootSrc`, отсортированные `(depth, shell_order, particle_id)`.
 *
 * Используется bulk-viewport-ом для построения сцены без посредника `DbWorldSnapshot`.
 */
export const selectAllParticleShells = (db: Database, rootSrc: string): DbParticleShellSnapshot[] => {
  initializeDbInstanceSqliteSchema(db)
  return (
    db.query(
      `SELECT ${PARTICLE_SHELL_COLUMNS}
       FROM db_particle_shell
       WHERE root_src = ?
       ORDER BY depth, shell_order, particle_id`,
    ).all(rootSrc) as ParticleShellRow[]
  ).map(mapParticleShellRow)
}

/**
 * Читает все field-orbit-ы под `rootSrc`, отсортированные `(particle_id, field_order, id)`.
 */
export const selectAllFieldOrbits = (db: Database, rootSrc: string): DbFieldOrbitSnapshot[] => {
  initializeDbInstanceSqliteSchema(db)
  return (
    db.query(
      `SELECT ${FIELD_ORBIT_COLUMNS}
       FROM db_field_orbit
       WHERE root_src = ?
       ORDER BY particle_id, field_order, id`,
    ).all(rootSrc) as FieldOrbitRow[]
  ).map(mapFieldOrbitRow)
}

/**
 * Читает прямых детей указанного родителя (или roots при `parentParticleId === null`) под `rootSrc`.
 *
 * Используется bulk-viewport-ом при lazy-загрузке поддерева на навигации/scale.
 */
export const selectParticleShellsByParent = (
  db: Database,
  rootSrc: string,
  parentParticleId: string | null,
): DbParticleShellSnapshot[] => {
  initializeDbInstanceSqliteSchema(db)
  const rows = (
    parentParticleId === null
      ? db.query(
          `SELECT ${PARTICLE_SHELL_COLUMNS}
           FROM db_particle_shell
           WHERE root_src = ? AND parent_particle_id IS NULL
           ORDER BY shell_order, particle_id`,
        ).all(rootSrc)
      : db.query(
          `SELECT ${PARTICLE_SHELL_COLUMNS}
           FROM db_particle_shell
           WHERE root_src = ? AND parent_particle_id = ?
           ORDER BY shell_order, particle_id`,
        ).all(rootSrc, parentParticleId)
  ) as ParticleShellRow[]
  return rows.map(mapParticleShellRow)
}

/**
 * Читает все field-orbit-ы конкретной частицы под `rootSrc`.
 */
export const selectFieldOrbitsByParticle = (
  db: Database,
  rootSrc: string,
  particleId: string,
): DbFieldOrbitSnapshot[] => {
  initializeDbInstanceSqliteSchema(db)
  return (
    db.query(
      `SELECT ${FIELD_ORBIT_COLUMNS}
       FROM db_field_orbit
       WHERE root_src = ? AND particle_id = ?
       ORDER BY field_order, id`,
    ).all(rootSrc, particleId) as FieldOrbitRow[]
  ).map(mapFieldOrbitRow)
}

/**
 * Bulk-write: атомарно перезаписывает весь world указанного `rootSrc` из готового snapshot-а.
 *
 * @deprecated Промежуточная обёртка. Streaming materialize должен использовать
 *   {@link clearDbWorld} + {@link insertDbParticleShell} / {@link insertDbFieldOrbit} напрямую,
 *   чтобы не накапливать `DbWorldSnapshot` в heap.
 */
export const writeDbWorldSnapshot = (db: Database, snapshot: DbWorldSnapshot): void => {
  initializeDbInstanceSqliteSchema(db)

  const tx = db.transaction(() => {
    db.query(`DELETE FROM db_field_orbit WHERE root_src = ?`).run(snapshot.rootSrc)
    db.query(`DELETE FROM db_particle_shell WHERE root_src = ?`).run(snapshot.rootSrc)

    for (const shell of snapshot.particles) {
      insertDbParticleShell(db, snapshot.rootSrc, shell)
    }

    for (const orbit of snapshot.fields) {
      insertDbFieldOrbit(db, snapshot.rootSrc, orbit)
    }
  })

  tx()
}

/**
 * Bulk-read: собирает полный `DbWorldSnapshot` из DB для одного `rootSrc`.
 *
 * @deprecated Промежуточная обёртка для устаревшего snapshot-payload-flow. Новые потребители
 *   читают через {@link selectAllParticleShells} + {@link selectAllFieldOrbits}, а в перспективе —
 *   через subtree-queries для lazy viewport.
 */
export const readDbWorldSnapshot = (db: Database, rootSrc: string): DbWorldSnapshot => ({
  rootSrc,
  particles: selectAllParticleShells(db, rootSrc),
  fields: selectAllFieldOrbits(db, rootSrc),
})
