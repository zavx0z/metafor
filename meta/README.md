# MetaFor

**English** | [Русский](README.ru.md)

> ⚠️ **Project Status**: MetaFor is currently in active development phase. Documentation may contain inaccuracies and is subject to change as the framework evolves.  
> 🚨 **Production Use**: Use in production at your own risk. The framework is not yet stable and may contain breaking changes.  
> 🌍 **Language Note**: The author is a native Russian speaker and Russian text may be found throughout the codebase. When the framework reaches its first stable version, everything will be translated to English.

**MetaFor** is a modern VanillaJS framework for creating real-time web applications based on a context-oriented finite state machine with declarative API, type safety, and reactivity. Works both on client and server.

## 🚀 Key Features

- **Context-oriented finite state machine** — states and transitions depend on context
- **Universal JavaScript** — works both on client and server
- **Real-time updates** — instant response to state changes without reload
- **Type safety** — full TypeScript typing for all components
- **Reactivity** — automatic UI updates when state changes
- **Processes** — actions with success/error handling (async and sync)
- **Reactions** — declarative filters for handling external events
- **Templating** — modern template API with `@zavx0z/template`
- **Zero-build** — works without bundlers and compilation
- **Positional paths** — unique VDOM paths for each actor
- **Actor hierarchy** — managing actor tree with automatic path generation
- **Extended filters** — context access in reactions with declarative conditions

## 🎯 Quick Start

```typescript
const counter = MetaFor("counter")
  .context((types) => ({
    count: types.number.required(0),
    isLoading: types.boolean.required(false),
  }))
  .states({
    idle: { loading: {} },
    loading: {
      success: { count: { qt: 0 } },
      error: { isLoading: false },
    },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return { count: context.count + 1 }
      })
      .success(({ update, data }) => update({ count: data.count, isLoading: false }))
      .error(({ update }) => update({ isLoading: false })),
  }))
  .reactions()
  .view({
    render: ({ context, html }) => html`
      <div>
        <h1>Counter: ${context.count}</h1>
        <button ?disabled=${context.isLoading}>${context.isLoading ? "Loading..." : "Increment"}</button>
      </div>
    `,
  })
```

## 🏗️ Architecture

MetaFor consists of several key components:

### 1. Context

Context is a typed component state that automatically updates the UI when changes occur.

```typescript
.context((types) => ({
  // Required fields
  name: types.string.required("Anonymous"),
  age: types.number.required(18),
  isActive: types.boolean.required(false),

  // Optional fields
  email: types.string.optional(),
  avatar: types.string.optional(),

  // Arrays
  tags: types.array.required([]),

  // Enum
  status: types.enum.required(["pending", "active", "blocked"]),
}))
```

**Supported types:**

- `string` — strings
- `number` — numbers
- `boolean` — boolean values
- `array` — arrays
- `enum` — enumerations

### 2. States

States define possible automaton transitions with conditions.

```typescript
.states({
  guest: {
    // Transition to user when conditions are met
    user: {
      name: { length: { min: 2 } },
      email: { pattern: /@/ }
    }
  },
  user: {
    // Transition to admin when isAdmin: true
    admin: { isAdmin: true },
    // Transition to guest when logout: true
    guest: { logout: true }
  },
  admin: {
    user: { isAdmin: false }
  }
})
```

**Transition conditions:**

For strings:

```typescript
name: {
  eq: "admin",           // equals
  startsWith: "user",    // starts with
  endsWith: "admin",     // ends with
  include: "test",       // contains substring
  pattern: /^[a-z]+$/,   // regular expression
  length: { min: 3, max: 20 } // length
}
```

For numbers:

```typescript
age: {
  eq: 18,        // equals
  gt: 0,         // greater than
  gte: 18,       // greater than or equal
  lt: 100,       // less than
  lte: 65,       // less than or equal
  between: [18, 65] // range
}
```

For boolean values:

```typescript
isActive: {
  eq: true,      // equals
  notEq: false   // not equals
}
```

For arrays:

```typescript
tags: {
  length: { min: 1 },    // length
  includes: "admin",     // contains element
  isEmpty: false         // not empty
}
```

### 3. Core — complex data storage

Core is an object for storing complex data structures, services, and DOM references that should not be stored in context.

```typescript
.core((ref) => ({
  // Collections and objects
  users: new Map<number, User>(),
  cache: new LRUCache(),
  settings: { theme: 'dark', lang: 'ru' },

  // Connections and services
  socket: null as WebSocket | null,
  apiService: new ApiService(),
  database: new DatabaseConnection(),

  // DOM element references
  formRef: ref(),        // creates form reference
  inputRef: ref(),       // creates input reference
  canvasRef: ref(),      // creates canvas reference
  modalRef: ref()        // creates modal reference
}))
```

**Core Features:**

- **Complex object storage**: Map, Set, classes, services
- **DOM elements**: for direct access to DOM elements
- **Persistence**: Core persists between renders
- **Availability**: Core is available in all processes, reactions, and views

**Using DOM elements:**

```typescript
.view({
  render: ({ context, core, html, update }) => html`
    <form onsubmit=${(e) => {
      e.preventDefault()
      // work with form data
    }}>
      <input
        type="text"
        value=${context.name}
      />
      <canvas></canvas>
    </form>
  `,

  onMount: ({ core }) => {
    // Access to DOM elements after mounting
    if (core.canvasRef.current) {
      const ctx = core.canvasRef.current.getContext('2d')
      // canvas initialization
    }

    // Focus on input
    core.inputRef.current?.focus()
  }
})
```

### 4. Processes

Processes are actions executed when entering a state. **IMPORTANT: Process name must exactly match the state name.**

**Key rules:**

- ✅ Process name = state name
- ✅ Process executes automatically when entering state
- ✅ action can be async or sync
- ✅ success and error are always synchronous

```typescript
.processes((process) => ({
  // Async process for "loading" state
  loading: process({
    label: "Authentication",
    desc: "User login process"
  })
    .action(async ({ context }) => {
      // Main logic
      const response = await fetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({
          email: context.email,
          password: context.password
        })
      })

      if (!response.ok) {
        throw new Error('Authentication error')
      }

      return await response.json()
    })
    .success(({ update, data }) => {
      // Success handling
      update({
        isAuthenticated: true,
        user: data.user,
        error: ""
      })
    })
    .error(({ update, error }) => {
      // Error handling
      update({
        error: error.message,
        isAuthenticated: false
      })
    }),

  // Sync process for "save" state
  save: process({
    label: "Data saving"
  })
    .action(({ context, core }) => {
      // Sync logic
      const data = {
        name: context.name,
        email: context.email,
        timestamp: Date.now()
      }
      localStorage.setItem('userData', JSON.stringify(data))
      core.cache.set('lastSave', data)
      return data
    })
    .success(({ update, data }) => {
      update({
        lastSaved: data.timestamp,
        isDirty: false,
        saveError: ""
      })
    })
    .error(({ update, error }) => {
      update({
        saveError: error.message,
        isDirty: true
      })
    }),

  // Process without action (only for context changes)
  reset: process()
    .success(({ update }) => {
      update({
        name: "",
        email: "",
        isDirty: false,
        error: ""
      })
    })
}))
```

### 5. Reactions

Reactions allow handling messages from other components through declarative filters. **IMPORTANT: `meta` in the filter is the sender component name, not an arbitrary string.**

```typescript
// First, get component names for filtering
const userComponentName = "user-component" // user component name
const adminComponentName = "admin-component" // admin component name

  .reactions((reaction) => [
    [
      ["idle", "loading"], // States in which reaction is active
      reaction({ label: "Handling messages from user component" })
        .filter({
          meta: userComponentName, // Sender component meta hash
          op: "replace", // Operation: "add" | "replace" | "remove" | "test"
          path: "/context", // Path: "/" | "/context" | "/state"
          value: { userId: { gt: 0 } }, // Value conditions
        })
        .equal(({ update, context, meta, actor, timestamp, patch, core }) => {
          // Message handling
          const user = core.users.get(patch.value.userId)
          update({
            selectedUser: user,
            lastMessageTime: timestamp,
            messageCount: context.messageCount + 1,
            actorIndex: actor.index, // Access to actor index
          })
        }),
    ],
    [
      ["idle"], // Reaction only in idle state
      reaction({ label: "Handling commands from admin component" })
        .filter({
          meta: adminComponentHash,
          op: "add",
          path: "/",
        })
        .equal(({ update, patch }) => {
          console.log("Command received:", patch.value)
          update({ adminCommand: patch.value })
        }),
    ],
  ])
```

**Reaction filters:**

- `meta` — sender component name (must use variable with name)
- `op` — operation: `"add"` | `"replace"` | `"remove"` | `"test"`
- `path` — change path: `"/"` | `"/context"` | `"/state"`
- `value` — value conditions (same as in states)
- `index` — actor index relative to siblings in parent (for uniqueness)
- `timestamp` — message send timestamp

**New array filters:**

- `in` — check value inclusion in array:
  - For strings: `meta: { in: ["admin", "user"] }` or `actor: { in: ["actor-1", "actor-2"] }`
  - For numbers: `value: { in: [1, 2, 3] }`
- `notIn` — check value absence in array:
  - For strings: `meta: { notIn: ["banned", "suspended"] }` or `actor: { notIn: ["blocked-1", "blocked-2"] }`
  - For numbers: `value: { notIn: [0, 4, 6] }`

### 6. View

View defines component UI using `@zavx0z/template` API.

```typescript
.view({
  render: ({ context, html, update }) => html`
    <div class="user-profile">
      <h1>${context.name}</h1>

      ${context.isLoading
        ? html`<div class="loading">Loading...</div>`
        : html`
          <form @submit=${(e) => {
            e.preventDefault()
            update({ isLoading: true })
          }}>
            <input
              value=${context.email}
              oninput=${(e) => update({ email: e.target.value })}
              placeholder="Email"
            />
            <button type="submit" ?disabled=${!context.email}>
              Save
            </button>
          </form>
        `
      }

      ${context.error
        ? html`<div class="error">${context.error}</div>`
        : null
      }
    </div>
  `,

  style: ({ css }) => css`
    .user-profile {
      padding: 20px;
      border: 1px solid #ccc;
      border-radius: 8px;
    }

    .loading {
      color: #666;
      font-style: italic;
    }

    .error {
      color: red;
      margin-top: 10px;
    }

    input {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      margin-right: 10px;
    }

    button {
      padding: 8px 16px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
  `
})
```

**HTML attributes:**

- `onclick`, `onchange` — event handlers: `onclick=${handler}`
- `attribute` — boolean attributes: `${isDisabled && "disabled"}`
- `value`, `class` — regular attributes: `value=${text}`

**JavaScript expressions:**

````typescript
// Conditional rendering with ternary operator
${context.isLoggedIn
  ? html`<div>Welcome, ${context.userName}!</div>`
  : html`<div>Please log in</div>`
}

// Conditional rendering with logical operator
${context.isLoading && html`<div class="spinner">Loading...</div>`}

// Loops with map
${context.items.map(item => html`<div>${item.name}</div>`)}

// Nested conditions
${state === "idle"
  ? html`<div>Waiting...</div>`
  : state === "loading"
    ? html`<div class="spinner">Loading...</div>`
    : state === "success"
      ? html`<div>Success!</div>`
      : html`<div class="error">Error!</div>`
}

// Loops with filter and map
${context.items
  .filter(item => item.visible)
  .map((item, index) => html`
    <li>
      ${index + 1}. ${item.name}
      <button onclick=${() => removeItem(item.id)}>Remove</button>
    </li>
  `)
}

// Simple array transformation
${context.tags.map(tag => html`<span class="tag">${tag}</span>`)}

### 7. Data passing between components

MetaFor supports data passing from parent component to child through `context` and `core` attributes.

```typescript
// First, create child components and get their names
const childUserComponent = MetaFor("child-user")
  .context((types) => ({
    userId: types.number.required(0),
    userName: types.string.required(""),
  }))
  .states({ idle: {} })
  .core((ref) => ({
    displayRef: ref()
  }))
  .processes()
  .reactions()
  .view({
    render: ({ context, core, html }) => html`
      <div ${ref(core.displayRef)}>
        <p>User ID: ${context.userId}</p>
        <p>User Name: ${context.userName}</p>
      </div>
    `,
  })

const childMessengerComponent = MetaFor("child-messenger")
  .context((types) => ({
    message: types.string.required(""),
  }))
  .states({ idle: {} })
  .core()
  .processes()
  .reactions()
  .view({
    render: ({ context, core, html }) => html`
      <div class="messenger">
        <p>Message: ${context.message}</p>
        ${core.socket ? html`<span class="status">🟢 Online</span>` : html`<span class="status">🔴 Offline</span>`}
      </div>
    `,
  })

// Parent component
const parentHash = MetaFor("parent")
  .context((types) => ({
    selectedUserId: types.number.required(1),
    currentMessage: types.string.required("Hello!"),
  }))
  .states({ idle: {} })
  .core((ref) => ({
    socket: new WebSocket('ws://localhost:8080'),
    apiService: new ApiService(),
    users: new Map([
      [1, { name: "John" }],
      [2, { name: "Mary" }]
    ])
  }))
  .processes()
  .reactions()
  .view({
    render: ({ context, core, html }) => {
      const user = core.users.get(context.selectedUserId)
      return html`
        <div class="container">
          <h1>Parent Component</h1>

          <!-- Context passing -->
          <meta-child-user
            context=${{
              userId: context.selectedUserId,
              userName: user?.name || "Unknown"
            }}>
          </meta-child-user>

          <!-- Core objects passing -->
          <meta-child-messenger
            context=${{
              message: context.currentMessage
            }}
            core=${{
              socket: core.socket,
              apiService: core.apiService
            }}>
          </meta-child-messenger>
        </div>
      `
    }
  })

// Root element creation
document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`
````

**Data passing features:**

**Context:**

- Passed through `context=${object}` attribute
- Automatically updates when parent context changes
- Contains only primitive data types

**Core:**

- Passed through `core=${object}` attribute
- Allows passing complex objects, services, connections
- Child component gets access to parent objects

**Important:**

- First create child components and save their names
- Use names in templates: `<meta-${name}>`
- Components are automatically registered on first MetaFor call

## 🏷️ Component System

MetaFor uses automatic component registration system to ensure uniqueness and isolation:

### How components work

1. **Component name** — identifier for registration
2. **Component is registered** automatically on first MetaFor call with this configuration
3. **Final element** is created with component name
4. **Registration happens automatically** on first MetaFor call with this configuration

### Usage example

```typescript
// Component creation
const component = MetaFor("user-profile")
  .context((types) => ({
    name: types.string.required(""),
    email: types.string.required(""),
  }))
  .states({ idle: {} })
  .core()
  .processes()
  .reactions()
  .view({
    render: ({ context, html }) => html`<div>${context.name}</div>`,
  })

// Element creation
document.body.innerHTML = `<meta-user-profile></meta-user-profile>`

// Getting element for work
const element = document.querySelector(`meta-user-profile`)
```

### System advantages

- **Uniqueness**: Each configuration gets unique name
- **Isolation**: Components with different configurations don't conflict
- **Automation**: No need to come up with unique element names
- **Security**: Name conflicts between components are excluded

## 🔧 API Reference

### MetaFor(name: string, config?: { desc?: string; dev?: boolean })

Creates new MetaFor instance with specified component name.

**Important:** Component name is used to create element with tag `meta-${name}`.

```typescript
const component = MetaFor("my-component")
  .context(...)
  .states(...)
  .core(...)
  .processes(...)
  .reactions(...)
  .view(...)

// Component element: meta-my-component
document.body.innerHTML = `<meta-my-component></meta-my-component>`
```

### Chain API

MetaFor uses method chaining for configuration. `.view()` method returns component used for element creation:

```typescript
const component = MetaFor("example")
  .context(schema) // Context schema
  .states(config) // States configuration
  .core({}) // Core initialization
  .processes(config) // Processes configuration
  .reactions(config) // Reactions configuration
  .view(config) // View configuration and component return

// Element creation with component name
document.body.innerHTML = `<meta-example></meta-example>`
```

### Context

```typescript
.context((types) => ({
  // Required fields
  field: types.string.required(defaultValue),
  field: types.number.required(defaultValue),
  field: types.boolean.required(defaultValue),
  field: types.array.required(defaultValue),
  field: types.enum.required(values),

  // Optional fields
  field: types.string.optional(),
  field: types.number.optional(),
  field: types.boolean.optional(),
  field: types.array.optional(),
  field: types.enum.optional(values),
}))
```

### States

```typescript
.states({
  stateName: {
    nextState: conditions,
    anotherState: conditions,
  }
})
```

### Processes

```typescript
.processes((process) => ({
  processName: process(config?)
    .action(fn)
    .success(handler)
    .error(handler)
}))
```

### Reactions

```typescript
.reactions((reaction) => [
  [
    ["state1", "state2"],
    reaction(config?)
      .filter(conditions)
      .equal(handler)
  ]
])
```

### View

```typescript
.view({
  render: ({ context, html, update, ref }) => html`...`,
  style: ({ css }) => css`...`
})
```

## 🎨 Examples

### Counter with async loading

```typescript
const asyncCounterHash = MetaFor("async-counter")
  .context((types) => ({
    count: types.number.required(0),
    isLoading: types.boolean.required(false),
    error: types.string.optional(),
  }))
  .states({
    idle: { loading: {} },
    loading: {
      success: { count: { gt: 0 } },
      error: { error: { notEq: "" } },
    },
    success: { idle: {} },
    error: { idle: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        if (Math.random() > 0.8) {
          throw new Error("Random error")
        }
        return { count: context.count + 1 }
      })
      .success(({ update, data }) => {
        update({ count: data.count, isLoading: false, error: "" })
      })
      .error(({ update, error }) => {
        update({ error: error.message, isLoading: false })
      }),
  }))
  .reactions()
  .view({
    render: ({ context, html, update }) => html`
      <div class="counter">
        <h2>Counter: ${context.count}</h2>
        <button onclick=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Loading..." : "Increment"}
        </button>
        ${context.error ? html`<div class="error">${context.error}</div>` : null}
      </div>
    `,
    style: ({ css }) => css`
      .counter {
        text-align: center;
        padding: 20px;
      }
      .error {
        color: red;
        margin-top: 10px;
      }
      button:disabled {
        opacity: 0.5;
      }
    `,
  })

// Element creation
document.body.innerHTML = `<meta-${asyncCounterHash}></meta-${asyncCounterHash}>`
```

### Form with validation

```typescript
const userFormHash = MetaFor("user-form")
  .context((types) => ({
    name: types.string.required(""),
    email: types.string.required(""),
    age: types.number.required(0),
    errors: types.array.required([]),
    isSubmitting: types.boolean.required(false),
  }))
  .states({
    editing: {
      submitting: {
        name: { length: { min: 2 } },
        email: { pattern: /@/ },
        age: { gte: 18 },
      },
    },
    submitting: {
      success: { isSubmitting: false },
      error: { errors: { length: { gt: 0 } } },
    },
    success: { editing: {} },
    error: { editing: {} },
  })
  .core()
  .processes((process) => ({
    submitting: process()
      .action(async ({ context }) => {
        const errors = []

        if (context.name.length < 2) {
          errors.push("Name must contain at least 2 characters")
        }

        if (!context.email.includes("@")) {
          errors.push("Invalid email")
        }

        if (context.age < 18) {
          errors.push("Age must be at least 18 years")
        }

        if (errors.length > 0) {
          throw new Error(errors.join(", "))
        }

        // Simulate server submission
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return { success: true }
      })
      .success(({ update }) => {
        update({
          isSubmitting: false,
          errors: [],
          name: "",
          email: "",
          age: 0,
        })
      })
      .error(({ update, error }) => {
        update({
          isSubmitting: false,
          errors: error.message.split(", "),
        })
      }),
  }))
  .reactions()
  .view({
    render: ({ context, html, update }) => html`
      <form
        @submit=${(e) => {
          e.preventDefault()
          update({ isSubmitting: true })
        }}>
        <div>
          <label>Name:</label>
          <input value=${context.name} oninput=${(e) => update({ name: e.target.value })} placeholder="Enter name" />
        </div>

        <div>
          <label>Email:</label>
          <input
            value=${context.email}
            oninput=${(e) => update({ email: e.target.value })}
            placeholder="Enter email"
            type="email" />
        </div>

        <div>
          <label>Age:</label>
          <input
            value=${context.age}
            oninput=${(e) => update({ age: parseInt(e.target.value) || 0 })}
            type="number"
            min="0" />
        </div>

        <button type="submit" ?disabled=${context.isSubmitting}>
          ${context.isSubmitting ? "Submitting..." : "Submit"}
        </button>

        ${context.errors.length > 0
          ? html` <div class="errors">${context.errors.map((error) => html`<div class="error">${error}</div>`)}</div> `
          : null}
      </form>
    `,
    style: ({ css }) => css`
      form {
        max-width: 400px;
        margin: 0 auto;
        padding: 20px;
      }

      div {
        margin-bottom: 15px;
      }

      label {
        display: block;
        margin-bottom: 5px;
        font-weight: bold;
      }

      input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      button {
        width: 100%;
        padding: 10px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }

      button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }

      .errors {
        margin-top: 15px;
      }

      .error {
        color: red;
        margin-bottom: 5px;
      }
    `,
  })

// Element creation
document.body.innerHTML = `<meta-${userFormHash}></meta-${userFormHash}>`
```

### Context passing between components

```typescript
// First create child component and get its name
const childWidgetComponent = MetaFor("child-widget")
  .context((types) => ({
    message: types.string.required("Default message"),
    count: types.number.required(0),
  }))
  .states({ idle: {} })
  .core()
  .processes()
  .reactions()
  .view({
    render: ({ context, html }) => html`
      <div class="widget">
        <h3>Child Widget</h3>
        <p>Received message: ${context.message}</p>
        <p>Received counter: ${context.count}</p>
        <div class="status">Status: ${context.count > 0 ? "Active" : "Inactive"}</div>
      </div>
    `,
    style: ({ css }) => css`
      .widget {
        padding: 15px;
        border: 1px solid #28a745;
        border-radius: 6px;
        margin-top: 15px;
        background: #f8f9fa;
      }

      .status {
        margin-top: 10px;
        padding: 5px 10px;
        background: #28a745;
        color: white;
        border-radius: 4px;
        text-align: center;
      }
    `,
  })

// Parent component with dynamic updates
const parentHash = MetaFor("parent-dashboard")
  .context((types) => ({
    userMessage: types.string.required("Hello from parent"),
    userCount: types.number.required(0),
    isLoading: types.boolean.required(false),
  }))
  .states({
    idle: { loading: {} },
    loading: { idle: {} },
  })
  .core()
  .processes((process) => ({
    loading: process()
      .action(async ({ context }) => {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        return {
          userMessage: "Updated message from parent",
          userCount: context.userCount + 1,
        }
      })
      .success(({ update, data }) => {
        update({
          userMessage: data.userMessage,
          userCount: data.userCount,
          isLoading: false,
        })
      }),
  }))
  .reactions()
  .view({
    render: ({ context, html, update }) => html`
      <div class="dashboard">
        <h1>Parent Component</h1>
        <p>Message: ${context.userMessage}</p>
        <p>Counter: ${context.userCount}</p>

        <button onclick=${() => update({ isLoading: true })} ?disabled=${context.isLoading}>
          ${context.isLoading ? "Updating..." : "Update data"}
        </button>

        <meta-${childWidgetHash}
          context=${{
            message: context.userMessage,
            count: context.userCount,
          }}></meta-${childWidgetHash}>
      </div>
    `,
    style: ({ css }) => css`
      .dashboard {
        padding: 20px;
        border: 2px solid #007bff;
        border-radius: 8px;
        margin: 20px;
      }

      button {
        padding: 10px 20px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        margin: 10px 0;
      }

      button:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
    `,
  })

// Parent element creation
document.body.innerHTML = `<meta-${parentHash}></meta-${parentHash}>`
```

## 🔍 Debugging

MetaFor provides built-in debugging tools:

```typescript
// Enable debugging
import { enableMetaForDebug } from "@zavx0z/metafor/debug/config"

enableMetaForDebug()

// Get state snapshot
// Important: use correct element with component name
const component = MetaFor("my-component").context(...).states(...).core(...).processes(...).reactions(...).view(...)
const element = document.querySelector(`meta-my-component`)
const snapshot = element.getSnapshot()
console.log(snapshot)
```

## 📚 Additional Resources

- [Project examples](https://github.com/metafor/examples)
- [API documentation](https://api.metafor.space)
- [Migration guide](https://migration.metafor.space)

## TODO

- Reduce number of eval functions
  - Processes
    - action (parameters in process. import from modules/module)
    - success (context update data schema)
    - error (context update data schema)
- Optimize channels
  - separate state and context patches by different channels
  - include in lifecycle microtasks
