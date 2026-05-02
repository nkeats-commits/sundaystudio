import { useEffect } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useUser } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Toaster } from "sonner";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import ServiceBuilder from "./pages/ServiceBuilder";
import Services from "./pages/Services";
import ServiceDetail from "./pages/ServiceDetail";
import LiturgyGenerator from "./pages/LiturgyGenerator";
import SongGenerator from "./pages/SongGenerator";
import SpeakingMomentGenerator from "./pages/SpeakingMomentGenerator";
import DevotionalGenerator from "./pages/DevotionalGenerator";
import Library from "./pages/Library";
import ChurchProfile from "./pages/ChurchProfile";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient();

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#1F2A44",
    colorBackground: "#FFFDF8",
    colorForeground: "#1E293B",
    colorMutedForeground: "#64748B",
    colorInput: "#F8F4EA",
    colorInputForeground: "#1E293B",
    colorNeutral: "#E5E1D8",
    colorDanger: "#B42318",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#FFFDF8] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#E5E1D8] shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-[#1F2A44] text-2xl",
    headerSubtitle: "text-[#64748B]",
    socialButtonsBlockButtonText: "text-[#1E293B] font-medium",
    formFieldLabel: "text-[#1E293B] font-medium",
    footerActionLink: "text-[#C99A3D] hover:text-[#b58935]",
    footerActionText: "text-[#64748B]",
    dividerText: "text-[#64748B]",
    identityPreviewEditButton: "text-[#C99A3D]",
    formFieldSuccessText: "text-[#3F6B4F]",
    alertText: "text-[#B42318]",
    logoBox: "",
    logoImage: "h-12 w-auto",
    socialButtonsBlockButton: "border border-[#E5E1D8] hover:bg-[#F8F4EA]",
    formButtonPrimary: "bg-[#1F2A44] hover:bg-[#161e30] text-white",
    formFieldInput: "bg-[#F8F4EA] border-[#E5E1D8] text-[#1E293B]",
    footerAction: "",
    dividerLine: "bg-[#E5E1D8]",
    alert: "bg-[#F8F4EA] border-[#B42318]",
    otpCodeFieldInput: "bg-[#F8F4EA] border-[#E5E1D8] text-[#1E293B]",
    formFieldRow: "",
    main: "",
  },
};

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full flex bg-[#F8F4EA]">
      <div className="hidden md:flex flex-1 flex-col items-center justify-center p-12 bg-gradient-to-b from-[#1F2A44] to-[#161e30] text-[#FFFDF8] relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-overlay"></div>
        <div className="relative z-10 max-w-lg text-center">
          <img src={`${basePath}/logo.svg`} alt="WorshipFlow" className="w-16 h-16 mx-auto mb-8 opacity-90" />
          <blockquote className="text-3xl font-serif italic leading-relaxed text-[#F3E7C6] mb-6">
            "Let the message of Christ dwell among you richly as you teach and admonish one another with all wisdom through psalms, hymns, and songs from the Spirit."
          </blockquote>
          <p className="text-[#64748B] text-lg font-serif">— Colossians 3:16</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 md:px-8 py-12">
        <div className="w-full max-w-[440px]">
          <div className="md:hidden flex flex-col items-center justify-center mb-8">
            <img src={`${basePath}/logo.svg`} alt="WorshipFlow" className="w-12 h-12 mb-4" />
            <h1 className="font-serif text-2xl text-[#1F2A44]">WorshipFlow</h1>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <AuthLayout>
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthLayout>
  );
}

function SignUpPage() {
  return (
    <AuthLayout>
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthLayout>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

function RequireSignedIn({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        {children}
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ProtectedRoutes() {
  return (
    <RequireSignedIn>
      <Switch>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/service-builder" component={ServiceBuilder} />
        <Route path="/services" component={Services} />
        <Route path="/services/:id" component={ServiceDetail} />
        <Route path="/generators/liturgy" component={LiturgyGenerator} />
        <Route path="/generators/songs" component={SongGenerator} />
        <Route path="/generators/speaking-moment" component={SpeakingMomentGenerator} />
        <Route path="/generators/devotional" component={DevotionalGenerator} />
        <Route path="/library" component={Library} />
        <Route path="/church" component={ChurchProfile} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </RequireSignedIn>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to continue planning worship",
          },
        },
        signUp: {
          start: {
            title: "Begin planning with WorshipFlow",
            subtitle: "Create your account to get started",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/:rest*">
            <ProtectedRoutes />
          </Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
      <Toaster position="top-center" />
    </WouterRouter>
  );
}

export default App;
