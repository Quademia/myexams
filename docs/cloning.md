# QAcademy — Cloning & Production Deployment Guide

*This document records complex setup processes that must be repeated when cloning to a new environment or deploying to production. Follow each section precisely.*

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

When cloning to a new environment, the NextAuth tables must be created alongside the standard schema. Run these against the new D1 database:
```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  emailVerified INTEGER,
  image TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT NOT NULL PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT NOT NULL PRIMARY KEY,
  sessionToken TEXT NOT NULL UNIQUE,
  userId TEXT NOT NULL,
  expires INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires INTEGER NOT NULL,
  PRIMARY KEY (identifier, token),
  -- The following columns are QAcademy additions — NOT part of the NextAuth schema.
  -- NextAuth does not know about them and never writes to them.
  -- All are nullable so NextAuth inserts are unaffected.
  created_at TEXT,
  ip_address TEXT,
  used_at TEXT,
  used_ip_address TEXT,
  invalidated_at TEXT
);
```

**Note:** The platform user table is `qa_users` — not `users`. The `users` table above belongs to NextAuth. Do not confuse the two.

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

*Last updated: 2026-03-28 — Password reset flow complete and verified.*
