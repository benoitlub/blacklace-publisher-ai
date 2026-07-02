---
name: Real/mock/error UI status semantics
description: How to classify connector/integration status indicators (real vs mock vs error) in UI badges
---

When a UI shows a real-vs-mock-vs-error indicator (e.g. 🟢/🟡/🔴) for an external integration (Notion, Mistral, etc.), classify strictly by the outcome of the call, not by whether an `error` field happens to be populated:

- 🟢 **real** — the call succeeded and returned live data (`connected: true`).
- 🟡 **mock** — the service fell back to mock data, whether because credentials are absent/not configured or because the fallback is the designed default. This is an expected, non-alarming state.
- 🔴 **error** — the request itself failed (network/HTTP error), i.e. something broke that should be investigated.

**Why:** A "never throws, always falls back to mock" service (per this project's Notion/Mistral integration design) sets a human-readable `error`/`fallbackReason` string on the mock response to explain *why* it's mocking (e.g. "NOTION_API_KEY not configured"). If the UI treats "any populated error string" as 🔴, then the normal, expected "no credentials yet" state gets flagged as a red alarm, which is misleading and inconsistent with how a sibling page (e.g. a connectors list) correctly shows the same state as 🟡.

**How to apply:** Derive status from the query's `isError`/thrown-exception state (→ 🔴) vs the payload's own `connected` boolean (→ 🟢 if true, else 🟡). Do not key status off the presence of a descriptive `error`/`reason` string in a successful (200) mock response.
