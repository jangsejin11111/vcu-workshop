# Netlify migration verification

## Local AI bridge (2026-10-31)

- Default cloud provider is now local Ollama; existing OpenAI keys are ignored unless `VCU_AI_PROVIDER=openai` is explicitly configured.
- Cloud test suite: 7 tests pass. Added live-worker gating, participant denial, atomic job claim, worker/lease isolation, progress ordering, idempotent completion, old-persona reuse, no OpenAI invocation, and disconnected-worker expiration.
- Python test suite: 18 tests pass, including local-only model host, HTTPS cloud restrictions and explicit context-overflow rejection.
- Netlify offline production build and Functions bundling pass.
- Real local inference and hosted end-to-end verification completed on 2026-10-31: Ollama 0.40.13, `qwen3:4b-instruct`, model digest `0edcdef34593eac1aa2be9c7d06c432dcf81945adca5eca2f27662c18f168ba0`, NVIDIA RTX 3080 Laptop GPU, context 32768.
- A real Korean greeting completed locally. A marked connection-test question submitted to the live Netlify workshop was queued, claimed by the local worker, generated for KR/US, and completed for both in approximately 13 seconds including polling/network time. Both answers were re-read from the workshop JSON export and matched the live state. No OpenAI call or synthetic response was used.
- The actual connection-test record is retained in the workshop. Participant data and exported answers are not committed to GitHub. Browser visual/device testing is separate from this HTTP end-to-end verification.
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

