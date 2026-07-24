import { ensureSchema, type AppEnv, WORKSPACE_ID } from "@/db";

export type TeamRole = "owner" | "admin" | "editor" | "viewer";
export type TeamMember = {
  id: string;
  workspace_id: string;
  email: string;
  name: string;
  role: TeamRole;
  status: "active" | "disabled";
  created_at: number;
  updated_at: number;
  last_seen_at: number | null;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const displayName = (email: string) => email.split("@")[0] || "团队成员";
const roleRank: Record<TeamRole, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

function decodeWorkspaceName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (!encoded || encoding !== "percent-encoded-utf-8") return null;
  try { return decodeURIComponent(encoded); } catch { return null; }
}

function decodeJwtPart(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0));
  return bytes;
}

async function verifyAccessJwt(token: string, issuer: string, audience: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ApiError(401, "Cloudflare Access 登录令牌格式无效");
  const header = JSON.parse(new TextDecoder().decode(decodeJwtPart(parts[0]))) as { kid?: string; alg?: string };
  const payload = JSON.parse(new TextDecoder().decode(decodeJwtPart(parts[1]))) as Record<string, unknown>;
  if (!header.kid || header.alg !== "RS256") throw new ApiError(401, "Cloudflare Access 登录令牌算法无效");
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
  if (!response.ok) throw new ApiError(503, "暂时无法获取 Cloudflare Access 公钥");
  const certs = await response.json() as { keys?: JsonWebKey[] };
  const jwk = certs.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new ApiError(401, "Cloudflare Access 登录公钥不匹配");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signatureOk = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    decodeJwtPart(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!signatureOk || payload.iss !== issuer || !audiences.includes(audience)) throw new ApiError(401, "Cloudflare Access 登录令牌验证失败");
  if (typeof payload.exp !== "number" || payload.exp <= now) throw new ApiError(401, "Cloudflare Access 登录已过期");
  if (typeof payload.nbf === "number" && payload.nbf > now) throw new ApiError(401, "Cloudflare Access 登录令牌尚未生效");
  return payload;
}

export async function getIdentity(request: Request, env: AppEnv) {
  const workspaceEmail = request.headers.get("oai-authenticated-user-email");
  if (workspaceEmail) {
    const email = normalizeEmail(workspaceEmail);
    return { email, name: decodeWorkspaceName(request) || displayName(email), source: "workspace" };
  }

  const token = request.headers.get("cf-access-jwt-assertion");
  if (token && env.TEAM_DOMAIN && env.POLICY_AUD) {
    const issuer = env.TEAM_DOMAIN.replace(/\/$/, "");
    const payload = await verifyAccessJwt(token, issuer, env.POLICY_AUD);
    if (typeof payload.email !== "string") throw new ApiError(401, "Cloudflare Access 登录信息缺少邮箱");
    const email = normalizeEmail(payload.email);
    return { email, name: typeof payload.name === "string" ? payload.name : displayName(email), source: "cloudflare-access" };
  }

  const host = new URL(request.url).hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    const email = normalizeEmail(env.DEV_USER_EMAIL || "owner@eco.local");
    return { email, name: "本地所有者", source: "development" };
  }
  throw new ApiError(401, "请先通过 Cloudflare Access 登录");
}

export async function requireMember(request: Request, env: AppEnv, minimum: TeamRole = "viewer") {
  if (!env.DB) throw new ApiError(503, "D1 数据库尚未绑定");
  await ensureSchema(env.DB);
  const identity = await getIdentity(request, env);
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM members WHERE workspace_id = ?")
    .bind(WORKSPACE_ID).first<{ count: number }>();
  if (Number(countRow?.count || 0) === 0) {
    const now = Date.now();
    await env.DB.prepare(`INSERT INTO members
      (id, workspace_id, email, name, role, status, created_at, updated_at, last_seen_at)
      VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?, ?)`)
      .bind(crypto.randomUUID(), WORKSPACE_ID, identity.email, identity.name, now, now, now).run();
    await writeLog(env.DB, identity.email, "初始化团队工作空间", identity.email, "首位登录者成为所有者");
  }
  const member = await env.DB.prepare("SELECT * FROM members WHERE workspace_id = ? AND email = ?")
    .bind(WORKSPACE_ID, identity.email).first<TeamMember>();
  if (!member || member.status !== "active") throw new ApiError(403, "你的账号尚未加入团队或已被停用");
  if (roleRank[member.role] < roleRank[minimum]) throw new ApiError(403, "当前账号没有执行此操作的权限");
  await env.DB.prepare("UPDATE members SET last_seen_at = ? WHERE id = ?").bind(Date.now(), member.id).run();
  return { identity, member };
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "跨站请求已被拒绝");
}

export function cleanDashboardState(input: unknown) {
  if (!input || typeof input !== "object") throw new ApiError(400, "看板数据格式无效");
  const state = structuredClone(input) as Record<string, any>;
  state.config ||= {};
  state.config.collab = { enabled: true, provider: "cloudflare-d1", interval: 10000 };
  if (state.config.ai) {
    state.config.ai = {
      provider: state.config.ai.provider || "coze",
      cozeBotId: state.config.ai.cozeBotId || "",
      doubaoModel: state.config.ai.doubaoModel || "doubao-seed-1-6-flash",
      deepseekModel: state.config.ai.deepseekModel || "deepseek-chat"
    };
  }
  const json = JSON.stringify(state);
  if (new TextEncoder().encode(json).byteLength > 1_500_000) throw new ApiError(413, "看板数据超过当前版本的1.5MB限制");
  return json;
}

export async function listMembers(db: D1Database) {
  const result = await db.prepare(`SELECT id, workspace_id, email, name, role, status,
    created_at, updated_at, last_seen_at FROM members WHERE workspace_id = ?
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, created_at`)
    .bind(WORKSPACE_ID).all<TeamMember>();
  return result.results;
}

export async function writeLog(db: D1Database, actor: string, action: string, target?: string, details?: string) {
  await db.prepare(`INSERT INTO activity_logs
    (id, workspace_id, actor_email, action, target, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), WORKSPACE_ID, actor, action, target || null, details || null, Date.now()).run();
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) return Response.json({ ok: false, error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ ok: false, error: "服务器处理失败" }, { status: 500 });
}

export function validateRole(value: unknown): TeamRole {
  if (value === "owner" || value === "admin" || value === "editor" || value === "viewer") return value;
  throw new ApiError(400, "无效的成员角色");
}

export { normalizeEmail, roleRank, WORKSPACE_ID };
