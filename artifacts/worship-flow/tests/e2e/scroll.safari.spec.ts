import { expect, test, type Locator } from "@playwright/test";

test("iPhone WebKit drawer reaches the final links and restores page scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    const responses: Record<string, unknown> = {
      "/api/admin/me": { userId: "scroll-e2e-owner" },
      "/api/dashboard": {
        verseOfDay: { text: "Be still and know.", reference: "Psalm 46:10" },
        recentServices: [],
        servicesThisMonth: 0,
        librarySize: 0,
        totalServices: 0,
        suggestions: [],
        trial: {
          isActive: false,
          daysLeft: null,
          trialEndsAt: null,
          activated: true,
          servicePlans: 0,
          sermons: 0,
          libraryItems: 0,
        },
      },
      "/api/me": {
        userId: "scroll-e2e-owner",
        email: "safari-scroll@example.invalid",
        firstName: "Test",
        lastName: "Worship Leader",
        onboardingCompletedAt: "2026-09-01T00:00:00.000Z",
        profile: {
          churchName: "E2E Church",
          leaderName: "Test Worship Leader",
        },
      },
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responses[pathname] ?? {}),
    });
  });

  await page.goto("/dashboard");
  await expect(page.getByTestId("text-dashboard-welcome")).toBeVisible();

  const drawer = page.locator(
    'div[class~="md:hidden"][class~="fixed"][class~="inset-y-0"][class~="left-0"]',
  );
  const tap = async (locator: Locator) => {
    const box = await locator.boundingBox();
    expect(box, "expected the touch target to have a visible box").not.toBeNull();
    await page.touchscreen.tap(
      box!.x + box!.width / 2,
      box!.y + box!.height / 2,
    );
  };

  await tap(page.getByRole("button", { name: "Open menu" }));
  await expect(drawer).toHaveAttribute("aria-hidden", "false");

  const navigation = drawer.getByTestId("mobile-sidebar-navigation");
  const cue = drawer.getByTestId("mobile-sidebar-scroll-cue");
  const groups = ["sermon-prep", "other-tools", "settings"] as const;
  for (const group of groups) {
    const toggle = drawer.getByTestId(`mobile-nav-group-toggle-${group}`);
    await toggle.scrollIntoViewIfNeeded();
    await tap(toggle);
    await expect(
      drawer.getByTestId(`mobile-nav-group-toggle-${group}`),
    ).toHaveAttribute("aria-expanded", "true");
  }

  const overflow = await navigation.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(overflow.scrollHeight).toBeGreaterThan(overflow.clientHeight);
  await expect(cue).toBeVisible();
  await expect(drawer.getByText("Test Worship Leader")).toBeInViewport();

  // A Safari browser-chrome change can shorten the visible area while the drawer is open.
  await page.setViewportSize({ width: 390, height: 640 });
  await expect(cue).toBeVisible();
  await expect(drawer.getByText("Test Worship Leader")).toBeInViewport();
  await navigation.evaluate((element) => {
    element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
  });
  await expect(cue).toHaveCount(0);

  for (const label of ["Help Center", "Settings", "Admin"]) {
    await expect(drawer.getByRole("link", { name: label, exact: true })).toBeInViewport();
  }
  await expect(drawer.getByText("Test Worship Leader")).toBeInViewport();
  await navigation.evaluate((element) => {
    element.scrollTo({ top: 0, behavior: "instant" });
  });
  await expect(cue).toBeVisible();
  await tap(drawer.getByRole("link", { name: "Song Assistant", exact: true }));
  await expect(page.getByRole("heading", { name: "Find Songs" }).first()).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-hidden", "true");

  const documentMetrics = await page.evaluate(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    return {
      top: scrollingElement.scrollTop,
      max: scrollingElement.scrollHeight - scrollingElement.clientHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
    };
  });
  expect(documentMetrics.bodyOverflow).not.toBe("hidden");
  expect(documentMetrics.max).toBeGreaterThan(0);
  await page.evaluate(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    scrollingElement.scrollTo({ top: scrollingElement.scrollHeight, behavior: "instant" });
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scrollingElement =
          document.scrollingElement ?? document.documentElement;
        return scrollingElement.scrollTop;
      }),
    )
    .toBeGreaterThan(documentMetrics.top);
});
