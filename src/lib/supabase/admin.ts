import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses Row Level Security. Server only, never import from a client component.
// Used for the refresh-token table and the cron sender, which acts on every user's queue.
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
