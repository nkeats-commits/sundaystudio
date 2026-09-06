import type { ComponentType, ReactNode } from "react";
import { Route } from "wouter";
import {
  AdminOverview,
  AdminUsers,
  AdminUserDetail,
  AdminEmailEvents,
  AdminHelpArticles,
  AdminHelpArticleEdit,
} from "./adminScreens";
import { AdminOnly } from "./AdminOnly";

export const ADMIN_ROUTES = [
  { path: "/admin", Component: AdminOverview },
  { path: "/admin/users", Component: AdminUsers },
  { path: "/admin/users/:id", Component: AdminUserDetail },
  { path: "/admin/email-events", Component: AdminEmailEvents },
  { path: "/admin/help-articles/new", Component: AdminHelpArticleEdit },
  { path: "/admin/help-articles/:id", Component: AdminHelpArticleEdit },
  { path: "/admin/help-articles", Component: AdminHelpArticles },
] satisfies ReadonlyArray<{
  path: string;
  Component: ComponentType;
}>;

export const ADMIN_ROUTE_PATHS = ADMIN_ROUTES.map(({ path }) => path);

/**
 * Keeps one Admin route as a direct child of Wouter's Switch while applying
 * the same client-side ownership gate. `protect` lets App keep its signed-in
 * boundary around each page.
 */
export function AdminRoute({
  path,
  Component,
  protect,
}: {
  path: string;
  Component: ComponentType;
  protect: (component: ComponentType) => ReactNode;
}) {
  return (
    <Route path={path}>
      {() =>
        protect(() => (
          <AdminOnly>
            <Component />
          </AdminOnly>
        ))
      }
    </Route>
  );
}