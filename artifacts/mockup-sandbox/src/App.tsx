import { useEffect, useState, type ComponentType } from "react";

import { modules as discoveredModules } from "./.generated/mockup-components";

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;

function _resolveComponent(
  mod: Record<string, unknown>,
  name: string,
): ComponentType | undefined {
  const fns = Object.values(mod).filter(
    (v) => typeof v === "function",
  ) as ComponentType[];
  return (
    (mod.default as ComponentType) ||
    (mod.Preview as ComponentType) ||
    (mod[name] as ComponentType) ||
    fns[fns.length - 1]
  );
}

function PreviewRenderer({
  componentPath,
  modules,
}: {
  componentPath: string;
  modules: ModuleMap;
}) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    setComponent(null);
    setError(null);

    async function loadComponent(): Promise<void> {
      const key = `./components/mockups/${componentPath}.tsx`;
      const loader = modules[key];
      if (!loader) {
        setError(`No component found at ${componentPath}.tsx`);
        return;
      }

      try {
        const mod = await loader();
        if (cancelled) {
          return;
        }
        const name = componentPath.split("/").pop()!;
        const comp = _resolveComponent(mod, name);
        if (!comp) {
          setError(
            `No exported React component found in ${componentPath}.tsx\n\nMake sure the file has at least one exported function component.`,
          );
          return;
        }
        setComponent(() => comp);
      } catch (e) {
        if (cancelled) {
          return;
        }

        const message = e instanceof Error ? e.message : String(e);
        setError(`Failed to load preview.\n${message}`);
      }
    }

    void loadComponent();

    return () => {
      cancelled = true;
    };
  }, [componentPath, modules]);

  if (error) {
    return (
      <pre style={{ color: "red", padding: "2rem", fontFamily: "system-ui" }}>
        {error}
      </pre>
    );
  }

  if (!Component) return null;

  return <Component />;
}

function getBasePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

function Gallery() {
  const basePath = getBasePath();
  const directions = [
    {
      number: "01",
      title: "The work of Sunday",
      component: "LandingEditorial",
      premise: "A pastoral editorial story about carrying a passage into the gathering.",
      audience: "For leaders who want the page to feel human, reflective, and rooted in ministry.",
      tradeoff: "Voice comes first; the product itself appears later.",
    },
    {
      number: "02",
      title: "Passage to service",
      component: "LandingProductVignette",
      premise: "An illustrative Matthew 11:28–30 sample makes the product and church context visible.",
      audience: "For visitors who need to see what Sunday Studio helps them prepare.",
      tradeoff: "The sample is concrete, but one example cannot represent every church.",
    },
    {
      number: "03",
      title: "Shape it together",
      component: "LandingTeamWorkflow",
      premise: "A leader shapes a draft, reviews it, then shares a clear order with the team.",
      audience: "For ministry leaders thinking about the people who serve alongside them.",
      tradeoff: "The handoff is prominent; individual writing tools get less space.",
    },
  ];

  return (
    <main
      className="min-h-screen"
      style={{
        background: "#fbf8f4",
        color: "#111b34",
        fontFamily: "Inter, sans-serif",
        padding: "clamp(24px, 5vw, 72px)",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <p
          className="mb-4 text-xs font-semibold uppercase tracking-[0.18em]"
          style={{ color: "#9a7949" }}
        >
          Sunday Studio · Landing page exploration
        </p>
        <h1
          className="mb-5 max-w-3xl text-4xl leading-tight md:text-6xl"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Three ways to tell the story behind Sunday.
        </h1>
        <p className="mb-10 max-w-2xl text-base leading-relaxed" style={{ color: "#6b5e52" }}>
          Each direction keeps the same warm brand and trial offer, but makes a different case
          for why ministry leaders might want a more thoughtful place to prepare. These are
          preview concepts only; the public landing page has not changed.
        </p>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {directions.map((direction) => (
            <a
              key={direction.component}
              href={`${basePath}/preview/worship-flow/${direction.component}`}
              className="group flex min-h-80 flex-col rounded-2xl border p-6 transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-4"
              style={{
                background: "#fffdf8",
                borderColor: "#ddd0be",
                color: "#111b34",
                textDecoration: "none",
              }}
            >
              <span className="mb-5 text-xs font-semibold tracking-[0.16em]" style={{ color: "#a27e4d" }}>
                DIRECTION {direction.number}
              </span>
              <h2
                className="mb-3 text-2xl"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {direction.title}
              </h2>
              <p className="mb-6 text-sm leading-relaxed" style={{ color: "#475569" }}>
                {direction.premise}
              </p>
              <div className="mt-auto space-y-3 border-t pt-4" style={{ borderColor: "#e5ddd0" }}>
                <p className="text-xs leading-relaxed" style={{ color: "#6b5e52" }}>
                  <strong style={{ color: "#111b34" }}>Audience impression: </strong>
                  {direction.audience}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#6b5e52" }}>
                  <strong style={{ color: "#111b34" }}>Trade-off: </strong>
                  {direction.tradeoff}
                </p>
              </div>
              <span className="mt-5 text-sm font-semibold" style={{ color: "#111b34" }}>
                Open concept <span aria-hidden="true">→</span>
              </span>
            </a>
          ))}
        </div>

        <p className="mt-7 text-xs leading-relaxed" style={{ color: "#786f62" }}>
          The passage-to-service and service-plan examples are illustrative, not real church
          content or saved/generated plans.
        </p>
      </div>
    </main>
  );
}

function getPreviewPath(): string | null {
  const basePath = getBasePath();
  const { pathname } = window.location;
  const local =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || "/"
      : pathname;
  const match = local.match(/^\/preview\/(.+)$/);
  return match ? match[1] : null;
}

function App() {
  const previewPath = getPreviewPath();

  if (previewPath) {
    return (
      <PreviewRenderer
        componentPath={previewPath}
        modules={discoveredModules}
      />
    );
  }

  return <Gallery />;
}

export default App;
