import { DefaultSession, DefaultJWT } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      active_tenant_id: string | null
      session_token: string | null
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    active_tenant_id: string | null
    session_token: string | null
    last_seen_updated_at: number | null
    id: string
  }
}
