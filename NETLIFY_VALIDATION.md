# Netlify migration verification

## Local AI bridge (2026-10-31)

- Default cloud provider is now local Ollama; existing OpenAI keys are ignored unless `VCU_AI_PROVIDER=openai` is explicitly configured.
- Cloud test suite: 7 tests pass. Added live-worker gating, participant denial, atomic job claim, worker/lease isolation, progress ordering, idempotent completion, old-persona reuse, no OpenAI invocation, and disconnected-worker expiration.
- Python test suite: 17 tests pass, including local-only model host and HTTPS cloud restrictions.
- Netlify offline production build and Functions bundling pass.
- Local inference and hosted end-to-end verification: pending model installation at this checkpoint.
- Local model answers are real generation, not test substitutes. Failed generations retain partial text and failure status. Context overflow is rejected rather than silently trimming participant evidence.

## Earlier cloud/API verification

2026-10-31

- `npm run test:cloud`: 6 tests pass. Room/group privacy, revision conflicts, deadline enforcement, screen permissions, simultaneous conditional writes, latest individual-response references, prompt isolation, same-question comparison, request idempotency, login throttling, SSE parsing, interrupted runs, missing keys and incomplete-stream errors.
- Python `pytest`: 15 tests pass, including legacy local functionality and multi-export deduplication.
- Real locally cached multilingual Sentence-BERT successfully analyzed a synthetic Korean/English pair using the new export CLI (2 responses, 1 cosine pair). No workshop data was sent externally.
- React/TypeScript production build passes with and without `VITE_CLOUD=true`.
- `npx netlify-cli build --offline`: production build and Functions bundling pass.
- Netlify Dev with its local Blobs sandbox passed an HTTP rehearsal: login, workshop creation, KR/US joins, synchronized draw, answer save, other-group isolation, round close, JSON export and QR SVG. This verifies the actual adapter/storage SDK locally, not the hosted service.
- Cloud tests use an in-memory store and explicit test-only AI responses. These are not real deployment or paid API call verification. Production never substitutes these responses.
- Real Netlify deployment and actual OpenAI generation still require account configuration and have not yet been verified.
- Persistent data is held in Netlify Blobs with strong reads and conditional ETag writes. No client receives the API key or another group's individual drafts.
- Room data has a 5 MB ceiling to remain below function payload limits. Export and start a new workshop if reached. The API reports this explicitly instead of silently dropping revisions.
- Local SQLite data, backups, API keys, facilitator credentials, source manuals and participant exports are excluded from the GitHub upload.
- The cloud archive exports JSON and CSV. SBERT executes separately through `scripts/analyze_export.py`; cloud analysis-result upload is not implemented.

Before the workshop: configure Netlify server environment variables, deploy, create a workshop, join from two devices on different networks, confirm one KR and one US response, confirm English notes, and make one real two-persona API comparison. Download JSON afterwards. No browser/device visual rehearsal has been performed by the automated tests.

