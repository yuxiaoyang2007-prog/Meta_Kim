# Path Selection

Choose the smallest path that can honestly satisfy the real product problem.

## Paths

- `fast_path`: pure read-only query, local evidence enough, no write, no durable artifact, no handoff. It may set `queryBypass: true`, but only for read-only tools.
- `standard_path`: executable work with limited risk. Use Critical -> Fetch -> Thinking -> Execution -> Review -> Verification -> Evolution.
- `regulated_path`: security, release, install, cross-runtime, public-ready, governance-contract, or high-blast-radius work. Use all gates, explicit evidence, Meta-Review when review quality matters, and fresh verification.

## Rules

- If multiple interpretations change output, ask one blocking clarification.
- If a simpler approach solves the real pain, state it and use it.
- Smallest path is not automatically the minimal fix. If the real pain suggests a route, product, validation, owner, install, or abstraction change, compare the minimal fix against the ten-x path shift before choosing.
- Fuzzy user intent is not a fast path just because the requested artifact is small. If the user has not decided the outcome, audience, success standard, or product direction, keep the work in Critical / Thinking until the route is honest.
- If evidence is missing but cheap to gather, Fetch first.
- If capability is missing, return to Thinking or create `capabilityGapPacket`; do not invent a fallback owner.
