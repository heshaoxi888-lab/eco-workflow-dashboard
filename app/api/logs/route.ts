import { env } from "cloudflare:workers";
import type { AppEnv } from "@/db";
import { jsonError, requireMember, WORKSPACE_ID } from "@/lib/cloud";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const appEnv = env as unknown as AppEnv;
    await requireMember(request, appEnv);
    const result = await appEnv.DB.prepare(`SELECT actor_email, action, target, details, created_at
      FROM activity_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 100`)
      .bind(WORKSPACE_ID).all();
    return Response.json({ ok: true, logs: result.results });
  } catch (error) {
    return jsonError(error);
  }
}
