import { Database } from "bun:sqlite"
import type { DbFieldOrbitSnapshot, DbParticleShellSnapshot, DbWorldSnapshot } from "./instance.t.ts"

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

CREATE TABLE IF NOT EXISTS db_field_orbit (
  id TEXT PRIMARY KEY,
  root_src TEXT NOT NULL,
  particle_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_order INTEGER NOT NULL CHECK (field_order >= 0),
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

const insertParticleShell = (db: Database, rootSrc: string, shell: DbParticleShellSnapshot): void => {
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

const insertFieldOrbit = (db: Database, rootSrc: string, orbit: DbFieldOrbitSnapshot): void => {
  db.query(
    `INSERT INTO db_field_orbit (
      id,
      root_src,
      particle_id,
      field_key,
      field_label,
      field_order,
      value_text,
      local_x,
      local_y,
      local_z,
      sphere_radius,
      color_r,
      color_g,
      color_b
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    orbit.id,
    rootSrc,
    orbit.particleId,
    orbit.fieldKey,
    orbit.fieldLabel,
    orbit.fieldOrder,
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
}

export const openDbInstanceSqlite = (options: DbInstanceSqliteOptions = {}): Database => {
  const db = new Database(options.filename ?? ":memory:")
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

export const writeDbWorldSnapshot = (db: Database, snapshot: DbWorldSnapshot): void => {
  initializeDbInstanceSqliteSchema(db)

  const tx = db.transaction(() => {
    db.query(`DELETE FROM db_field_orbit WHERE root_src = ?`).run(snapshot.rootSrc)
    db.query(`DELETE FROM db_particle_shell WHERE root_src = ?`).run(snapshot.rootSrc)

    for (const shell of snapshot.particles) {
      insertParticleShell(db, snapshot.rootSrc, shell)
    }

    for (const orbit of snapshot.fields) {
      insertFieldOrbit(db, snapshot.rootSrc, orbit)
    }
  })

  tx()
}

export const readDbWorldSnapshot = (db: Database, rootSrc: string): DbWorldSnapshot => {
  initializeDbInstanceSqliteSchema(db)

  const particles = (
    db.query(
      `SELECT
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
       FROM db_particle_shell
       WHERE root_src = ?
       ORDER BY depth, shell_order, particle_id`,
    ).all(rootSrc) as Array<{
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
    }>
  ).map((row) => ({
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
    }))

  const fields = (
    db.query(
      `SELECT
         id,
         particle_id,
         field_key,
         field_label,
         field_order,
         value_text,
         local_x,
         local_y,
         local_z,
         sphere_radius,
         color_r,
         color_g,
         color_b
       FROM db_field_orbit
       WHERE root_src = ?
       ORDER BY particle_id, field_order, id`,
    ).all(rootSrc) as Array<{
      id: string
      particle_id: string
      field_key: string
      field_label: string
      field_order: number
      value_text: string | null
      local_x: number
      local_y: number
      local_z: number
      sphere_radius: number
      color_r: number
      color_g: number
      color_b: number
    }>
  ).map((row) => ({
      id: row.id,
      particleId: row.particle_id,
      fieldKey: row.field_key,
      fieldLabel: row.field_label,
      fieldOrder: row.field_order,
      valueText: row.value_text,
      localX: row.local_x,
      localY: row.local_y,
      localZ: row.local_z,
      sphereRadius: row.sphere_radius,
      colorR: row.color_r,
      colorG: row.color_g,
      colorB: row.color_b,
    }))

  return {
    rootSrc,
    particles,
    fields,
  }
}
