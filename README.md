# ECO 团队工作流 · Cloudflare 协作版

面向 5 人内容团队的在线协作看板。前端保留原有选题、生产、排期、KPI、BD 与 GEO 流程，协作层改为 Cloudflare D1，并增加团队账号和角色权限。

## 权限

- `owner`：团队所有者，可管理全部成员；首位登录者自动成为所有者。
- `admin`：可添加、停用成员和调整权限。
- `editor`：可编辑并同步看板数据。
- `viewer`：只读查看。

## Cloudflare 配置

`.openai/hosting.json` 声明了 `DB` D1 绑定，迁移文件位于 `drizzle/`。直接使用 Cloudflare Access 时还需配置：

- `TEAM_DOMAIN`：例如 `https://your-team.cloudflareaccess.com`
- `POLICY_AUD`：Access Application Audience 标签

本地开发可用 `DEV_USER_EMAIL` 指定测试登录邮箱。AI 服务 Token 只保存在浏览器本地，不写入 D1。

## 命令

```bash
pnpm db:generate
pnpm build
pnpm test
```
