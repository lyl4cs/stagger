import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Server client for route handlers: reads the user's session from cookies.
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        },
      },
    },
  );
}
