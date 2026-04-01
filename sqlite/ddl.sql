PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS metas (
  name TEXT PRIMARY KEY CHECK (length(trim(name)) > 0),
  desc TEXT,
  viewCss TEXT,
  massSource TEXT
);

CREATE TABLE IF NOT EXISTS fields (
  id INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  key TEXT NOT NULL CHECK (length(trim(key)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL CHECK (
    type IN ('string', 'number', 'boolean', 'array<string>', 'array<number>', 'enum<string>', 'enum<number>')
  ),
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  label TEXT,
  identifier INTEGER NOT NULL DEFAULT 0 CHECK (identifier IN (0, 1)),
  dataSource TEXT,
  UNIQUE (id, metaName),
  UNIQUE (id, metaName, type),
  UNIQUE (metaName, key),
  UNIQUE (metaName, position),
  CHECK (dataSource IS NULL OR type IN ('array<string>', 'array<number>')),
  CHECK (identifier = 0 OR (required = 1 AND type IN ('string', 'number', 'boolean', 'enum<string>', 'enum<number>'))),
  FOREIGN KEY (metaName) REFERENCES metas(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_string_defaults (
  fieldId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'string' CHECK (type = 'string'),
  defaultValue TEXT NOT NULL,
  FOREIGN KEY (fieldId, metaName, type) REFERENCES fields(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_number_defaults (
  fieldId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'number' CHECK (type = 'number'),
  defaultValue REAL NOT NULL,
  FOREIGN KEY (fieldId, metaName, type) REFERENCES fields(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_boolean_defaults (
  fieldId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'boolean' CHECK (type = 'boolean'),
  defaultValue INTEGER NOT NULL CHECK (defaultValue IN (0, 1)),
  FOREIGN KEY (fieldId, metaName, type) REFERENCES fields(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_array_defaults (
  fieldId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('array<string>', 'array<number>')),
  defaultJson TEXT NOT NULL CHECK (json_valid(defaultJson) AND json_type(defaultJson) = 'array'),
  FOREIGN KEY (fieldId, metaName, type) REFERENCES fields(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS field_enum_variants (
  fieldId INTEGER NOT NULL,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('enum<string>', 'enum<number>')),
  position INTEGER NOT NULL CHECK (position >= 0),
  textValue TEXT,
  numberValue REAL,
  PRIMARY KEY (fieldId, position),
  UNIQUE (fieldId, textValue),
  UNIQUE (fieldId, numberValue),
  FOREIGN KEY (fieldId, metaName, type) REFERENCES fields(id, metaName, type) ON DELETE CASCADE,
  CHECK (
    (type = 'enum<string>' AND textValue IS NOT NULL AND numberValue IS NULL)
    OR
    (type = 'enum<number>' AND textValue IS NULL AND numberValue IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS field_enum_defaults (
  fieldId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('enum<string>', 'enum<number>')),
  position INTEGER NOT NULL CHECK (position >= 0),
  FOREIGN KEY (fieldId, metaName, type) REFERENCES fields(id, metaName, type) ON DELETE CASCADE,
  FOREIGN KEY (fieldId, position) REFERENCES field_enum_variants(fieldId, position) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS states (
  id INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (id, metaName),
  UNIQUE (metaName, name),
  UNIQUE (metaName, position),
  FOREIGN KEY (metaName) REFERENCES metas(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transitions (
  id INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  fromStateId INTEGER NOT NULL,
  toStateId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  UNIQUE (id, metaName),
  UNIQUE (fromStateId, toStateId),
  UNIQUE (fromStateId, position),
  FOREIGN KEY (metaName) REFERENCES metas(name) ON DELETE CASCADE,
  FOREIGN KEY (fromStateId, metaName) REFERENCES states(id, metaName) ON DELETE CASCADE,
  FOREIGN KEY (toStateId, metaName) REFERENCES states(id, metaName) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transition_conditions (
  metaName TEXT NOT NULL,
  transitionId INTEGER NOT NULL,
  fieldId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  conditionJson TEXT NOT NULL CHECK (json_valid(conditionJson)),
  PRIMARY KEY (transitionId, fieldId),
  UNIQUE (transitionId, position),
  FOREIGN KEY (transitionId, metaName) REFERENCES transitions(id, metaName) ON DELETE CASCADE,
  FOREIGN KEY (fieldId, metaName) REFERENCES fields(id, metaName) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processes (
  id INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  key TEXT NOT NULL CHECK (length(trim(key)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL CHECK (type IN ('action', 'finally')),
  label TEXT,
  desc TEXT,
  actionSrc TEXT,
  actionImportSpecifier TEXT,
  successSrc TEXT,
  errorSrc TEXT,
  beforeSrc TEXT,
  UNIQUE (id, metaName),
  UNIQUE (id, metaName, type),
  UNIQUE (metaName, key),
  UNIQUE (metaName, position),
  CHECK (
    (type = 'action' AND actionSrc IS NOT NULL AND beforeSrc IS NULL)
    OR
    (
      type = 'finally'
      AND beforeSrc IS NOT NULL
      AND actionSrc IS NULL
      AND actionImportSpecifier IS NULL
      AND successSrc IS NULL
      AND errorSrc IS NULL
    )
  ),
  CHECK (actionSrc IS NOT NULL OR actionImportSpecifier IS NULL),
  FOREIGN KEY (metaName) REFERENCES metas(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_envs (
  metaName TEXT NOT NULL,
  processId INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('action', 'finally')),
  position INTEGER NOT NULL CHECK (position >= 0),
  env TEXT NOT NULL CHECK (env IN ('browser', 'node', 'worker', 'server', 'any')),
  PRIMARY KEY (processId, position),
  UNIQUE (processId, env),
  FOREIGN KEY (processId, metaName, type) REFERENCES processes(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_reads (
  metaName TEXT NOT NULL,
  processId INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('action', 'finally')),
  fieldId INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('action', 'success', 'error', 'before')),
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (processId, phase, fieldId),
  UNIQUE (processId, phase, position),
  CHECK (
    (type = 'action' AND phase IN ('action', 'success', 'error'))
    OR
    (type = 'finally' AND phase = 'before')
  ),
  FOREIGN KEY (processId, metaName, type) REFERENCES processes(id, metaName, type) ON DELETE CASCADE,
  FOREIGN KEY (fieldId, metaName) REFERENCES fields(id, metaName) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS process_writes (
  metaName TEXT NOT NULL,
  processId INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'action' CHECK (type = 'action'),
  fieldId INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('success', 'error')),
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (processId, phase, fieldId),
  UNIQUE (processId, phase, position),
  FOREIGN KEY (processId, metaName, type) REFERENCES processes(id, metaName, type) ON DELETE CASCADE,
  FOREIGN KEY (fieldId, metaName) REFERENCES fields(id, metaName) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  key TEXT NOT NULL CHECK (length(trim(key)) > 0),
  position INTEGER NOT NULL CHECK (position >= 0),
  label TEXT NOT NULL,
  desc TEXT,
  condSource TEXT NOT NULL,
  updateSource TEXT NOT NULL,
  UNIQUE (id, metaName),
  UNIQUE (metaName, key),
  UNIQUE (metaName, position),
  FOREIGN KEY (metaName) REFERENCES metas(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_states (
  metaName TEXT NOT NULL,
  reactionId INTEGER NOT NULL,
  stateId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (reactionId, stateId),
  UNIQUE (reactionId, position),
  FOREIGN KEY (reactionId, metaName) REFERENCES reactions(id, metaName) ON DELETE CASCADE,
  FOREIGN KEY (stateId, metaName) REFERENCES states(id, metaName) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_reads (
  metaName TEXT NOT NULL,
  reactionId INTEGER NOT NULL,
  fieldId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (reactionId, fieldId),
  UNIQUE (reactionId, position),
  FOREIGN KEY (reactionId, metaName) REFERENCES reactions(id, metaName) ON DELETE CASCADE,
  FOREIGN KEY (fieldId, metaName) REFERENCES fields(id, metaName) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reaction_writes (
  metaName TEXT NOT NULL,
  reactionId INTEGER NOT NULL,
  fieldId INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (reactionId, fieldId),
  UNIQUE (reactionId, position),
  FOREIGN KEY (reactionId, metaName) REFERENCES reactions(id, metaName) ON DELETE CASCADE,
  FOREIGN KEY (fieldId, metaName) REFERENCES fields(id, metaName) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_nodes (
  id INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  parentId INTEGER,
  position INTEGER NOT NULL CHECK (position >= 0),
  type TEXT NOT NULL CHECK (type IN ('map', 'cond', 'log', 'text', 'el', 'meta')),
  UNIQUE (id, metaName),
  UNIQUE (id, metaName, type),
  FOREIGN KEY (metaName) REFERENCES metas(name) ON DELETE CASCADE,
  FOREIGN KEY (parentId, metaName) REFERENCES matter_nodes(id, metaName) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_map_nodes (
  nodeId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'map' CHECK (type = 'map'),
  dataPath TEXT NOT NULL CHECK (length(trim(dataPath)) > 0),
  FOREIGN KEY (nodeId, metaName, type) REFERENCES matter_nodes(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_condition_nodes (
  nodeId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'cond' CHECK (type = 'cond'),
  dataJson TEXT NOT NULL CHECK (json_valid(dataJson) AND json_type(dataJson) IN ('text', 'array')),
  expr TEXT,
  FOREIGN KEY (nodeId, metaName, type) REFERENCES matter_nodes(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_logical_nodes (
  nodeId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'log' CHECK (type = 'log'),
  dataJson TEXT NOT NULL CHECK (json_valid(dataJson) AND json_type(dataJson) IN ('text', 'array')),
  expr TEXT,
  FOREIGN KEY (nodeId, metaName, type) REFERENCES matter_nodes(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_text_nodes (
  nodeId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type = 'text'),
  dataJson TEXT,
  staticValue TEXT,
  expr TEXT,
  CHECK (
    (staticValue IS NOT NULL AND dataJson IS NULL AND expr IS NULL)
    OR
    (staticValue IS NULL AND (dataJson IS NULL OR (json_valid(dataJson) AND json_type(dataJson) IN ('text', 'array'))))
  ),
  FOREIGN KEY (nodeId, metaName, type) REFERENCES matter_nodes(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_element_nodes (
  nodeId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'el' CHECK (type = 'el'),
  tag TEXT NOT NULL CHECK (length(trim(tag)) > 0),
  eventJson TEXT CHECK (eventJson IS NULL OR (json_valid(eventJson) AND json_type(eventJson) = 'object')),
  booleanJson TEXT CHECK (booleanJson IS NULL OR (json_valid(booleanJson) AND json_type(booleanJson) = 'object')),
  arrayJson TEXT CHECK (arrayJson IS NULL OR (json_valid(arrayJson) AND json_type(arrayJson) = 'object')),
  stringJson TEXT CHECK (stringJson IS NULL OR (json_valid(stringJson) AND json_type(stringJson) = 'object')),
  styleJson TEXT CHECK (styleJson IS NULL OR (json_valid(styleJson) AND json_type(styleJson) = 'object')),
  FOREIGN KEY (nodeId, metaName, type) REFERENCES matter_nodes(id, metaName, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS matter_meta_nodes (
  nodeId INTEGER PRIMARY KEY,
  metaName TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'meta' CHECK (type = 'meta'),
  tag TEXT NOT NULL CHECK (length(trim(tag)) > 0),
  srcJson TEXT NOT NULL CHECK (json_valid(srcJson) AND json_type(srcJson) IN ('text', 'object')),
  eventJson TEXT CHECK (eventJson IS NULL OR (json_valid(eventJson) AND json_type(eventJson) = 'object')),
  booleanJson TEXT CHECK (booleanJson IS NULL OR (json_valid(booleanJson) AND json_type(booleanJson) = 'object')),
  arrayJson TEXT CHECK (arrayJson IS NULL OR (json_valid(arrayJson) AND json_type(arrayJson) = 'object')),
  stringJson TEXT CHECK (stringJson IS NULL OR (json_valid(stringJson) AND json_type(stringJson) = 'object')),
  styleJson TEXT CHECK (styleJson IS NULL OR (json_valid(styleJson) AND json_type(styleJson) = 'object')),
  fieldsJson TEXT CHECK (fieldsJson IS NULL OR (json_valid(fieldsJson) AND json_type(fieldsJson) IN ('text', 'object'))),
  massJson TEXT CHECK (massJson IS NULL OR (json_valid(massJson) AND json_type(massJson) IN ('text', 'object'))),
  FOREIGN KEY (nodeId, metaName, type) REFERENCES matter_nodes(id, metaName, type) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS fields_by_meta
ON fields (metaName);

CREATE INDEX IF NOT EXISTS states_by_meta
ON states (metaName);

CREATE INDEX IF NOT EXISTS transitions_by_meta
ON transitions (metaName);

CREATE INDEX IF NOT EXISTS transition_conditions_by_meta
ON transition_conditions (metaName);

CREATE INDEX IF NOT EXISTS processes_by_meta
ON processes (metaName);

CREATE INDEX IF NOT EXISTS process_envs_by_meta
ON process_envs (metaName);

CREATE INDEX IF NOT EXISTS process_reads_by_meta
ON process_reads (metaName);

CREATE INDEX IF NOT EXISTS process_writes_by_meta
ON process_writes (metaName);

CREATE INDEX IF NOT EXISTS reactions_by_meta
ON reactions (metaName);

CREATE INDEX IF NOT EXISTS reaction_states_by_meta
ON reaction_states (metaName);

CREATE INDEX IF NOT EXISTS reaction_reads_by_meta
ON reaction_reads (metaName);

CREATE INDEX IF NOT EXISTS reaction_writes_by_meta
ON reaction_writes (metaName);

CREATE INDEX IF NOT EXISTS matter_nodes_by_meta
ON matter_nodes (metaName);

CREATE UNIQUE INDEX IF NOT EXISTS matter_root_order
ON matter_nodes (metaName, position) WHERE parentId IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS matter_child_order
ON matter_nodes (metaName, parentId, position) WHERE parentId IS NOT NULL;
