# Graphs

This rule defines how to represent dependencies, structures, or type relationships as graphs.

## Purpose

Graphs should clarify structure, ownership, and relationships that are harder to understand from code alone.

## When to apply

Apply this rule when visualizing dependencies, type composition, package relationships, or state flow.

## Requirements

- Choose the smallest graph that answers the current question.
- Name nodes consistently.
- Make edge meaning explicit: dependency, ownership, flow, or composition.
- Prefer stable labels over visual decoration.
- Separate structural graphs from process graphs when they answer different questions.

If a graph includes types, show:

- the type name;
- the source module or package when relevant;
- only the fields needed for the current explanation.

## Forbidden

Do not:

- overload one diagram with unrelated relationships;
- use visuals as decoration without semantic purpose;
- include every field or edge by default;
- mix multiple meanings on the same edge style without explanation.

## Checklist

- [ ] The graph answers one clear question
- [ ] Node names are consistent
- [ ] Edge meaning is explicit
- [ ] Only necessary detail is shown
