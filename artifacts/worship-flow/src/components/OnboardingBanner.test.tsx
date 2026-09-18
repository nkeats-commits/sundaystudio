import assert from "node:assert/strict";
import { test, beforeEach, afterEach, mock } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

Object.defineProperties(globalThis, {
  window: { configurable: true, writable: true, value: dom.window },
  document: { configurable: true, writable: true, value: dom.window.document },
  navigator: { configurable: true, writable: true, value: dom.window.navigator },
  HTMLElement: { configurable: true, writable: true, value: dom.window.HTMLElement },
  Node: { configurable: true, writable: true, value: dom.window.Node },
  getComputedStyle: { configurable: true, writable: true, value: dom.window.getComputedStyle },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, writable: true, value: true },
});
Object.defineProperty(globalThis, "React", {
  configurable: true,
  writable: true,
  value: React,
});

mock.module("wouter", {
  namedExports: {
    Link: ({
      href,
      children,
    }: {
      href: string;
      children: React.ReactNode;
    }) => React.createElement("a", { href }, children),
  },
});

mock.module("lucide-react", {
  namedExports: {
    Check: () => React.createElement("span"),
    ArrowRight: () => React.createElement("span"),
    Sparkles: () => React.createElement("span"),
  },
});

const { render, screen, cleanup } = await import("@testing-library/react");
const { OnboardingBanner } = await import("./OnboardingBanner");

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  cleanup();
});

test("derives onboarding content progress from dashboard counts without archive queries", () => {
  render(
    <OnboardingBanner
      dashboard={{
        verseOfDay: { text: "Be still", reference: "Psalm 46:10" },
        recentServices: [],
        servicesThisMonth: 1,
        librarySize: 0,
        totalServices: 1,
        suggestions: [],
        trial: {
          isActive: true,
          daysLeft: 10,
          trialEndsAt: "2026-09-13T00:00:00.000Z",
          activated: true,
          servicePlans: 1,
          sermons: 0,
          libraryItems: 0,
        },
      }}
      dashboardLoading={false}
      dashboardError={false}
      me={{
        userId: "user-1",
        email: "pastor@example.com",
        firstName: "Pastor",
        lastName: "Example",
        imageUrl: null,
        onboardingCompletedAt: null,
        profile: null,
      }}
      meLoading={false}
    />,
  );

  assert.match(screen.getByText(/2 of 3 complete/).textContent ?? "", /2 of 3 complete/);
  assert.match(screen.getByText("Draft your first sermon or service").textContent ?? "", /Draft/);
  assert.match(screen.getByText("Save a complete service plan").textContent ?? "", /Save/);
});

test("waits for the dashboard summary before deciding onboarding visibility", () => {
  render(
    <OnboardingBanner
      dashboard={undefined}
      dashboardLoading={true}
      dashboardError={false}
      me={undefined}
      meLoading={true}
    />,
  );

  assert.ok(screen.getByTestId("loading-onboarding"));
  assert.doesNotMatch(screen.getByTestId("loading-onboarding").className, /h-32/);
});