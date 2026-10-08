# Lexicon Loop

Mobile-first vocabulary learning MVP built with Next.js App Router, TypeScript, Tailwind, Supabase-ready data boundaries, and a server-only Gemini route.

## Run locally

This project targets Node `18.17.x` so it also works with the current local runtime. If PowerShell asks whether to run the Microsoft shell integration script, choose `R` (Run once) or `A` (Always), then enter the npm command at the normal `PS>` prompt.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The app requires Supabase configuration and an authenticated user; it loads only the signed-in user's workspace data.

## Connect Supabase

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and add the project URL and anon key.
3. Run `supabase/migrations/001_initial_schema.sql` through `supabase/migrations/009_retry_missed_daily_reminders.sql` in numeric order in the Supabase SQL editor. If earlier migrations are already applied, run only the missing migrations.
4. The schema enables RLS for profiles, folders, words, progress, and review logs. Foreign keys cascade progress and logs when a word is deleted, while deleting a folder leaves its words unsorted. Review progress and its history log are saved together by the `save_review` database function.

Create users in Supabase Auth with a password. Any user with an existing Supabase account can sign in; the app uses direct `signInWithPassword` and does not provide a register flow.

The Supabase browser/server helpers and CRUD mapping live in `src/lib/supabase`. With a configured project, the app redirects unauthenticated visitors to `/auth`, loads the selected workspace's folders, words, progress, and review logs, and persists new words, folders, ratings, and workspaces through RLS-protected queries.

## Daily push reminders

Push reminders use standard Web Push with Supabase Cron and an Edge Function. A reminder is sent once per user's local day, only if their daily review goal is still unfinished. Supabase Free includes enough scheduled function calls for the once-a-minute timezone check at small scale, but its projects may pause after a week of inactivity.

1. Run `supabase/migrations/007_daily_push_reminders.sql` after migrations 001-006, then `supabase/migrations/008_custom_daily_review_goal.sql` and `supabase/migrations/009_retry_missed_daily_reminders.sql`, in the Supabase SQL editor.
2. Generate a VAPID key pair locally with `node scripts/generate-vapid-keys.mjs`. Copy `VAPID_PUBLIC_KEY` into `.env.local` and your Vercel environment variables. This public key is intentionally exposed to the browser by `next.config.mjs`; do not put the private key there. In Supabase Dashboard, open **Edge Functions → Secrets** and add `VAPID_KEYS` (the JSON value printed by the script), `VAPID_CONTACT_EMAIL`, and `PUSH_CRON_SECRET`. Never share or commit the private `VAPID_KEYS` value.
3. Install the Supabase CLI, then connect and deploy the function:

	 ```powershell
	 supabase login
	 supabase link --project-ref <your-project-ref>
	 supabase functions deploy send-daily-reminders
	 ```

4. Generate a long random `PUSH_CRON_SECRET` locally, then store that same value in Supabase Vault as `push_cron_secret`. Also store the project URL as `push_project_url` and its publishable key as `push_publishable_key`:

	 ```sql
	 select vault.create_secret('https://<project-ref>.supabase.co', 'push_project_url');
	 select vault.create_secret('<publishable-key>', 'push_publishable_key');
	 select vault.create_secret('<same-cron-secret>', 'push_cron_secret');
	 ```

5. Schedule the dispatcher once in the Supabase SQL editor:

	 ```sql
	 select cron.schedule(
		 'daily-push-reminders',
		 '* * * * *',
		 $$
			 select net.http_post(
				 url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_project_url') || '/functions/v1/send-daily-reminders',
				 headers := jsonb_build_object(
					 'Content-Type', 'application/json',
					 'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'push_publishable_key'),
					 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
				 ),
				 body := '{}'::jsonb
			 ) as request_id;
		 $$
	 );
	 ```

6. Restart the Next.js app after adding the public VAPID key. Sign in, open **Settings → Daily push reminder**, choose a time, and enable notifications. On iPhone or iPad, add the app to the Home Screen first; Web Push requires iOS/iPadOS 16.4 or later.

The Edge Function uses `@negrel/webpush` for the Web Push protocol. Its maintainers note that the cryptographic implementation has not had an independent expert audit, so reminder payloads deliberately contain no private vocabulary data.

## Gemini sentence generation

Add `GEMINI_API_KEY` to `.env.local`. The key is only read in `src/app/api/generate-sentence/route.ts`; it is never exposed to the browser. The add-word modal shows generated text for editing before saving.

After changing `.env` or `.env.local`, stop and restart `npm.cmd run dev`; Next.js reads server environment variables at startup. Do not use a `NEXT_PUBLIC_` prefix for the Gemini key.

## Included MVP flow

- Review queue prioritizes new and due cards.
- Flip card with tap, Enter, or Space.
- Rate with buttons, ArrowLeft/ArrowRight, or a mobile swipe.
- First success schedules the next review for one day; later reviews expand with a lightweight FSRS-inspired scheduler.
- Failed cards return in ten minutes.
- Add words, optional meanings/examples, Gemini generation with CEFR estimation, personalized quizzes with multiple-choice distractors and fill-in-the-blank questions, folders, search, filters, statistics, settings, responsive navigation, and PWA metadata.