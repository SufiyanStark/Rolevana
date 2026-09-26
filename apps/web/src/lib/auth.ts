import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type SessionUser = { id: string; email: string; name: string };

export async function getSessionUser(): Promise<SessionUser | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    if (process.env.NODE_ENV === "production") return null;
    return { id: "local-development-user", email: "developer@localhost", name: "Local developer" };
  }
  const store = await cookies();
  const client = createServerClient(url, key, { cookies: { getAll: () => store.getAll(), setAll: () => undefined } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email, name: String(data.user.user_metadata.name ?? data.user.email.split("@")[0]) };
}

