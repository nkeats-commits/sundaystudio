import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type CDPSession = Awaited<ReturnType<BrowserContext["newCDPSession"]>>;

const viewports = [
  { label: "desktop", width: 1280, height: 800 },
  { label: "phone", width: 390, height: 844 },
] as const;

const servicePlan = {
  id: 41,
  userId: "scroll-e2e-owner",
  title: "Sunday Celebration",
  scripture: "Psalm 96",
  theme: "Praise",
  season: "Ordinary Time",
  serviceDate: "2026-10-04T10:00:00.000Z",
  content: {
    order: Array.from({ length: 24 }, (_, index) => ({
      id: `song-slot-${index + 1}`,
      kind: "song",
      title: `Song slot ${String(index + 1).padStart(2, "0")}`,
      body: "A song in the service plan.",
    })),
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

async function installApiFixtures(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let response: unknown = {};

    if (pathname === "/api/billing/status") {
      response = { state: { kind: "active" }, trialDays: 14 };
    } else if (pathname === "/api/admin/me") {
      response = { userId: "scroll-e2e-owner" };
    } else if (pathname === "/api/me") {
      response = {
        userId: "scroll-e2e-owner",
        email: "scroll-e2e@example.invalid",
        firstName: "Test",
        lastName: "Worship Leader",
        onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
        profile: {
          churchName: "E2E Church",
          leaderName: "Test Worship Leader",
        },
      };
    } else if (pathname === "/api/generate/songs" && request.method() === "POST") {
      response = { jobId: "scroll-e2e-song-generation" };
    } else if (
      pathname === "/api/generate/jobs/scroll-e2e-song-generation" &&
      request.method() === "GET"
    ) {
      response = {
        status: "done",
        result: {
          theme: "Hope",
          songs: [
            {
              title: "E2E Song of Hope",
              artist: "Sunday Studio Test Band",
              style: "Worship",
              whyItFits: "A test suggestion for exercising the service dialog.",
            },
          ],
        },
      };
    } else if (pathname === "/api/service-plans") {
      response = [servicePlan];
    } else if (pathname === "/api/admin/users") {
      response = { items: [], total: 0 };
    } else if (
      pathname === "/api/sermons" ||
      pathname.startsWith("/api/library")
    ) {
      response = [];
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

async function scrollMetrics(page: Page) {
  return page.evaluate(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    return {
      top: scrollingElement.scrollTop,
      max: Math.max(0, scrollingElement.scrollHeight - scrollingElement.clientHeight),
    };
  });
}

async function resetDocumentScroll(page: Page) {
  await page.evaluate(() => {
    (document.scrollingElement ?? document.documentElement).scrollTo({
      top: 0,
      behavior: "instant",
    });
  });
}

async function touchSwipe(
  page: Page,
  cdp: CDPSession,
  direction: "down" | "up",
) {
  const { width, height } = page.viewportSize()!;
  const x = width - 24;
  const startY = Math.round(height * (direction === "down" ? 0.82 : 0.24));
  const endY = Math.round(height * (direction === "down" ? 0.24 : 0.82));

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: startY }],
  });
  for (let step = 1; step <= 5; step += 1) {
    const y = Math.round(startY + ((endY - startY) * step) / 5);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(120);
}

async function scrollToDocumentEnd(
  page: Page,
  cdp: CDPSession,
  input: "wheel" | "trackpad" | "touch",
  edge: "top" | "bottom",
) {
  const delta = edge === "bottom" ? 1 : -1;
  const { width, height } = page.viewportSize()!;
  await page.mouse.move(width - 24, Math.round(height / 2));

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const { top, max } = await scrollMetrics(page);
    if (edge === "top" ? top <= 1 : top >= max - 2) return;

    if (input === "wheel") {
      await page.mouse.wheel(0, delta * 600);
    } else if (input === "trackpad") {
      await page.mouse.wheel(0, delta * 36);
    } else {
      await touchSwipe(page, cdp, edge === "bottom" ? "down" : "up");
    }
    await page.waitForTimeout(35);
  }
}

async function expectAtDocumentEdge(
  page: Page,
  edge: "top" | "bottom",
) {
  await expect
    .poll(async () => {
      const { top, max } = await scrollMetrics(page);
      return edge === "top" ? top : max - top;
    })
    .toBeLessThanOrEqual(3);
}

test.beforeEach(async ({ page }) => {
  await installApiFixtures(page);
});

test("signed-in long and short pages reach both ends with wheel, trackpad, and touch", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  const pages = [
    {
      path: "/generators/songs",
      heading: "Find Songs",
      long: true,
    },
    {
      path: "/sermons",
      heading: "Sermon Archive",
      long: false,
    },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const target of pages) {
      await page.goto(target.path);
      await expect(
        page.getByRole("heading", { name: target.heading }).first(),
      ).toBeVisible();

      const { max } = await scrollMetrics(page);
      if (target.long) {
        expect(max, `${viewport.label} ${target.path} should be vertically scrollable`).toBeGreaterThan(0);
      }

      for (const input of ["wheel", "trackpad", "touch"] as const) {
        await resetDocumentScroll(page);
        await scrollToDocumentEnd(page, cdp, input, "bottom");
        await expectAtDocumentEdge(page, "bottom");

        await scrollToDocumentEnd(page, cdp, input, "top");
        await expectAtDocumentEdge(page, "top");
      }
    }
  }

  await cdp.detach();
});

test("phone sidebar scrolls, navigates, closes, and leaves page scrolling available", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Account Settings" })).toBeVisible();

  const drawer = page.locator(
    'div[class~="md:hidden"][class~="fixed"][class~="inset-y-0"][class~="left-0"]',
  );
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-hidden", "false");

  const navigationList = drawer.locator(".overflow-y-auto").first();
  const scrollHeight = await navigationList.evaluate((element) => element.scrollHeight);
  const clientHeight = await navigationList.evaluate((element) => element.clientHeight);
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  await navigationList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await navigationList.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(drawer.getByRole("link", { name: "Settings" })).toBeInViewport();

  await navigationList.evaluate((element) => {
    element.scrollTo({ top: 0, behavior: "instant" });
  });
  await drawer.getByRole("link", { name: "Song Assistant" }).click();

  await expect(
    page.getByRole("heading", { name: "Find Songs" }).first(),
  ).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflow),
  ).not.toBe("hidden");

  const cdp = await context.newCDPSession(page);
  await resetDocumentScroll(page);
  await scrollToDocumentEnd(page, cdp, "wheel", "bottom");
  await expectAtDocumentEdge(page, "bottom");
  await cdp.detach();
});

test("scrollable song dialog remains usable and restores page scrolling when closed", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/generators/songs");
  await page.getByTestId("input-theme").fill("Hope");
  await page.getByTestId("button-find-songs").click();
  await expect(page.getByTestId("card-song-0")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("button-add-song-to-service-0").click();
  const dialog = page.getByRole("dialog", { name: "Add to a service plan" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sunday Celebration" }).click();

  const slotList = dialog.locator(".max-h-56.overflow-y-auto").last();
  const { scrollHeight, clientHeight } = await slotList.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  const cdp = await context.newCDPSession(page);
  const bounds = await slotList.boundingBox();
  expect(bounds).not.toBeNull();
  const startY = Math.round(bounds!.y + bounds!.height * 0.82);
  const endY = Math.round(bounds!.y + bounds!.height * 0.24);
  const x = Math.round(bounds!.x + bounds!.width / 2);
  await page.mouse.move(x, startY);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const position = await slotList.evaluate((element) => ({
      top: element.scrollTop,
      max: element.scrollHeight - element.clientHeight,
    }));
    if (position.top >= position.max - 2) break;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y: startY }],
    });
    for (let step = 1; step <= 5; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          {
            x,
            y: Math.round(startY + ((endY - startY) * step) / 5),
          },
        ],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await page.waitForTimeout(100);
  }
  await expect(dialog.getByRole("button", { name: /Song slot 24/ })).toBeInViewport();
  await cdp.detach();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();

  const scrollCdp = await context.newCDPSession(page);
  await resetDocumentScroll(page);
  await scrollToDocumentEnd(page, scrollCdp, "wheel", "bottom");
  await expectAtDocumentEdge(page, "bottom");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflow),
  ).not.toBe("hidden");
  await scrollCdp.detach();
});

test("representative signed-in routes do not introduce horizontal page overflow", async ({
  page,
}) => {
  const routes = [
    { path: "/generators/songs", heading: "Find Songs" },
    { path: "/sermons", heading: "Sermon Archive" },
    { path: "/settings", heading: "Account Settings" },
    { path: "/admin/users", heading: "Users" },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const route of routes) {
      await page.goto(route.path);
      await expect(
        page.getByRole("heading", { name: route.heading }).first(),
      ).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(
        overflow,
        `${route.path} has horizontal overflow at ${viewport.label} width`,
      ).toBeLessThanOrEqual(1);
    }
  }
});