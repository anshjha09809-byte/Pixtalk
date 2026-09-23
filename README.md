# Secure Messenger

End-to-end encrypted messenger (React + Vite + Capacitor + Supabase). Chats use
ECDH (P-256) key agreement with AES-GCM-256 for message encryption, plus
biometric app-lock, view-once media, disappearing messages, and a basic
content-safety scanner.

> Note: this repo currently contains the core app logic (crypto, Supabase
> data layer, store, config) that was assembled from individual source
> files. UI components (screens/pages) are **not** included yet — add your
> `src/components` / `src/App.tsx` etc. before this will build and run.

## Stack

- React + TypeScript + Vite
- Supabase (auth, Postgres, realtime, storage)
- Capacitor (Android/iOS shell)
- Web Crypto API (ECDH P-256 + AES-GCM-256) for E2E encryption

## Project layout

```
src/
  types.ts                  # shared TypeScript interfaces
  supabase.ts                # Supabase client + data access helpers
  config/
    themeConfig.ts           # UI theme presets
  crypto/
    e2e.ts                   # ECDH/AES-GCM encrypt/decrypt, safety numbers
    biometrics.ts             # biometric app-lock support
    usernameAlgorithm.ts       # handle validation/availability
    safetyScanner.ts           # content safety heuristics
  hooks/
    useMessengerStore.ts       # main app state hook, wires everything together
capacitor.config.ts
vite.config.ts
android-assets/              # app icon + splash source images
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a [Supabase](https://supabase.com) project, then copy `.env.example`
   to `.env` and fill in your project's URL and anon/publishable key:
   ```bash
   cp .env.example .env
   ```
3. In Supabase, create tables for `users`, `messages`, `stories`, and `posts`
   matching the fields referenced in `src/supabase.ts` (see column names such
   as `sender_id`, `recipient_id`, `ciphertext`, `iv`, `reactions`, etc.), and
   a `media` storage bucket for photo/voice uploads.
4. Run the dev server:
   ```bash
   npm run dev
   ```

## Mobile (Capacitor)

Before building for Android/iOS, update `appId` in `capacitor.config.ts` from
the placeholder `com.example` to your own reverse-domain app id.

```bash
npm run build
npx cap add android   # or ios
npm run cap:sync
npm run cap:android   # or cap:ios
```

## Security notes

- The Supabase anon key is a public, RLS-protected key by design — it's still
  kept out of source control here via `.env` so different environments
  (dev/staging/prod projects) can be swapped without code changes.
- Make sure Row Level Security (RLS) policies are enabled on every Supabase
  table before shipping, since the anon key is exposed to the client.
- Private keys never leave the device; only public keys and ciphertext are
  synced through Supabase.

## License

Add a license of your choice (e.g. MIT) before making the repo public.
