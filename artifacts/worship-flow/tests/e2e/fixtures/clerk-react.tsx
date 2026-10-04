import type { ReactNode } from "react";

const testUser = {
  id: "scroll-e2e-owner",
  firstName: "Test",
  lastName: "Worship Leader",
  fullName: "Test Worship Leader",
  primaryEmailAddress: { emailAddress: "scroll-e2e@example.invalid" },
};

export function ClerkProvider({ children }: { children: ReactNode }) {
  return children;
}

export function Show({
  when,
  children,
  fallback = null,
}: {
  when: "signed-in" | "signed-out";
  children?: ReactNode;
  fallback?: ReactNode;
}) {
  const visible = when === "signed-in";
  return visible ? children : fallback;
}

export function SignIn() {
  return null;
}

export function SignUp() {
  return null;
}

export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    getToken: async () => "scroll-e2e-token",
  };
}

export function useUser() {
  return { isLoaded: true, isSignedIn: true, user: testUser };
}

export function useClerk() {
  return {
    loaded: true,
    signOut: async () => undefined,
    addListener: () => () => undefined,
  };
}