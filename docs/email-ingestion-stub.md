# Email Ingestion Stub (MVP)

This MVP includes `src/importers/emailIngestionStub.ts` as a non-operational interface for future email ingestion.

## Why stub only

- Local development must run without real email credentials.
- Current production path is CSV snapshot import.

## Planned implementation TODO

1. Add mailbox transport adapter (IMAP polling or provider webhook).
2. Parse attachment(s) and extract CSV content safely.
3. Route parsed CSV data through `importCsvSnapshot` service.
4. Add signature verification or trusted sender filtering.
5. Store ingestion metadata and failures in a dedicated table.
6. Add retry/dead-letter strategy for malformed emails.

## Local usage

The exported function is callable and returns a clear no-op result:

- `accepted: false`
- `reason: "Email ingestion is a stub..."`

No SMTP/IMAP credentials are required for local startup.