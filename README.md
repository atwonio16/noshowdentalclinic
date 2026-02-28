# Confirmor (MVP)

Confirmor is an anti no-show rules engine for dental clinics.

## Scope (MVP)

- Clinics keep existing scheduling software.
- Confirmor ingests a daily CSV snapshot (next 2 days).
- Confirmor sends confirmations only for **day-after-tomorrow** appointments.
- Confirmation deadline is same day at configured `deadline_hour` (default `18:00`, clinic timezone).
- At `deadline_hour + 1 minute`, pending appointments for day-after-tomorrow are auto-canceled in Confirmor.
- Patient links do not require login.
- Clinic receives cancellation email notice (SMTP) and sees statuses in dashboard.

## Tech stack

- Node.js + TypeScript + Express
- PostgreSQL (Supabase)
- Supabase Auth (email + password), one manager user per clinic
- `@supabase/supabase-js` for server DB/Auth access
- `node-cron` scheduler
- Vercel-friendly app export (`src/app.ts`) and local node entry (`src/index.ts`)

## Project structure

```text
.
+- docs/
¦  +- email-ingestion-stub.md
+- samples/
¦  +- appointments_sample.csv
+- src/
¦  +- api/
¦  ¦  +- csvImportService.ts
¦  ¦  +- routes.ts
¦  +- auth/
¦  ¦  +- middleware.ts
¦  ¦  +- session.ts
¦  +- config/
¦  ¦  +- env.ts
¦  +- db/
¦  ¦  +- appointments.ts
¦  ¦  +- clinics.ts
¦  ¦  +- messages.ts
¦  ¦  +- supabase.ts
¦  ¦  +- tokens.ts
¦  ¦  +- users.ts
¦  +- email/
¦  ¦  +- mailer.ts
¦  ¦  +- templates.ts
¦  +- importers/
¦  ¦  +- emailIngestionStub.ts
¦  +- jobs/
¦  ¦  +- confirmorJobs.ts
¦  ¦  +- scheduler.ts
¦  +- sms/
¦  ¦  +- dummyProvider.ts
¦  ¦  +- provider.ts
¦  ¦  +- templates.ts
¦  ¦  +- twilioProvider.ts
¦  ¦  +- types.ts
¦  +- types/
¦  ¦  +- domain.ts
¦  ¦  +- express.d.ts
¦  +- utils/
¦  ¦  +- datetime.ts
¦  ¦  +- html.ts
¦  ¦  +- logger.ts
¦  ¦  +- phone.ts
¦  ¦  +- tokenValidation.ts
¦  +- views/
¦  ¦  +- pages.ts
¦  +- app.ts
¦  +- index.ts
+- supabase/
¦  +- migrations/
¦     +- 202602270001_init.sql
+- tests/
¦  +- phone.test.ts
¦  +- tokenValidation.test.ts
+- .env.example
+- .gitignore
+- package.json
+- tsconfig.json
+- vitest.config.ts
```

## Setup

1. Install deps:

```bash
npm install
```

2. Configure env:

```bash
cp .env.example .env
```

Fill all required vars:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COOKIE_SECRET`

3. Apply SQL migration.

### Option A: Supabase SQL editor

Run `supabase/migrations/202602270001_init.sql`.

### Option B: Supabase CLI

```bash
supabase db push
```

4. Seed one clinic and one manager user.

- Create Auth user (email+password) in Supabase Auth.
- Insert one row in `clinics`.
- Insert one row in `users` mapping `users.id = auth.users.id` and `users.clinic_id = clinics.id`.

5. Run app:

```bash
npm run dev
```

Open:

- `http://localhost:3000/login`

## CSV import behavior

### Required columns

- `appointment_id`
- `start_datetime`
- `phone`
- `appointment_type`

### Optional columns

- `patient_name`
- `provider_name`
- `status`

### Endpoint

- `POST /api/clinics/:clinicId/csv-import` (multipart, file field name: `file`)

Dashboard backup form:

- `GET /dashboard/import`
- `POST /dashboard/import`

### Snapshot rule

CSV is treated as a snapshot of next 2 days.

- Upsert key: `(clinic_id, external_appointment_id, start_datetime)`.
- Missing appointments (in snapshot window) are marked `canceled_by_patient` **only** when currently `pending`.
- If status is `confirmed` or `canceled_auto`, it is preserved.

## Scheduling rules

Timezone is clinic timezone (default `Europe/Bucharest`).

- Job A at `export_hour:05`:
  - Find day-after-tomorrow pending appointments.
  - Create/reuse confirm+cancel tokens.
  - Send `confirm_request` SMS if not sent.

- Job B at `deadline_hour:01`:
  - Auto-cancel day-after-tomorrow pending appointments.
  - Send `auto_cancel_notice` SMS.
  - Send clinic `clinic_cancel_notice` email.

Jobs are idempotent using status transitions + unique message constraints.

## Patient links

- Confirm: `GET /c/:token`
- Cancel: `GET /x/:token`

Token checks:

- purpose
- expiration
- used state
- appointment relationship

Invalid/expired/used tokens return neutral HTML page.

## SMS providers

- `SMS_PROVIDER=dummy` (default): logs SMS to console
- `SMS_PROVIDER=twilio`: requires
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM_PHONE`

## Email

Clinic cancellation notifications use SMTP env vars.
If SMTP is missing, messages are logged (no provider send).

## Security notes

- Auth required for dashboard/API manager actions.
- Clinic ownership checked for clinic-scoped API import route.
- Service role key is server-only; never sent to browser.
- CSRF middleware enabled for non-API form routes.

## Email ingestion interface stub

- `src/importers/emailIngestionStub.ts`
- docs: `docs/email-ingestion-stub.md`

No email creds are needed for local run.

## Tests

```bash
npm test
```

Includes:

- phone normalization tests
- token validation tests