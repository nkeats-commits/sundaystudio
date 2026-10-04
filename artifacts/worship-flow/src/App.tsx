import { Component, useEffect, type ReactNode } from 'react';
import { ClerkProvider, SignIn, SignUp, Show, useAuth, useClerk } from "@clerk/react";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { Toaster, toast } from "sonner";
import {
  setBaseUrl,
  setAuthTokenGetter,
  setOnUnauthorized,
  setOnPaymentRequired,
} from "@workspace/api-client-react";
import {
  setJobGenerateOnUnauthorized,
  setJobGenerateOnPaymentRequired,
  generatorPagePath,
} from "./hooks/useJobGenerate";
import {
  GenerationJobStoreProvider,
  setGenerationJobStoreTokenGetter,
  setGenerationJobStoreOnUnauthorized,
  setGenerationJobStoreOnPaymentRequired,
  setGenerationJobStoreOnJobComplete,
  type JobEntry,
} from "./contexts/GenerationJobStore";
import Paywalled from "./components/Paywalled";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import ServiceBuilder from "./pages/ServiceBuilder";
import Services from "./pages/Services";
import ServiceDetail from "./pages/ServiceDetail";
import ServicePlanPrint from "./pages/ServicePlanPrint";
import LiturgyGenerator from "./pages/LiturgyGenerator";
import SongGenerator from "./pages/SongGenerator";
import SpeakingMomentGenerator from "./pages/SpeakingMomentGenerator";
import DevotionalGenerator from "./pages/DevotionalGenerator";
import SoulCareGenerator from "./pages/SoulCareGenerator";
import Library from "./pages/Library";
import ChurchProfile from "./pages/ChurchProfile";
import Assistant from "./pages/Assistant";
import Settings from "./pages/Settings";
import SermonBuilder from "./pages/SermonBuilder";
import SermonArchive from "./pages/SermonArchive";
import SermonSeriesArchive from "./pages/SermonSeriesArchive";
import SermonSeriesDetail from "./pages/SermonSeriesDetail";
import BibleTools from "./pages/BibleTools";
import ResourceLibrary from "./pages/ResourceLibrary";
import Integrations from "./pages/Integrations";
import Pricing from "./pages/Pricing";
import Billing from "./pages/Billing";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import HelpCenter from "./pages/HelpCenter";
import HelpArticle from "./pages/HelpArticle";
import { ADMIN_ROUTES, AdminRoute } from "./components/AdminRoutes";
import NotFound from "./pages/NotFound";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { ClerkQueryClientCacheInvalidator } from "./components/ClerkQueryClientCacheInvalidator";
import { TrialEndedModal } from "./components/TrialEndedModal";
import { ProtectedWorkspace } from "./components/ProtectedWorkspace";
import { NativeAppBridge } from "./mobile/NativeAppBridge";
import { isNativeApp, mobileApiBaseUrl } from "./mobile/nativeRuntime";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient();

setBaseUrl(isNativeApp() ? mobileApiBaseUrl : null);

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
    alternativeMethodsBlockButtonText: "text-[#1E293B]",
    identityPreviewText: "text-[#1E293B]",
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
          <img src={`${basePath}/logo.svg`} alt="Sunday Studio" className="w-16 h-16 mx-auto mb-8 opacity-90" />
          <blockquote className="text-3xl font-serif italic leading-relaxed text-[#F3E7C6] mb-6">
            "Let the message of Christ dwell among you richly as you teach and admonish one another with all wisdom through psalms, hymns, and songs from the Spirit."
          </blockquote>
          <p className="text-[#64748B] text-lg font-serif">— Colossians 3:16</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center px-4 md:px-8 py-12">
        <div className="w-full max-w-[440px]">
          <div className="md:hidden flex flex-col items-center justify-center mb-8">
            <img src={`${basePath}/logo.svg`} alt="Sunday Studio" className="w-12 h-12 mb-4" />
            <h1 className="font-serif text-2xl text-[#1F2A44]">Sunday Studio</h1>
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

/**
 * Bridges Clerk auth into the API client and the streaming hook:
 *   1. Every API request gets a freshly-minted Clerk session JWT in
 *      `Authorization: Bearer <token>`, so the server doesn't depend on
 *      the browser's session cookie staying in sync with Clerk's
 *      client-side session refreshes.
 *   2. On any 401 response, sign the user out, surface a toast, and send
 *      them to the sign-in page — but at most once per session, so a
 *      burst of failing requests doesn't fire the same handler N times.
 */
function ClerkAuthBootstrap() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const handlingUnauthorizedRef = useRef(false);

  // Reset the once-per-session guard whenever the user signs back in.
  useEffect(() => {
    if (isSignedIn) {
      handlingUnauthorizedRef.current = false;
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (!isLoaded) return;

    // Install (or remove) the token getter based on auth state.  We re-key
    // on `isSignedIn` so that signing back in after a forced sign-out
    // re-installs a fresh getter, even if Clerk's `getToken` reference is
    // stable across the transition.  When signed out we clear the getter
    // entirely so subsequent calls don't even bother asking Clerk for a
    // token they cannot obtain.
    if (isSignedIn) {
      const tokenGetter = async () => {
        try {
          return await getToken();
        } catch {
          return null;
        }
      };
      setAuthTokenGetter(tokenGetter);
      setGenerationJobStoreTokenGetter(tokenGetter);
    } else {
      setAuthTokenGetter(null);
      setGenerationJobStoreTokenGetter(null);
    }

    const handleUnauthorized = () => {
      // A signed-out visitor receiving a 401 is expected — only treat it as
      // an expired session when the user was previously confirmed signed in.
      if (!isSignedIn) return;
      if (handlingUnauthorizedRef.current) return;
      handlingUnauthorizedRef.current = true;
      // Note: do NOT clear the auth token getter here.  After the user
      // signs back in, the same getter will start returning a fresh JWT
      // again — clearing it would silently disable Bearer auth for the
      // rest of the page lifetime.
      toast.error("Your session expired — please sign in again.");
      // Fire-and-forget: sign out then redirect.  Either step succeeding is
      // enough to get the user back to a clean state.
      void signOut().finally(() => {
        setLocation("/sign-in");
      });
    };

    setOnUnauthorized(handleUnauthorized);
    setJobGenerateOnUnauthorized(handleUnauthorized);
    setGenerationJobStoreOnUnauthorized(handleUnauthorized);

    // 402 from a gated mutation → bounce to /pricing with a toast (once
    // per burst, like 401 handling above, since a page can fire several
    // gated calls at the same time).
    const paymentRedirectingRef = { current: false };
    const handlePaymentRequired = ({ url }: { url: string }) => {
      // Don't bounce when the failing request *is* one of the billing
      // endpoints — the page already renders the appropriate state.
      if (url.includes("/api/billing/")) return;
      if (paymentRedirectingRef.current) return;
      paymentRedirectingRef.current = true;
      toast.error("Your trial has ended — subscribe to keep going.");
      setLocation("/pricing");
      // Re-arm after a tick so future bounces still work.
      setTimeout(() => {
        paymentRedirectingRef.current = false;
      }, 1500);
    };
    setOnPaymentRequired(handlePaymentRequired);
    setJobGenerateOnPaymentRequired(handlePaymentRequired);
    setGenerationJobStoreOnPaymentRequired(handlePaymentRequired);

    return () => {
      setAuthTokenGetter(null);
      setGenerationJobStoreTokenGetter(null);
      setOnUnauthorized(null);
      setOnPaymentRequired(null);
      setJobGenerateOnUnauthorized(null);
      setJobGenerateOnPaymentRequired(null);
      setGenerationJobStoreOnUnauthorized(null);
      setGenerationJobStoreOnPaymentRequired(null);
    };
  }, [isLoaded, isSignedIn, getToken, signOut, setLocation]);

  return null;
}

/** Converts a pending job label to a "ready" notification message. */
function deriveReadyLabel(pendingLabel: string): string {
  if (pendingLabel.includes("liturgy")) return "Your liturgy is ready";
  if (pendingLabel.includes("songs")) return "Your songs are ready";
  if (pendingLabel.includes("speaking moment")) return "Your speaking moment is ready";
  if (pendingLabel.includes("devotional")) return "Your devotional is ready";
  if (pendingLabel.includes("soul care")) return "Your soul care content is ready";
  if (pendingLabel.includes("service plan")) return "Your service plan is ready";
  if (pendingLabel.includes("sermon")) return "Your sermon content is ready";
  return "Generation complete";
}

const GENERATION_TOAST_ID = "generation-complete";

/**
 * Subscribes to the GenerationJobStore's completion events and shows a
 * sonner toast when a job finishes while the user is away from that page.
 * A fixed toast ID ensures only one completion toast shows at a time.
 */
function GenerationCompleteToaster() {
  const [location, setLocation] = useLocation();
  const locationRef = useRef(location);
  const setLocationRef = useRef(setLocation);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    setLocationRef.current = setLocation;
  }, [setLocation]);

  useEffect(() => {
    setGenerationJobStoreOnJobComplete((entry: JobEntry) => {
      const pagePath = generatorPagePath(entry.startPath);
      if (locationRef.current === pagePath) return;

      const message = deriveReadyLabel(entry.label);
      toast(message, {
        id: GENERATION_TOAST_ID,
        duration: 8000,
        action: {
          label: "View",
          onClick: () => setLocationRef.current(pagePath),
        },
      });
    });

    return () => {
      setGenerationJobStoreOnJobComplete(null);
    };
  }, []);

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

function Protected({ component: Component }: { component: React.ComponentType }) {
  return (
    <RequireSignedIn>
      <ProtectedWorkspace component={Component} />
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
            title: "Begin planning with Sunday Studio",
            subtitle: "Create your account, then add a card to start 14 days free. $9.99/month after the trial.",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <GenerationJobStoreProvider>
        <NativeAppBridge />
        <ClerkQueryClientCacheInvalidator />
        <ClerkAuthBootstrap />
        <GenerationCompleteToaster />
        <OnboardingWizard />
        <TrialEndedModal />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/dashboard">{() => <Protected component={Dashboard} />}</Route>
          <Route path="/service-builder">{() => <Protected component={() => <Paywalled component={ServiceBuilder} />} />}</Route>
          <Route path="/services">{() => <Protected component={Services} />}</Route>
          <Route path="/services/:id/print">{() => <Protected component={ServicePlanPrint} />}</Route>
          <Route path="/services/:id">{() => <Protected component={() => <Paywalled component={ServiceDetail} />} />}</Route>
          <Route path="/generators/liturgy">{() => <Protected component={() => <Paywalled component={LiturgyGenerator} />} />}</Route>
          <Route path="/generators/songs">{() => <Protected component={() => <Paywalled component={SongGenerator} />} />}</Route>
          <Route path="/generators/speaking-moment">{() => <Protected component={() => <Paywalled component={SpeakingMomentGenerator} />} />}</Route>
          <Route path="/generators/devotional">{() => <Protected component={() => <Paywalled component={DevotionalGenerator} />} />}</Route>
          <Route path="/generators/soul-care">{() => <Protected component={() => <Paywalled component={SoulCareGenerator} />} />}</Route>
          <Route path="/library">{() => <Protected component={Library} />}</Route>
          <Route path="/sermons">{() => <Protected component={SermonArchive} />}</Route>
          <Route path="/sermons/series">{() => <Protected component={SermonSeriesArchive} />}</Route>
          <Route path="/sermons/series/:id">{() => <Protected component={() => <Paywalled component={SermonSeriesDetail} />} />}</Route>
          <Route path="/sermons/new">{() => <Protected component={() => <Paywalled component={SermonBuilder} />} />}</Route>
          <Route path="/sermons/:id">{() => <Protected component={() => <Paywalled component={SermonBuilder} />} />}</Route>
          <Route path="/bible-tools">{() => <Protected component={BibleTools} />}</Route>
          <Route path="/resources">{() => <Protected component={() => <Paywalled component={ResourceLibrary} />} />}</Route>
          <Route path="/church">{() => <Protected component={ChurchProfile} />}</Route>
          <Route path="/assistant">{() => <Protected component={Assistant} />}</Route>
          <Route path="/settings/integrations">{() => <Protected component={Integrations} />}</Route>
          <Route path="/settings">{() => <Protected component={Settings} />}</Route>
          <Route path="/pricing">{() => <Protected component={Pricing} />}</Route>
          <Route path="/billing">{() => <Protected component={Billing} />}</Route>
          <Route path="/help" component={HelpCenter} />
          <Route path="/help/:slug" component={HelpArticle} />
          <Route path="/privacy" component={PrivacyPolicy} />
          <Route path="/terms" component={TermsOfService} />
          {ADMIN_ROUTES.map(({ path, Component }) => (
            <AdminRoute
              key={path}
              path={path}
              Component={Component}
              protect={(component) => <Protected component={component} />}
            />
          ))}
          <Route>{() => <Protected component={NotFound} />}</Route>
        </Switch>
        </GenerationJobStoreProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[Sunday Studio ErrorBoundary]", error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#FFFDF8', color: '#1F2A44', minHeight: '100vh' }}>
          <h1 style={{ fontSize: 24, marginBottom: 16 }}>Something went wrong rendering this page.</h1>
          <pre style={{ background: '#F8F4EA', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', overflow: 'auto' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { this.setState({ error: null }); window.location.href = basePath || '/'; }}
            style={{ marginTop: 16, padding: '8px 16px', background: '#1F2A44', color: 'white', border: 0, borderRadius: 8, cursor: 'pointer' }}
          >
            Go home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
        <Toaster position="top-center" />
      </WouterRouter>
    </ErrorBoundary>
  );
}

export default App;
