import { expect, test } from "@playwright/test";

test.describe("Room UX flow", () => {
  test("two players can join and see room status", async ({ browser }) => {
    test.skip(!process.env.E2E_RUN_ONLINE, "Set E2E_RUN_ONLINE=1 to run online multiplayer checks.");

    const c1 = await browser.newContext();
    const c2 = await browser.newContext();
    const p1 = await c1.newPage();
    const p2 = await c2.newPage();

    await p1.goto("/");
    await p1.getByLabel("Введите имя игрока").fill("PlayerOne");
    await p1.getByRole("button", { name: "Создать комнату" }).click();
    await expect(p1.getByText("Комната")).toBeVisible();

    const roomUrl = p1.url();

    await p2.goto(roomUrl);

    await expect(p2.getByText("Игроки")).toBeVisible();
    await expect(p1.getByText("Игроки")).toBeVisible();

    await c1.close();
    await c2.close();
  });
});
