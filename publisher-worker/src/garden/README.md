# Garden public metadata contract

Canonical source: `benoitlub/poulpe-fiction`, `src/garden-gege/`.
The five files contracts.ts, core.mjs, core.d.mts, feed.mjs and feed.d.mts are mirrored byte-for-byte for the read-only Worker endpoint. Update them together and run both repositories' contract/adapter tests. No private source payload is part of this contract.

The endpoint reads fixed public GitHub source files pinned to one revision and the existing Octopus /events read route. It never initializes SQL schema, registers adapters, runs missions, or calls publication/generation routes. Harvest evidence is recorded by Poulpe from Publisher outputs; this is not a direct Neon feed. See Poulpe's docs/jardin-gege/READONLY-FEED.md for the source audit and operational limits.
