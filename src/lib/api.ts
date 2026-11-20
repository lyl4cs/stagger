import "server-only";
import { supabaseServer } from "./supabase/server";

export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) { super(message); }
}

export async function requireUser() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new HttpError(401, "Not signed in");
  return { sb, user };
}

// Wraps a route handler so thrown HttpErrors become JSON responses.
export async function handle(fn: () => Promise<unknown>) {
  try {
    return Response.json(await fn());
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error(e);
    return Response.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
