# Tool Usage

This rule defines when tools or skills should be used instead of manual work.

## Purpose

Use tools for mechanical, repeatable, or specialized operations so rules can stay semantic and compact.

## When to apply

Apply this rule when a task includes:

- deterministic formatting;
- repetitive transformation;
- boilerplate generation;
- narrow technical processing better handled by a tool.

## Requirements

Put in tools:

- mechanical formatting;
- repetitive generation;
- deterministic cleanup;
- narrow specialized processing.

Keep in rules:

- architecture decisions;
- code semantics;
- naming logic;
- documentation intent;
- constraints that require understanding.

When a reliable tool exists for a mechanical step, use it instead of doing the step manually.

## Forbidden

Do not:

- describe tool internals inside a semantic rule;
- hardcode agent-specific tool brands into universal rules;
- perform large mechanical edits manually when a tool already exists;
- move architectural judgment into a tool-only policy.

## Checklist

- [ ] The task includes a mechanical or specialized step
- [ ] A tool is a better fit than manual work
- [ ] The rule still describes meaning, not mechanics
