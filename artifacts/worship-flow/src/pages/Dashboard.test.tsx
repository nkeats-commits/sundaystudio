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

const Icon = () => React.createElement("span");

mock.module("@clerk/react", {
  namedExports: {
    useUser: () => ({ user: { firstName: "Jane", fullName: "Jane Smith" } }),
  },
});

mock.module("wouter", {
  namedExports: {
    Link: ({
      href,
      children,
      ...props
    }: {
      href: string;
      children: React.ReactNode;
      [key: string]: unknown;
    }) => React.createElement("a", { href, ...props }, children),
    useLocation: () => ["/dashboard", () => undefined],
  },
});

mock.module("lucide-react", {
  namedExports: {
    Layers: Icon,
    Music: Icon,
    BookOpen: Icon,
    Mic: Icon,
    Users: Icon,
    Calendar: Icon,
    ChevronRight: Icon,
    FileText: Icon,
    Sparkles: Icon,
    PenLine: Icon,
    ArrowRight: Icon,
    CheckCircle2: Icon,
  },
});

mock.module("@workspace/api-client-react", {
  namedExports: {
    useGetDashboard: () => dashboardState,
    useGetMe: () => meState,
    useRecordTrialEvent: () => ({ mutate: () => undefined }),
  },
});

mock.module("../components/layout/AppLayout", {
  namedExports: {
    AppLayout: ({ children }: { children: React.ReactNode }) =>
      React.createElement("main", null, children),
  },
});
mock.module("../components/OnboardingBanner", {
  namedExports: { OnboardingBanner: () => null },
});
mock.module("../components/UpgradeBanner", {
  namedExports: { UpgradeBanner: () => null },
});
mock.module("../components/PersonalizationCard", {
  namedExports: { PersonalizationCard: () => null },
});

type DashboardState = {
  data: undefined | {
    verseOfDay: { text: string; reference: string };
    recentServices: {
      id: number;
      title: string;
      scripture: string;
      theme: string;
      season: string;
      serviceDate: Date | null;
    }[];
    servicesThisMonth: number;
    librarySize: number;
    totalServices: number;
    suggestions: [];
    trial: {
      isActive: boolean;
      daysLeft: number | null;
      trialEndsAt: string | null;
      activated: boolean;
      servicePlans: number;
      sermons: number;
      libraryItems: number;
    };
  };
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<void>;
};

let dashboardState: DashboardState;
const meState = {
  data: {
    userId: "user-1",
    email: "jane@example.com",
    firstName: "Jane",
    lastName: "Smith",
    imageUrl: null,
    onboardingCompletedAt: null,
    profile: null,
  },
  isLoading: false,
};

const successState: DashboardState = {
  data: {
    verseOfDay: { text: "Be still", reference: "Psalm 46:10" },
    recentServices: [
      {
        id: 42,
        title: "Sunday Gathering",
        scripture: "John 3:16",
        theme: "Grace",
        season: "Ordinary Time",
        serviceDate: null,
      },
    ],
    servicesThisMonth: 1,
    librarySize: 2,
    totalServices: 1,
    suggestions: [],
    trial: {
      isActive: false,
      daysLeft: null,
      trialEndsAt: null,
      activated: true,
      servicePlans: 1,
      sermons: 0,
      libraryItems: 2,
    },
  },
  isLoading: false,
  isError: false,
  refetch: async () => undefined,
};

const { render, screen, waitFor, cleanup } = await import("@testing-library/react");
const { default: Dashboard } = await import("./Dashboard");

beforeEach(() => {
  document.body.innerHTML = "";
  dashboardState = {
    ...successState,
    data: undefined,
    isLoading: true,
    isError: false,
  };
});

afterEach(() => {
  cleanup();
});

test("renders welcome and quick actions while the summary request is pending", () => {
  render(<Dashboard />);

  assert.ok(screen.getByTestId("text-dashboard-welcome"));
  assert.ok(screen.getByTestId("link-quick-action-0"));
  assert.ok(screen.getByTestId("loading-recent-service-0"));
  assert.ok(screen.getByTestId("loading-verse"));
});

test("keeps quick actions visible and recovers after a summary error", async () => {
  const { rerender } = render(<Dashboard />);
  dashboardState = {
    ...successState,
    data: undefined,
    isLoading: false,
    isError: true,
    refetch: async () => {
      dashboardState = successState;
      rerender(<Dashboard />);
    },
  };
  rerender(<Dashboard />);

  assert.ok(screen.getByRole("alert"));
  assert.ok(screen.getByTestId("link-quick-action-0"));
  screen.getByTestId("button-retry-dashboard").click();

  await waitFor(() => {
    assert.ok(screen.getByTestId("card-recent-service-42"));
  });
});