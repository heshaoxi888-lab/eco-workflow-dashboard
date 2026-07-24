import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireChatGPTUser("/");

  return (
    <main className="shell">
      <iframe
        className="dashboard-frame"
        src="/dashboard.html"
        title="ECO 团队工作流看板"
        allow="clipboard-read; clipboard-write"
      />
    </main>
  );
}
