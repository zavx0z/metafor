# 🧩 @metafor/inspect — Actor Debugging

[← Main](../../README.md) | **English** | [Русский](README.ru.md)

A tool for step-by-step debugging and analysis of actor behavior in MetaFor. Implements three approaches to debugging asynchronous and parallel code, each providing different levels of control over time, context, and execution order.

---

## 🎯 Approaches Overview

| Approach                 | Goal                    | Key Idea                                                | Status         |
| :----------------------- | :---------------------- | :------------------------------------------------------ | :------------- |
| **1. Depth‑First Trace** | View call sequences     | Recursive traversal deep into asynchronous actor chains | ✅ Implemented |
| **2. Snapshot & Replay** | Analyze state over time | Save snapshots and replay execution history             | 🕓 In Progress |
| **3. Logical Threads**   | Manage parallel tasks   | Split async calls into logical threads                  | 🕓 In Progress |

---

## 🔍 Debugging Approaches

### 1. Depth‑First Trace (implemented)

**Deep traversal** — linear representation of asynchronous actor calls as a single stack.  
Asynchronous chains are recursively unfolded, allowing to view execution context "in depth" without breaking the logic of interaction between actors.

**Advantages:**

- ✅ Convenient for analyzing actor action sequences
- ✅ Integrated with MetaFor task system (TaskType, Electromagnetic)
- ✅ Used by default as the main tracing mode

**Limitations:**

- ⚠️ Doesn't reflect real execution order (`event loop` remains outside the model)

### 2. Snapshot & Replay (in progress)

**Snapshots and rollbacks** — mechanism for recording actor state and reversible changes (patches) with playback capability.  
Allows "rewinding" execution to any point in history, analyzing side effects and actor system state over time.

**Capabilities:**

- ✅ Restore or repeat any sequence of actor events
- 🕓 Implementation through `Field.getSnapshotByLastMessage()` and actor snapshot system
- 🕓 Integration with MetaFor context and state system

**Requirements:**

- ⚠️ Requires meta-actors for most external resources (WebSocket, timers, etc.)

### 3. Logical Threads (in progress)

**Logical threads** — model of step-by-step execution of asynchronous tasks as separate "virtual stacks".  
Virtual stacks are the actors themselves. This is the ability to debug branches of the interaction graph between actors.

**Capabilities:**

- ✅ Deterministic control of parallel actor scenarios
- ✅ Partially implemented through task system and stack management in `Electromagnetic`
- 🕓 Integration with actor state and transition system

**Plans:**

- 📌 Full integration with BroadcastChannel system and inter-actor messaging

---

## 🚀 Quick Start

### Web Component `meta-inspect`

Web component for step-by-step debugging of actors in the browser with intuitive control interface.

#### Setup

1. **Import module:**

   ```html
   <script type="module" src="@metafor/inspect/web/debugger"></script>
   ```

2. **Add component:**

   ```html
   <!-- with pause on start -->
   <meta-inspect brk></meta-inspect>

   <!-- without pause on start -->
   <meta-inspect></meta-inspect>
   ```

#### Attributes

- **`brk`** — when present, pauses the system immediately after component connection. Removing the attribute unpauses

---

## ⚙️ Functionality

### ✅ Implemented

- **Control element:** fixed panel with buttons — "reload", "pause/resume", "step"
- **Pause/resume:** global actor system (`Actor.break()` / `Actor.resume()`)
- **Step execution:** next message (`Actor.step()`)
- **Start pause:** through `brk` attribute
- **State indicator:** button shows action — ▶ (resume), ⏸ (pause)

### 🕓 In Development

- [ ] **Slow motion:** step execution with delay
- [ ] **Logger integration:** into debugger for detailed analysis
- [ ] **Breakpoints:** by message parameters (meta, actor, path, timestamp, src, patches)

---

## 📋 TODO

- [ ] Pause/resume
- [x] Step
- [x] Reload
- [ ] Slow motion (slow‑mo)
- [x] Start breakpoint (`brk`)
- [ ] Logger integration in debugger
- [ ] Breakpoints by message parameters

---

[← Main](../../README.md) | **English** | [Русский](README.ru.md)
