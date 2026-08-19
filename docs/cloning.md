# QAcademy — Cloning & Production Deployment Guide

*This document records complex setup processes that must be repeated when cloning to a new environment or deploying to production. Follow each section precisely.*

---

## 0. Account ownership

⚠ **Which external account holds each service. Written down 2026-08-19 because it
was not recorded anywhere, and none of it is discoverable from the code or the
Cloudflare dashboard — secrets are write-only once set.**

| Service | Account | Status |
|---|---|---|
| **Cloudflare** | personal (`mybackpacc`) | ✅ Worker `myexams-dev`, D1 `beta_b_db` |
| **Google OAuth** | Sam's **personal Google account** | ✅ working |
| **Azure / Microsoft Entra** | **`confidencearthur@hotmail.com`** (personal Hotmail) | ✅ working |
| **Resend** | not recorded | — |

**Application (client) ID: `945160b9-73af-4d85-8209-3e1bd02a153d`.** Search on this,
not on the app's name — the GUID cannot drift, the display name can. ⓘ If the owning
account is ever lost again, the ID can be read straight out of the running app: POST
to `/api/auth/signin/microsoft-entra-id` with a CSRF token and read `client_id` off
the redirect. That is how it was recovered on 2026-08-19.

### Going forward — a dedicated Microsoft account

The Azure registration currently sits on a **personal Hotmail account that is Sam's
own**, not the product's. A dedicated account is wanted instead.

⭐ **This does not conflict with the family rule, contrary to what §0 first recorded.**
MyNclex settled (2026-08) that new infrastructure registers under
**`admin@quademia.com`**. The apparent problem was that this app requires a *personal*
Microsoft account — organisational accounts fail, and `src/auth.ts` hardcodes
Microsoft's consumer tenant `9188040d-6c67-4c5b-b112-36a304b66dad`. But **a personal
Microsoft account can be created against any email address**, including one on a
domain you own. So `admin@quademia.com` can hold this registration as a personal
Microsoft account, satisfying both constraints at once.

⚠ **Moving the registration means a new client ID and a new secret**, so it is a
change to a working login path — do it at the prod clone, not casually.

### Still to settle before the prod clone

**The Google client should fold into the family's shared project.** MyNclex settled
that there is **one `Quademia` Google Cloud project holding one OAuth client per
product** — the consent screen is per-*project*, so this means verifying once and
showing one brand across the family. MyExams predates that rule by five months and
sits outside it.

### ⚠ The Azure client secret expires around March 2028

Created with a **24-month** expiry (§1.3 step 9). Nothing warns you. When it lapses,
Microsoft SSO stops working with no deploy, no code change, and no error anyone would
have predicted. The exact date is on the registration's *Certificates & secrets* page.

### History — the 2026-08-19 Worker rename

The Worker was renamed `qacademy-beta-b` → `myexams-dev`, moving the host to
`myexams-dev.mybackpacc.workers.dev`. **Both** OAuth providers had to have their
redirect URIs re-registered; Microsoft sign-in was broken for the few hours it took
to find which account held the Azure registration. ⭐ The lesson is the reason §0
exists: the rename itself was reversible and cheap, but *not knowing who owned the
account* was what actually cost time.

---

## 1. Authentication Setup (NextAuth v5)

QAcademy uses NextAuth v5 with three login methods: email + password, Google SSO, and Microsoft SSO. Each requires external services to be configured before the app will work.

### 1.1 Required Cloudflare Secrets

All of the following must be set as **Secrets** (not plain text variables) in Cloudflare Workers → Settings → Environment Variables. Never put these in `wrangler.jsonc` — even as empty placeholders, they will overwrite your real secrets on every deploy.

| Secret | Purpose | Notes |
|---|---|---|
| `APP_SECRET` | Pepper for PBKDF2 password hashing | Must be identical across all environments — changing it breaks all existing passwords |
| `AUTH_SECRET` | NextAuth JWT signing key | Generate with `crypto.randomUUID() + crypto.randomUUID() + crypto.randomUUID()` in browser console |
| `AUTH_TRUST_HOST` | Allows NextAuth to run behind Cloudflare proxy | Set to `true` — without this every auth request fails with UntrustedHost error |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID | From Google Cloud Console |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret | From Google Cloud Console — shown once on creation |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Azure Application (client) ID | From Azure portal → App registrations → Overview |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Azure Client Secret **Value** | From Azure portal → Certificates & secrets → Value column (NOT the Secret ID) |
| `RESEND_API_KEY` | Resend API key for transactional email | From Resend dashboard → API Keys |

**Critical notes:**
- `APP_SECRET` must be the same value in every environment. If it changes, no existing user can log in with email + password.
- `AUTH_SECRET` can be different per environment (dev vs production).
- `AUTH_MICROSOFT_ENTRA_ID_SECRET` — copy the **Value**, not the **Secret ID**. They look similar in Azure. The Value starts with characters like `abc8Q~...`. The ID is a UUID like `12345678-abcd-...`. Using the ID instead of the Value causes `invalid_client` errors.

---

### 1.2 Google OAuth Setup

1. Go to **console.cloud.google.com**
2. Select or create a project
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID
4. Application type: **Web application**
5. Add **Authorised JavaScript origins**:
   `https://your-workers-domain.workers.dev`
6. Add **Authorised redirect URIs**:
   `https://your-workers-domain.workers.dev/api/auth/callback/google`
7. Copy the **Client ID** and **Client Secret**
8. Add both to Cloudflare as `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`

---

### 1.3 Microsoft OAuth Setup (Personal Accounts)

ⓘ **See §0 for which account holds this registration** (`confidencearthur@hotmail.com`) and the Application (client) ID. The steps below describe how it was set up, and how to set it up in a new environment.

QAcademy is currently configured for **personal Microsoft accounts only** (Outlook, Hotmail, Xbox). Organisational accounts require publisher verification in Azure — not yet set up.

1. Go to **portal.azure.com** — sign in with a personal Microsoft account (not a work account — work accounts default to an organisational tenant and will fail)
2. Search for **App registrations** → New registration
3. Fill in:
   - **Name:** QAcademy (or your app name)
   - **Supported account types:** Personal Microsoft accounts only
   - **Redirect URI:** leave blank for now
4. Click **Register**
5. From the Overview page, copy:
   - **Application (client) ID** → save as `AUTH_MICROSOFT_ENTRA_ID_ID`
6. Go to **Authentication** → Add a platform → Web
7. Add redirect URI:
   `https://your-workers-domain.workers.dev/api/auth/callback/microsoft-entra-id`
8. Save
9. Go to **Certificates & secrets** → New client secret
   - Description: your app name
   - Expires: 24 months
   - Click Add
   - **Immediately copy the Value** (not the Secret ID) — it is only shown once
   - Save as `AUTH_MICROSOFT_ENTRA_ID_SECRET`

**Important:** The Microsoft issuer in `src/auth.ts` is hardcoded to:
`https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0`
This is the fixed GUID Microsoft uses for the consumer tenant. Do not change it unless switching to organisational accounts.

---

### 1.4 Resend Email Setup

1. Go to **resend.com** → API Keys → Create API Key
2. Name it after your environment (e.g. `qacademy-production`)
3. Permission: Full access
4. Copy the key immediately — shown once only
5. Save as `RESEND_API_KEY` in Cloudflare
6. Verify a sending domain under Domains — the from address in emails must use this domain

---

### 1.5 D1 Database Setup

When cloning to a new environment, paste the entire contents of `db/schema.sql` into the D1 query pane and run it. This is the single source of truth for the database schema — it creates all tables, indexes, and is kept up to date whenever the schema changes.

**Key tables created by schema.sql:**
- `qa_users` — platform users (this is the app's user table, NOT NextAuth's `users` table)
- `users`, `accounts`, `sessions`, `verification_tokens` — NextAuth tables (with QAcademy audit columns added to `sessions` and `verification_tokens`)
- `auth_events` — login attempt audit log (used by rate limiting)
- `password_reset_log` — password reset request audit log (used by rate limiting)
- All exam, course, sitting, and question bank tables

**Important notes:**
- The `sessions` table has QAcademy-specific columns (`qa_user_id`, `created_at`, `last_seen_at`, `absolute_expires_at`, `expired_at`, `expiry_reason`, `ip_hash`, `ua_parsed`) that NextAuth does not write to — QAcademy manages these for concurrent session limits and session revocation
- The `verification_tokens` table has QAcademy audit columns (`created_at`, `ip_address`, `used_at`, `used_ip_address`, `invalidated_at`) — all nullable so NextAuth inserts are unaffected
- Do not confuse `qa_users` (platform users) with `users` (NextAuth identity records)

---

### 1.6 Common Errors and Fixes

| Error | Cause | Fix |
|---|---|---|
| `MissingSecret: Please define a 'secret'` | `AUTH_SECRET` is empty or not set | Set `AUTH_SECRET` as a Cloudflare secret with a long random value |
| `UntrustedHost: Host must be trusted` | `AUTH_TRUST_HOST` not set | Set `AUTH_TRUST_HOST` to `true` as a Cloudflare secret |
| `There was a problem with the server configuration` | Any secret is missing or empty | Check all 8 secrets are set correctly in Cloudflare |
| `OAuthCallbackError: invalid_client` | Wrong Azure secret — Secret ID used instead of Secret Value | Go to Azure → Certificates & secrets, copy the Value column not the ID |
| `issuer property does not match` | Wrong Microsoft issuer URL | Confirm issuer in `src/auth.ts` is `https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0` |
| `End users cannot grant consent` | Azure app set to multitenant | Change Azure app to Personal Microsoft accounts only |
| Secrets wiped on every deploy | Empty placeholders in `wrangler.jsonc` vars block | Remove the vars block from `wrangler.jsonc` entirely |
| Email + password login broken after cloning | `APP_SECRET` value is different from original | Restore the exact original `APP_SECRET` value |

---

*Last updated: 2026-08-19 — account ownership recorded (§0): Cloudflare, Google and Azure owners named, the Entra client ID captured, and the dedicated-Microsoft-account plan settled. Previously 2026-03-29 — D1 setup simplified to reference schema.sql, security tables documented.*
