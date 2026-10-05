import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type CDPSession = Awaited<ReturnType<BrowserContext["newCDPSession"]>>;

const viewports = [
  { label: "desktop", width: 1280, height: 800 },
  { label: "phone", width: 390, height: 844 },
] as const;

const mobileNavGroups = [
  {
    id: "sermon-prep",
    hrefs: ["/sermons/new", "/sermons", "/sermons/series", "/bible-tools", "/resources"],
  },
  {
    id: "other-tools",
    hrefs: [
      "/service-builder",
      "/generators/liturgy",
      "/generators/songs",
      "/generators/speaking-moment",
      "/generators/devotional",
      "/generators/soul-care",
      "/library",
      "/services",
    ],
  },
  {
    id: "settings",
    hrefs: ["/help", "/church", "/settings/integrations", "/billing", "/settings", "/admin"],
  },
] as const;

const keyboardNavGroups = [
  { id: "sermon-prep", label: "SERMON PREP", firstLink: "Sermon Builder" },
  { id: "other-tools", label: "OTHER TOOLS", firstLink: "Service Builder" },
  { id: "settings", label: "SETTINGS", firstLink: "Help Center" },
] as const;

const allNavigationHrefs = [
  "/dashboard",
  "/assistant",
  ...mobileNavGroups.flatMap((group) => group.hrefs),
];

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

const assistantConversation = {
  id: 917,
  userId: "scroll-e2e-owner",
  title: `A conversation with a very long title ${"about ministry ".repeat(8)}`,
  createdAt: "2026-10-01T12:00:00.000Z",
  updatedAt: "2026-10-03T12:00:00.000Z",
};

const assistantArchivedConversation = {
  id: 916,
  userId: "scroll-e2e-owner",
  title: "Volunteer care planning",
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-03T12:00:00.000Z",
};

const assistantConversations = [
  assistantConversation,
  assistantArchivedConversation,
];

const assistantMarkdown = [
  "## A long reflection",
  "",
  ...Array.from(
    { length: 32 },
    (_, index) => `Paragraph ${index + 1}: Take time to listen before deciding what support the team needs.`,
  ),
  "",
  `${"unbrokenpastoralword".repeat(16)}`,
  "",
  "| Question | Next step |",
  "| --- | --- |",
  "| What support is useful? | Schedule a conversation |",
].join("\n");

const assistantDetail = {
  ...assistantConversation,
  messages: [
    {
      id: 918,
      conversationId: assistantConversation.id,
      role: "assistant",
      content: assistantMarkdown,
      createdAt: "2026-10-03T12:01:00.000Z",
    },
  ],
};

const assistantArchivedDetail = {
  ...assistantArchivedConversation,
  messages: [
    {
      id: 921,
      conversationId: assistantArchivedConversation.id,
      role: "assistant",
      content: "Consider what support the volunteers need.",
      createdAt: "2026-08-03T12:01:00.000Z",
    },
  ],
};

async function installApiFixtures(page: Page) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    let response: unknown = {};

    if (
      pathname === "/api/assistant/conversations" &&
      request.method() === "GET"
    ) {
      response = assistantConversations;
    } else if (
      pathname ===
        `/api/assistant/conversations/${assistantArchivedConversation.id}` &&
      request.method() === "GET"
    ) {
      response = assistantArchivedDetail;
    } else if (
      pathname === `/api/assistant/conversations/${assistantConversation.id}` &&
      request.method() === "GET"
    ) {
      response = assistantDetail;
    } else if (
      pathname ===
        `/api/assistant/conversations/${assistantConversation.id}/messages` &&
      request.method() === "POST"
    ) {
      const content = (request.postDataJSON() as { content: string }).content;
      response = {
        userMessage: {
          id: 919,
          conversationId: assistantConversation.id,
          role: "user",
          content,
          createdAt: "2026-10-03T12:02:00.000Z",
        },
        assistantMessage: {
          id: 920,
          conversationId: assistantConversation.id,
          role: "assistant",
          content: "Let’s take one step at a time.",
          createdAt: "2026-10-03T12:03:00.000Z",
        },
      };
    } else if (pathname === "/api/billing/status") {
      response = { state: { kind: "active" }, trialDays: 14 };
    } else if (pathname === "/api/dashboard") {
      response = {
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
      };
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

async function expectPageCanScrollToEnd(page: Page, cdp: CDPSession) {
  await resetDocumentScroll(page);
  expect((await scrollMetrics(page)).max).toBeGreaterThan(0);
  await scrollToDocumentEnd(page, cdp, "wheel", "bottom");
  await expectAtDocumentEdge(page, "bottom");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).overflow),
  ).not.toBe("hidden");
}

async function openAddToServiceDialog(page: Page) {
  await page.goto("/generators/songs");
  await page.getByTestId("input-theme").fill("Hope");
  await page.getByTestId("button-find-songs").click();
  await expect(page.getByTestId("card-song-0")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("button-add-song-to-service-0").click();

  const dialog = page.getByRole("dialog", { name: "Add to a service plan" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  await installApiFixtures(page);
});

test("phone sidebar groups work with Enter and Space and expose link state to assistive technology", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await expect(page.getByTestId("text-dashboard-welcome")).toBeVisible();

  const drawer = page.locator(
    'div[class~="md:hidden"][class~="fixed"][class~="inset-y-0"][class~="left-0"]',
  );
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(drawer).toHaveAttribute("aria-hidden", "false");

  for (let index = 0; index < keyboardNavGroups.length; index += 1) {
    const group = keyboardNavGroups[index]!;
    const toggle = drawer.getByTestId(`mobile-nav-group-toggle-${group.id}`);
    const panelId = `mobile-nav-group-${group.id}`;
    const panel = drawer.locator(`#${panelId}`);

    await expect(toggle).toHaveAccessibleName(group.label);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveAttribute("aria-controls", panelId);
    await expect(panel).toHaveAttribute("hidden", "");
    await expect(panel.getByRole("link")).toHaveCount(0);

    // With the group collapsed, Tab skips its links and reaches the next group control.
    if (index < keyboardNavGroups.length - 1) {
      await toggle.focus();
      await page.keyboard.press("Tab");
      await expect(
        drawer.getByTestId(`mobile-nav-group-toggle-${keyboardNavGroups[index + 1]!.id}`),
      ).toBeFocused();
    } else {
      await toggle.focus();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
    }

    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).not.toHaveAttribute("hidden", "");

    const firstLink = panel.getByRole("link", {
      name: group.firstLink,
      exact: true,
    });
    await expect(firstLink).toHaveAccessibleName(group.firstLink);
    await page.keyboard.press("Tab");
    await expect(firstLink).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect(toggle).toBeFocused();
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveAttribute("hidden", "");
    await expect(panel.getByRole("link")).toHaveCount(0);
  }
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

      const header = drawer.locator(".mobile-sidebar-header");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute("aria-hidden", "false");

  await expect(
    drawer.getByTestId("mobile-nav-group-toggle-settings"),
  ).toHaveAttribute("aria-expanded", "true");
  await drawer.getByTestId("mobile-nav-group-toggle-sermon-prep").click();
  await drawer.getByTestId("mobile-nav-group-toggle-other-tools").click();

      const navigationList = drawer.getByTestId("mobile-sidebar-navigation");

      const safeAreaPadding = await page.evaluate(() => ({
        headerTop: Number.parseFloat(
          getComputedStyle(document.querySelector(".mobile-sidebar-header")!).paddingTop,
        ),
        accountBottom: Number.parseFloat(
          getComputedStyle(document.querySelector(".mobile-sidebar-account")!).paddingBottom,
        ),
      }));
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

  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(drawer).toHaveAttribute("aria-hidden", "false");
  await expect(
    drawer.getByTestId("mobile-nav-group-toggle-other-tools"),
  ).toHaveAttribute("aria-expanded", "true");
  const backdrop = page.locator(
    '[data-state="open"][class~="bg-black/80"]',
  );
  await expect(backdrop).toBeVisible();
  const { width, height } = page.viewportSize()!;
  await backdrop.click({ position: { x: width - 8, y: Math.round(height / 2) } });
  await expect(drawer).toHaveAttribute("aria-hidden", "true");
  await expectPageCanScrollToEnd(page, cdp);
  await cdp.detach();
});

test("compact phone drawer exposes every group and destination at short and standard sizes", async ({
  page,
}) => {
  const phoneViewports = [
    { width: 360, height: 640 },
    { width: 390, height: 844 },
  ];
  const drawer = page.locator(
    'div[class~="md:hidden"][class~="fixed"][class~="inset-y-0"][class~="left-0"]',
  );

      const header = drawer.locator(".mobile-sidebar-header");

  for (const viewport of phoneViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    await expect(page.getByTestId("text-dashboard-welcome")).toBeVisible();
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(drawer).toHaveAttribute("aria-hidden", "false");
    await expect(drawer.getByRole("link", { name: "Dashboard" })).toBeInViewport();
    await expect(drawer.getByRole("link", { name: "Assistant" })).toBeInViewport();
    await expect(drawer.getByText("Test Worship Leader")).toBeInViewport();

    for (const group of mobileNavGroups) {
        const toggle = drawer.getByTestId(`mobile-nav-group-toggle-${group.id}`);

      const navigationBox = await navigationList.boundingBox();
        await expect(toggle).toBeInViewport();
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
      }

      for (const group of mobileNavGroups) {
        const toggle = drawer.getByTestId(`mobile-nav-group-toggle-${group.id}`);

      const navigationBox = await navigationList.boundingBox();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");

      const panel = drawer.locator(`#mobile-nav-group-${group.id}`);
      const hrefs = await panel.locator("a").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      );
      expect(hrefs).toEqual(group.hrefs);
    }

      const navigationList = drawer.getByTestId("mobile-sidebar-navigation");

      const safeAreaPadding = await page.evaluate(() => ({
        headerTop: Number.parseFloat(
          getComputedStyle(document.querySelector(".mobile-sidebar-header")!).paddingTop,
        ),
        accountBottom: Number.parseFloat(
          getComputedStyle(document.querySelector(".mobile-sidebar-account")!).paddingBottom,
        ),
      }));
  const { scrollHeight, clientHeight } = await slotList.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    await expect(drawer.getByText("Test Worship Leader")).toBeInViewport();

    await navigationList.evaluate((element) => {
      element.scrollTo({ top: 0, behavior: "instant" });
    });
    await drawer.getByRole("link", { name: "Song Assistant" }).click();
    await expect(page.getByRole("heading", { name: "Find Songs" }).first()).toBeVisible();
    await expect(drawer).toHaveAttribute("aria-hidden", "true");

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      drawer.getByTestId("mobile-nav-group-toggle-other-tools"),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(drawer).toHaveAttribute("aria-hidden", "false");
    await drawer.getByRole("button", { name: "Close menu" }).click();
    await expect(drawer).toHaveAttribute("aria-hidden", "true");
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/dashboard");
  const desktopSidebar = page.locator('div[class~="hidden"][class~="md:flex"]').first();
  await expect(desktopSidebar.getByRole("link", { name: "Admin" })).toBeVisible();
  const desktopHrefs = await desktopSidebar.locator("a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href")),
  );

  const safeAreaProfiles = [
    { label: "iOS", top: 59, bottom: 34 },
    { label: "Android", top: 24, bottom: 24 },
  ];
  expect(desktopHrefs).toEqual(allNavigationHrefs);
  await expect(desktopSidebar.locator("button[aria-expanded]")).toHaveCount(0);
});

test("desktop sidebar stays within the viewport and scrolls its navigation on short screens", async ({
  page,
}) => {
  const desktopViewports = [
    { width: 1280, height: 800 },
    { width: 1024, height: 560 },
  ];
  const sidebar = page.getByTestId("desktop-sidebar");
  const navigation = page.getByTestId("desktop-sidebar-navigation");

  for (const viewport of desktopViewports) {
    await page.setViewportSize(viewport);
    await page.goto("/dashboard");
    await expect(page.getByTestId("text-dashboard-welcome")).toBeVisible();

      const bounds = await prompt.boundingBox();
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight + 1);

  const { scrollHeight, clientHeight } = await slotList.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);

    await navigation.evaluate((element) => {
      element.scrollTo({ top: element.scrollHeight, behavior: "instant" });
    });
    expect(await navigation.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(sidebar.getByRole("link", { name: "Admin" })).toBeInViewport();
    await expect(sidebar.getByText("Test Worship Leader")).toBeInViewport();
  }
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
  const dialog = await openAddToServiceDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sunday Celebration" }).click();

  const slotList = dialog.locator(".max-h-56.overflow-y-auto").last();
  const { scrollHeight, clientHeight } = await slotList.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);

  const cdp = await context.newCDPSession(page);
      const bounds = await prompt.boundingBox();
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

test("service dialog restores page scrolling after Escape dismissal", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openAddToServiceDialog(page);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  const cdp = await context.newCDPSession(page);
  await expectPageCanScrollToEnd(page, cdp);
  await cdp.detach();
});

test("service dialog restores page scrolling after backdrop dismissal", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openAddToServiceDialog(page);

  const backdrop = page.locator(
    '[data-state="open"][class~="bg-black/80"]',
  );
  await expect(backdrop).toBeVisible();
  await backdrop.click({ position: { x: 8, y: 8 } });
  await expect(dialog).toBeHidden();

  const cdp = await context.newCDPSession(page);
  await expectPageCanScrollToEnd(page, cdp);
  await cdp.detach();
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

test("Assistant keeps the composer visible and restores transcript position around a mobile keyboard resize", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await installApiFixtures(page);
  await page.goto("/assistant");
  await page.getByTestId("input-search-conversations").fill("long title");
  await expect(
    page.getByTestId(`button-search-conversation-${assistantConversation.id}`),
  ).toHaveClass(/break-words/);
  await page
    .getByTestId(`button-search-conversation-${assistantConversation.id}`)
    .click();

    const transcript = page.getByTestId("transcript");
  await expect(page.getByTestId("message-assistant-918")).toBeVisible();
  await expect
    .poll(() =>
      transcript.evaluate(
        (element) => element.scrollHeight - element.clientHeight - element.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(16);
  await transcript.evaluate((element) => {
    element.scrollTop = Math.min(180, element.scrollHeight - element.clientHeight);
  });
  const previousTranscriptPosition = await transcript.evaluate(
    (element) => element.scrollTop,
  );
  expect(previousTranscriptPosition).toBeGreaterThan(0);

  await page.getByTestId("input-message").fill("A message while the keyboard is open.");
  await page.setViewportSize({ width: 390, height: 390 });

  const assistantRoot = page.getByTestId("assistant-root");
  await expect(assistantRoot).toHaveAttribute(
    "data-assistant-keyboard-open",
    "true",
  );
  await expect(page.getByTestId("form-send-message")).toBeInViewport();
  await expect(page.getByTestId("button-send-message")).toBeInViewport();
  const transcriptBounds = await transcript.boundingBox();
  expect(transcriptBounds).not.toBeNull();
  expect(
    await transcript.evaluate(
      (element) => element.scrollHeight - element.clientHeight,
    ),
  ).toBeGreaterThan(0);

  await transcript.evaluate((element) => {
    element.scrollTop = Math.min(
      element.scrollTop + 80,
      element.scrollHeight - element.clientHeight,
    );
  });
  await expect
    .poll(() => transcript.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(previousTranscriptPosition);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(assistantRoot).toHaveAttribute(
    "data-assistant-keyboard-open",
    "false",
  );
  await expect
    .poll(() => transcript.evaluate((element) => element.scrollTop))
    .toBe(previousTranscriptPosition);
  await context.close();
});

test("Assistant lets phone users retry loading saved conversations", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await installApiFixtures(page);

  let conversationListUnavailable = true;
  await page.route("**/api/assistant/conversations", async (route) => {
    if (
      route.request().method() === "GET" &&
      conversationListUnavailable
    ) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Conversation service unavailable." }),
      });
      return;
    }
    await route.fallback();
  });

  await page.goto("/assistant");

  await expect(page.getByTestId("status-mobile-conversations-error")).toContainText(
    "Saved conversations could not be loaded.",
  );
  const retryButton = page.getByTestId("button-retry-mobile-conversations");
  await expect(retryButton).toBeVisible();

  conversationListUnavailable = false;
  const conversationListResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/assistant/conversations") &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );
  await retryButton.click();
  await conversationListResponse;

  await page.getByTestId("input-search-conversations").fill("long title");
  await expect(
    page.getByTestId(`button-search-conversation-${assistantConversation.id}`),
  ).toBeVisible();

  await context.close();
});

test("Assistant stays usable without horizontal overflow at phone widths", async ({
  page,
}) => {
  for (const width of [375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/assistant");
    await expect(page.getByTestId("heading-assistant")).toBeVisible();
    await expect(page.getByTestId("input-search-conversations")).toBeVisible();
    await expect(page.getByTestId("button-new-conversation-mobile")).toBeVisible();

    for (const prompt of await page
      .locator('[data-testid^="button-prompt-"]')
      .all()) {
      const bounds = await prompt.boundingBox();
      expect(bounds, `prompt chip should be laid out at ${width}px`).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    }

    await page.getByTestId("input-search-conversations").fill("volunteer");
    await expect(
      page.getByTestId(
        `button-search-conversation-${assistantArchivedConversation.id}`,
      ),
    ).toBeVisible();
    await expect(
      page.getByTestId(
        `text-search-conversation-updated-${assistantArchivedConversation.id}`,
      ),
    ).toContainText("Updated");
    await expect(
      page.getByTestId(
        `button-search-conversation-${assistantConversation.id}`,
      ),
    ).toBeHidden();
    await page
      .getByTestId(
        `button-search-conversation-${assistantArchivedConversation.id}`,
      )
      .click();
    await expect(page.getByTestId("text-active-conversation-title")).toHaveText(
      assistantArchivedConversation.title,
    );

    await page.getByTestId("input-search-conversations").fill("long title");
    await expect(
      page.getByTestId(
        `text-search-conversation-title-${assistantConversation.id}`,
      ),
    ).toHaveClass(/break-words/);
    await expect(
      page.getByTestId(
        `text-search-conversation-updated-${assistantConversation.id}`,
      ),
    ).toContainText("Updated");
    await page
      .getByTestId(`button-search-conversation-${assistantConversation.id}`)
      .click();
    await expect(page.getByTestId("message-assistant-918")).toBeVisible();
    await expect(page.getByTestId("text-active-conversation-title")).toHaveClass(
      /truncate/,
    );
    await expect(page.getByTestId("text-active-conversation-title")).toContainText(
      "A conversation with a very long title",
    );
    await expect(page.getByTestId("input-message")).toBeInViewport();
    await expect(page.getByTestId("button-send-message")).toBeInViewport();

    const transcript = page.getByTestId("transcript");
    const transcriptBox = await transcript.boundingBox();
    expect(transcriptBox).not.toBeNull();
    await page.mouse.move(
      transcriptBox!.x + transcriptBox!.width / 2,
      transcriptBox!.y + transcriptBox!.height / 2,
    );
    await page.mouse.wheel(0, 700);
    await expect.poll(() =>
      transcript.evaluate((element) => element.scrollTop),
    ).toBeGreaterThan(0);

    await page.getByTestId("details-mobile-church-context").locator("summary").click();
    await expect(page.getByTestId("text-mobile-profile-context")).toHaveText(
      "E2E Church",
    );

    const draft = `A mobile message with a very long word ${"withoutbreaks".repeat(10)}`;
    await page.getByTestId("input-message").fill(draft);
    await expect(page.getByTestId("button-send-message")).toBeEnabled();
    const sendResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(
          `/api/assistant/conversations/${assistantConversation.id}/messages`,
        ) && response.request().method() === "POST",
    );
    await page.getByTestId("button-send-message").click();
    await sendResponse;
    await expect(page.getByTestId("input-message")).toHaveValue("");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `Assistant page overflows at ${width}px`).toBeLessThanOrEqual(
      1,
    );
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/assistant");
  await expect(page.getByTestId("list-conversations")).toBeVisible();
  await expect(page.getByTestId("input-search-conversations")).toBeHidden();
  await expect(
    page.getByTestId(`button-select-conversation-${assistantArchivedConversation.id}`),
  ).toBeVisible();
});
