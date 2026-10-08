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
3. Run `supabase/migrations/001_initial_schema.sql` through `supabase/migrations/006_atomic_review_save.sql` in numeric order in the Supabase SQL editor. If earlier migrations are already applied, run only the missing migrations, including `005_review_ratings.sql` and `006_atomic_review_save.sql` when they have not been applied.
4. The schema enables RLS for profiles, folders, words, progress, and review logs. Foreign keys cascade progress and logs when a word is deleted, while deleting a folder leaves its words unsorted. Review progress and its history log are saved together by the `save_review` database function.

Create users in Supabase Auth with a password. Any user with an existing Supabase account can sign in; the app uses direct `signInWithPassword` and does not provide a register flow.

The Supabase browser/server helpers and CRUD mapping live in `src/lib/supabase`. With a configured project, the app redirects unauthenticated visitors to `/auth`, loads the selected workspace's folders, words, progress, and review logs, and persists new words, folders, ratings, and workspaces through RLS-protected queries.

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