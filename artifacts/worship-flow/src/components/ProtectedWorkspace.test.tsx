import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
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
  Element: { configurable: true, writable: true, value: dom.window.Element },
  Node: { configurable: true, writable: true, value: dom.window.Node },
  Event: { configurable: true, writable: true, value: dom.window.Event },
  CustomEvent: { configurable: true, writable: true, value: dom.window.CustomEvent },
  MouseEvent: { configurable: true, writable: true, value: dom.window.MouseEvent },
  FocusEvent: { configurable: true, writable: true, value: dom.window.FocusEvent },
  getComputedStyle: {
    configurable: true,
    writable: true,
    value: dom.window.getComputedStyle,
  },
  IS_REACT_ACT_ENVIRONMENT: { configurable: true, writable: true, value: true },
});
Object.defineProperty(globalThis, "React", {
  configurable: true,
  writable: true,
  value: React,
});

type QueryStub = {
  data?: { state: { kind: string; [key: string]: unknown } };
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

let retryCount = 0;
const retry = async () => {
  retryCount += 1;
  return {};
};
const makeQuery = (
  kind?: string,
  flags: Partial<Pick<QueryStub, "isLoading" | "isError" | "isFetching">> = {},
): QueryStub => ({
  ...(kind ? { data: { state: { kind } } } : {}),
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: retry,
  ...flags,
});
let currentQuery = makeQuery();

mock.module("@workspace/api-client-react", {
  namedExports: {
    useGetBillingStatus: () => currentQuery,
    getGetBillingStatusQueryKey: () => ["billing", "status"],
  },
});
mock.module("wouter", {
  namedExports: {
    useLocation: () => ["/", () => undefined],
  },
});

const { cleanup, fireEvent, render, renderHook, screen } = await import(
  "@testing-library/react"
);
const { ProtectedWorkspace } = await import("./ProtectedWorkspace");
const { useSubscriptionStatus } = await import("../hooks/useSubscriptionStatus");

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  retryCount = 0;
  currentQuery = makeQuery();
});

test("only a successfully verified trial or subscription grants client access", () => {
  const { result, rerender } = renderHook(() => useSubscriptionStatus());

  for (const kind of ["trial", "active", "trialing"]) {
    currentQuery = makeQuery(kind);
    rerender();
    assert.equal(result.current.allowed, true, `${kind} should be allowed`);
  }

  for (const kind of ["enrollment_required", "expired"]) {
    currentQuery = makeQuery(kind);
    rerender();
    assert.equal(result.current.allowed, false, `${kind} should be blocked`);
  }

  currentQuery = makeQuery("active", { isError: true });
  rerender();
  assert.equal(result.current.allowed, false, "an error must override stale access data");
});

test("billing verification failure blocks the workspace and offers a retry without signing out", async () => {
  currentQuery = makeQuery(undefined, { isError: true });
  function Dashboard() {
    return <p>Dashboard workspace</p>;
  }

  const { rerender } = render(<ProtectedWorkspace component={Dashboard} />);
  assert.match(screen.getByRole("alert").textContent ?? "", /sign-in is still active/i);
  assert.equal(screen.queryByText("Dashboard workspace"), null);

  fireEvent.click(screen.getByRole("button", { name: "Retry verification" }));
  assert.equal(retryCount, 1);
  assert.equal(screen.queryByText("Dashboard workspace"), null);

  currentQuery = makeQuery("trial");
  rerender(<ProtectedWorkspace component={Dashboard} />);
  assert.ok(screen.getByText("Dashboard workspace"));
});