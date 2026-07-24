import { env } from "cloudflare:workers";
import type { AppEnv } from "@/db";
import { jsonError, listMembers, requireMember, WORKSPACE_ID } from "@/lib/cloud";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const appEnv = env as unknown as AppEnv;
    const { identity, member } = await requireMember(request, appEnv);
    const workspace = await appEnv.DB.prepare(
      "SELECT name, version, state_json, updated_at, updated_by FROM workspaces WHERE id = ?"
    ).bind(WORKSPACE_ID).first<{
      name: string;
      version: number;
      state_json: string | null;
      updated_at: number;
      updated_by: string | null;
    }>();
    return Response.json({
      ok: true,
      user: { email: identity.email, name: member.name, role: member.role, status: member.status },
      workspace: {
        name: workspace?.name || "ECO 内容运营团队",
        version: workspace?.version || 0,
        updatedAt: workspace?.updated_at || null,
        updatedBy: workspace?.updated_by || null
      },
      state: workspace?.state_json ? JSON.parse(workspace.state_json) : null,
      members: await listMembers(appEnv.DB)
    });
  } catch (error) {
    return jsonError(error);
  }
}
