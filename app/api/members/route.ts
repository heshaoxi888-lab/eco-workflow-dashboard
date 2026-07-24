import { env } from "cloudflare:workers";
import type { AppEnv } from "@/db";
import {
  ApiError,
  assertSameOrigin,
  jsonError,
  listMembers,
  normalizeEmail,
  requireMember,
  roleRank,
  validateRole,
  WORKSPACE_ID,
  writeLog
} from "@/lib/cloud";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const appEnv = env as unknown as AppEnv;
    await requireMember(request, appEnv);
    return Response.json({ ok: true, members: await listMembers(appEnv.DB) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const appEnv = env as unknown as AppEnv;
    const { member: actor } = await requireMember(request, appEnv, "admin");
    const body = await request.json() as { email?: string; name?: string; role?: string };
    if (!body.email || !body.email.includes("@")) throw new ApiError(400, "请输入有效的成员邮箱");
    const email = normalizeEmail(body.email);
    const name = String(body.name || email.split("@")[0]).trim().slice(0, 50);
    const role = validateRole(body.role || "editor");
    if (role === "owner" && actor.role !== "owner") throw new ApiError(403, "只有所有者可以添加其他所有者");
    const now = Date.now();
    await appEnv.DB.prepare(`INSERT INTO members
      (id, workspace_id, email, name, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(workspace_id, email) DO UPDATE SET name = excluded.name, role = excluded.role,
      status = 'active', updated_at = excluded.updated_at`)
      .bind(crypto.randomUUID(), WORKSPACE_ID, email, name, role, now, now).run();
    await writeLog(appEnv.DB, actor.email, "添加团队成员", email, `${name} · ${role}`);
    return Response.json({ ok: true, members: await listMembers(appEnv.DB) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const appEnv = env as unknown as AppEnv;
    const { member: actor } = await requireMember(request, appEnv, "admin");
    const body = await request.json() as { id?: string; name?: string; role?: string; status?: string };
    if (!body.id) throw new ApiError(400, "缺少成员ID");
    const target = await appEnv.DB.prepare("SELECT * FROM members WHERE id = ? AND workspace_id = ?")
      .bind(body.id, WORKSPACE_ID).first<{ id: string; email: string; role: "owner"|"admin"|"editor"|"viewer" }>();
    if (!target) throw new ApiError(404, "成员不存在");
    if (target.role === "owner" && actor.role !== "owner") throw new ApiError(403, "管理员不能修改所有者");
    const role = body.role ? validateRole(body.role) : target.role;
    if (roleRank[role] > roleRank[actor.role]) throw new ApiError(403, "不能授予高于自己的角色");
    const status = body.status === "disabled" ? "disabled" : "active";
    if (target.email === actor.email && status === "disabled") throw new ApiError(400, "不能停用自己的账号");
    const name = String(body.name || target.email.split("@")[0]).trim().slice(0, 50);
    await appEnv.DB.prepare("UPDATE members SET name = ?, role = ?, status = ?, updated_at = ? WHERE id = ?")
      .bind(name, role, status, Date.now(), target.id).run();
    await writeLog(appEnv.DB, actor.email, "更新团队成员", target.email, `${role} · ${status}`);
    return Response.json({ ok: true, members: await listMembers(appEnv.DB) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const appEnv = env as unknown as AppEnv;
    const { member: actor } = await requireMember(request, appEnv, "admin");
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ApiError(400, "缺少成员ID");
    const target = await appEnv.DB.prepare("SELECT id, email, role FROM members WHERE id = ? AND workspace_id = ?")
      .bind(id, WORKSPACE_ID).first<{ id: string; email: string; role: string }>();
    if (!target) throw new ApiError(404, "成员不存在");
    if (target.role === "owner") throw new ApiError(403, "所有者账号不能删除");
    if (target.email === actor.email) throw new ApiError(400, "不能删除自己的账号");
    await appEnv.DB.prepare("DELETE FROM members WHERE id = ?").bind(target.id).run();
    await writeLog(appEnv.DB, actor.email, "移除团队成员", target.email);
    return Response.json({ ok: true, members: await listMembers(appEnv.DB) });
  } catch (error) {
    return jsonError(error);
  }
}
