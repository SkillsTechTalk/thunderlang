// Intent AI event sink (intent-ai-events-v1) , the append-only log of intent-ai-v1
// integration events (declared, generated, verified, approved, rejected, modified,
// adopted, ...). The compiler already builds these events with `makeEvent`; this is
// where they are persisted, so a project keeps a durable audit trail of every AI
// action, who took it, and how the status changed. Pure and browser-safe: the CLI
// owns the JSON-Lines file, this module owns the shape and the read/write of it.

import { INTENT_AI_EVENTS } from './ai-core.mjs';

export const EVENT_LOG_SCHEMA = 'intent-ai-events-v1';

export function emptyEventLog() {
  return { schema: EVENT_LOG_SCHEMA, events: [] };
}

/** Append an event to the log. Returns a NEW log (append-only, never mutates). */
export function recordEvent(log, event) {
  if (!event || !INTENT_AI_EVENTS.includes(event.type)) {
    throw new Error(`intent ai events: unknown event type "${event?.type}"`);
  }
  const base = log && Array.isArray(log.events) ? log : emptyEventLog();
  return { ...base, events: [...base.events, event] };
}

/** Parse a JSON-Lines event log (one event per line; blank lines ignored). */
export function parseEventLog(jsonl) {
  const events = String(jsonl || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  return { schema: EVENT_LOG_SCHEMA, events };
}

/** Serialize a log back to JSON Lines (trailing newline when non-empty). */
export function serializeEventLog(log) {
  const events = log?.events || [];
  return events.length ? events.map((e) => JSON.stringify(e)).join('\n') + '\n' : '';
}

// ── Queries ──────────────────────────────────────────────────────────────────
const of = (log) => log?.events || [];
export const eventsFor = (log, implementationId) =>
  of(log).filter((e) => !implementationId || e.implementationId === implementationId);
export const eventsOfType = (log, type) => of(log).filter((e) => e.type === type);

/** A compact status timeline for one implementation: [{ type, at, by, from, to }]. */
export function timeline(log, implementationId) {
  return eventsFor(log, implementationId).map((e) => ({
    type: e.type,
    at: e.timestamp ?? null,
    by: e.actorId ?? null,
    from: e.previousStatus ?? null,
    to: e.newStatus ?? null,
  }));
}
