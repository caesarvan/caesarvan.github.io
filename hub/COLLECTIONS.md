# Reviewed public collections

Collection datasets are finite reviewed summaries, currently `devices`, `projects`, and `culture`. They are registered separately as `type: collection`; the four fixed domain-pipeline inputs remain family, health, knowledge, and system. The existing website coordinator owns the collection handoff; no new collection or schedule is implied.

Each UTF-8 JSON uses `schemaVersion: 1`, an exact matching `id`, title, summary, `status: partial | ready`, one explicit `sourceAsOf` anchor, `generatedAt`, coverage summary and gaps, individually dated sources, metrics, and stable items. Items have a stable id, genuine ISO date or null, status, tags and sourceId referencing a declared source. Unknown metric values are null, never fabricated zero. Metric units and dates retain the source context.

`datasets.json` declares availability separately from coverage. Use ready only for a loadable published file, preserve partial coverage, records = items.length, exact bytes and SHA-256. Retain sourceAsOf independently of generatedAt. Never treat HTTP success as proof of source completeness, research as deployment, intent as attendance, or a running process as unattended acceptance.

Public summaries exclude raw chat text, names and contact details, credentials, network addresses, local private paths, identity documents, raw health records, databases, attachments and photo originals. Review meaning as well as restricted patterns. Keep paused work paused. Source updates require evidence; unchanged summaries cause no timestamp-only commit.

The common home cards and detail renderer display state distribution, timeline, topics, source matrix and coverage; counts describe the included items and never an overall completion percentage. Data-status reads the live public registry without downloading all source bodies.
