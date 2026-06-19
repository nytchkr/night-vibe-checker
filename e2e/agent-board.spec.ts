import { expect, test } from "@playwright/test";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "nightvibe-admin-2026";

test.describe("Agent Board admin route", () => {
  test("renders mocked live board data without the customer bottom nav", async ({ page }) => {
    await page.context().addCookies([
      {
        name: "agent_board_auth",
        value: ADMIN_PASSWORD,
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.route("**/rest/v1/agent_board_tickets?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "NV-031",
            title: "Embed Agent Board admin route in Night Vibe app",
            description: "Admin route reads shared board data.",
            type: "Task",
            status: "In Progress",
            priority: "High",
            assignee: "Codex",
            agent_id: "codex",
            points: 3,
            due_date: "2026-06-18",
            updated_at: "2026-06-18T23:00:00Z",
          },
          {
            id: "NV-023",
            title: "Discover map page E2E smoke test",
            description: "Verify map page.",
            type: "Task",
            status: "Backlog",
            priority: "Medium",
            assignee: "QA Agent",
            agent_id: "testing-agent",
            points: 3,
            due_date: "2026-06-20",
            updated_at: "2026-06-18T22:00:00Z",
          },
        ]),
      }),
    );

    await page.route("**/rest/v1/agent_board_comments?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "NV-031-codex-test",
            ticket_id: "NV-031",
            agent_id: "codex",
            body: "IN PROGRESS - Adding the embedded admin board.",
            created_at: "2026-06-18T23:00:00Z",
          },
        ]),
      }),
    );

    await page.route("**/rest/v1/agent_board_agents?*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "codex",
            name: "codex",
            model: "codex-1",
            status: "Active - synced via app.js",
            scope: "Agent Board UI and frontend polish.",
            updated_at: "2026-06-18T23:00:00Z",
          },
          {
            id: "mvp-night-vibe-builder",
            name: "mvp-night-vibe-builder",
            model: "claude-sonnet-4-6",
            status: "Available locally",
            scope: "Orchestration.",
            updated_at: "2026-06-18T23:00:00Z",
          },
        ]),
      }),
    );

    await page.goto("/agent-board");

    await expect(page.getByRole("heading", { name: "Agent Board", exact: true })).toBeVisible();
    await expect(page.getByText("NV-031").first()).toBeVisible();
    await expect(page.getByText("Agent presence")).toBeVisible();
    await expect(page.getByLabel("Home")).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: /NV-023/ }).click();
    const details = page.getByRole("dialog");
    await expect(details.getByRole("heading", { name: "Discover map page E2E smoke test" })).toBeVisible();
    await expect(details.getByText("Verify map page.")).toBeVisible();

    await details.getByLabel("Close ticket details").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
