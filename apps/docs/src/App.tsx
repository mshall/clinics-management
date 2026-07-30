import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { MarkdownView } from "./components/MarkdownView";

import syncMeta from "../content/piggymetrics/SYNC.json";

const kiorlyModules = import.meta.glob<string>("../../../Docs/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const referenceModules = import.meta.glob<string>("../content/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

function loadRaw(modules: Record<string, string>, suffix: string, fallbackTitle: string): string {
  const key = Object.keys(modules).find((k) => k.endsWith(suffix));
  return key ? modules[key] : `# ${fallbackTitle}\n\nDocument not found: \`${suffix}\``;
}

function KiorlyDocPage({ file }: { file: string }) {
  return <MarkdownView source={loadRaw(kiorlyModules, file, file)} />;
}

function ReferenceDocPage({ suffix, title, withSync }: { suffix: string; title: string; withSync?: boolean }) {
  return (
    <MarkdownView
      source={loadRaw(referenceModules, suffix, title)}
      syncMeta={withSync ? syncMeta : undefined}
    />
  );
}

function HomePage() {
  return (
    <>
      <h1>Documentation portal</h1>
      <p>
        Standalone <strong>docs</strong> workspace for Kiorly Clinics Management. Renders project markdown from{" "}
        <code>Docs/</code> and syncs microservice reference material from{" "}
        <a href="https://github.com/sqshq/PiggyMetrics" target="_blank" rel="noreferrer">
          PiggyMetrics
        </a>{" "}
        (<code>master</code>).
      </p>

      <div className="home-card">
        <h2>View locally</h2>
        <p>From the repository root:</p>
        <pre>
          <code>{`npm install
npm run docs:sync
npm run docs:dev`}</code>
        </pre>
        <p>
          Open <a href="http://localhost:5175">http://localhost:5175</a>
        </p>
      </div>

      <div className="home-card">
        <h2>Production preview</h2>
        <pre>
          <code>{`npm run docs:build
npm run docs:preview`}</code>
        </pre>
        <p>
          Serves the static build at <a href="http://localhost:4175">http://localhost:4175</a>
        </p>
      </div>

      <div className="home-card">
        <h2>Refresh PiggyMetrics docs</h2>
        <pre>
          <code>npm run docs:sync</code>
        </pre>
        <p>
          Pulls the latest README from <code>sqshq/PiggyMetrics</code> master into{" "}
          <code>apps/docs/content/piggymetrics/</code>.
        </p>
      </div>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="kiorly/readme" element={<KiorlyDocPage file="README.md" />} />
        <Route path="kiorly/prd" element={<KiorlyDocPage file="Clinic_Management_System_PRD.md" />} />
        <Route path="kiorly/rfc" element={<KiorlyDocPage file="Clinic_Management_System_RFC.md" />} />
        <Route path="kiorly/test-users" element={<KiorlyDocPage file="Test_Data_Users.md" />} />
        <Route path="kiorly/aws" element={<KiorlyDocPage file="AWS_Cloud_Deployment_Guide.md" />} />
        <Route path="kiorly/portal" element={<KiorlyDocPage file="Documentation_Portal.md" />} />
        <Route
          path="reference/architecture"
          element={<ReferenceDocPage suffix="architecture-comparison.md" title="Architecture comparison" />}
        />
        <Route
          path="reference/piggymetrics"
          element={<ReferenceDocPage suffix="piggymetrics/README.md" title="PiggyMetrics" withSync />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
