import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { JSDOM } from "jsdom";
import React from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/admin",
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

let currentIsOwner = false;

mock.module("../hooks/useIsOwner", {
  namedExports: {
    useIsOwner: () => ({ isOwner: currentIsOwner, isLoading: false }),
  },
});

mock.module("../pages/NotFound", {
  namedExports: {
    NotFound: () => (
      <div data-testid="safe-not-found">This page wandered off</div>
    ),
  },
});

const adminScreen = (name: string) => () => (
  <div data-testid={`admin-screen-${name}`}>{name} admin data</div>
);

mock.module("./adminScreens", {
  namedExports: {
    AdminOverview: adminScreen("overview"),
    AdminUsers: adminScreen("users"),
    AdminUserDetail: adminScreen("user-detail"),
    AdminEmailEvents: adminScreen("email-events"),
    AdminHelpArticles: adminScreen("help-articles"),
    AdminHelpArticleEdit: adminScreen("help-article-edit"),
  },
});

const { render, cleanup } = await import("@testing-library/react");
const { Router, Switch } = await import("wouter");
const { ADMIN_ROUTES, ADMIN_ROUTE_PATHS, AdminRoute } = await import(
  "./AdminRoutes"
);

const routeCases = [
  { route: "/admin", path: "/admin", marker: "overview" },
  { route: "/admin/users", path: "/admin/users", marker: "users" },
  {
    route: "/admin/users/:id",
    path: "/admin/users/42",
    marker: "user-detail",
  },
  { route: "/admin/email-events", path: "/admin/email-events", marker: "email-events" },
  {
    route: "/admin/help-articles/new",
    path: "/admin/help-articles/new",
    marker: "help-article-edit",
  },
  {
    route: "/admin/help-articles/:id",
    path: "/admin/help-articles/42",
    marker: "help-article-edit",
  },
  {
    route: "/admin/help-articles",
    path: "/admin/help-articles",
    marker: "help-articles",
  },
] as const;

const useTestLocation = (): [string, (path: string) => void] => [
  window.location.pathname,
  (_path: string) => undefined,
];

function renderAdminRoute(path: string) {
  window.history.replaceState({}, "", path);
  return render(
    <Router hook={useTestLocation}>
      <Switch>
        {ADMIN_ROUTES.map(({ path: routePath, Component }) => (
          <AdminRoute
            key={routePath}
            path={routePath}
            Component={Component}
            protect={(ProtectedComponent) => <ProtectedComponent />}
          />
        ))}
      </Switch>
    </Router>,
  );
}

beforeEach(() => {
  currentIsOwner = false;
  document.body.innerHTML = "";
});

afterEach(() => {
  cleanup();
});

test("keeps every mounted Admin route safe for non-owners who guess its URL", () => {
  assert.deepEqual(
    ADMIN_ROUTE_PATHS,
    routeCases.map(({ route }) => route),
    "the test should cover every route in the mounted Admin route tree",
  );

  for (const { path, marker } of routeCases) {
    const rendered = renderAdminRoute(path);

    assert.ok(
      rendered.getByTestId("safe-not-found"),
      `${path} should render the safe non-admin response`,
    );
    assert.equal(
      rendered.queryByTestId(`admin-screen-${marker}`),
      null,
      `${path} should not render admin data`,
    );

    rendered.unmount();
  }
});

test("still renders each Admin page for the owner at its mounted URL", () => {
  currentIsOwner = true;

  for (const { path, marker } of routeCases) {
    const rendered = renderAdminRoute(path);

    assert.ok(
      rendered.getByTestId(`admin-screen-${marker}`),
      `${path} should render its Admin page for the owner`,
    );
    assert.equal(rendered.queryByTestId("safe-not-found"), null);

    rendered.unmount();
  }
});