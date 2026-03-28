// src/app/api/auth/[...nextauth]/route.ts
// NextAuth catch-all API route.
//
// HOW IT WORKS:
// - NextAuth needs a single API route that handles ALL auth-related requests:
//   sign-in, sign-out, callbacks from Google/Microsoft, CSRF tokens, etc.
// - The [...nextauth] folder name means Next.js routes ANY path under /api/auth/*
//   to this file (e.g. /api/auth/signin, /api/auth/callback/google, etc.).
// - We simply re-export the GET and POST handlers that NextAuth built for us
//   in src/auth.ts.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
