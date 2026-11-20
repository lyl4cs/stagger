import { supabaseAdmin } from "@/lib/supabase/admin";

// 1x1 transparent GIF served as the open-tracking pixel.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, ctx: RouteContext<"/api/o/[id]">) {
  const { id } = await ctx.params;
  if (UUID_RE.test(id)) {
    // Never let tracking errors break the image.
    await supabaseAdmin().rpc("record_open", { rid: id }).then(() => undefined, () => undefined);
  }
  return new Response(new Uint8Array(GIF), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Content-Length": String(GIF.length),
    },
  });
}
