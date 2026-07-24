import { env } from "cloudflare:workers";
import type { AppEnv } from "@/db";
import {
  ApiError,
  assertSameOrigin,
  cleanDashboardState,
  jsonError,
  requireMember,
  WORKSPACE_ID,
  writeLog
} from "@/lib/cloud";

export const dynamic = "force-dynamic";

type WorkspaceRow = { version: number; state_json: string | null; updated_at: number; updated_by: string | null };

export async function GET(request: Request) {
  try {
    const appEnv = env as unknown as AppEnv;
    await requireMember(request, appEnv);
    const row = await appEnv.DB.prepare(
      "SELECT version, state_json, updated_at, updated_by FROM workspaces WHERE id = ?"
    ).bind(WORKSPACE_ID).first<WorkspaceRow>();
    return Response.json({
      ok: true,
      version: row?.version || 0,
      state: row?.state_json ? JSON.parse(row.state_json) : null,
      updatedAt: row?.updated_at || null,
      updatedBy: row?.updated_by || null
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const appEnv = env as unknown as AppEnv;
    const { member } = await requireMember(request, appEnv, "editor");
    const body = await request.json() as { state?: unknown; expectedVersion?: number; action?: string };
    if (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) {
      throw new ApiError(400, "缺少有效的数据版本号");
    }
    const current = await appEnv.DB.prepare(
      "SELECT version, state_json, updated_at, updated_by FROM workspaces WHERE id = ?"
    ).bind(WORKSPACE_ID).first<WorkspaceRow>();
    const currentVersion = Number(current?.version || 0);
    if (currentVersion !== body.expectedVersion) {
      return Response.json({
        ok: false,
        conflict: true,
        version: currentVersion,
        state: current?.state_json ? JSON.parse(current.state_json) : null,
        updatedAt: current?.updated_at || null,
        updatedBy: current?.updated_by || null
      }, { status: 409 });
    }
    const stateJson = cleanDashboardState(body.state);
    const now = Date.now();
    const update = await appEnv.DB.prepare(`UPDATE workspaces
      SET version = version + 1, state_json = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND version = ?`)
      .bind(stateJson, now, member.email, WORKSPACE_ID, currentVersion).run();
    if (!update.meta.changes) throw new ApiError(409, "数据已被其他成员更新，请重新同步");
    await writeLog(appEnv.DB, member.email, body.action || "同步看板数据", "workspace", `版本 ${currentVersion + 1}`);
    return Response.json({ ok: true, version: currentVersion + 1, updatedAt: now, updatedBy: member.email });
  } catch (error) {
    return jsonError(error);
  }
}
