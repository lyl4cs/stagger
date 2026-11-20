import { supabaseAdmin } from "@/lib/supabase/admin";
import { processDue, sweepReplies } from "@/lib/sender";

export const maxDuration = 60;

// Hit once a minute by Supabase pg_cron (POST) or Vercel Cron (GET). Both send the secret.
async function run(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const sending = await processDue(db);
  const tracking = await sweepReplies(db);
  return Response.json({ sending, tracking });
}

export const GET = run;
export const POST = run;
