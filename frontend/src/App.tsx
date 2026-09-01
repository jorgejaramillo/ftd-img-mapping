import { useEffect, useState } from "react";
import { Header } from "./components/Header";
import { ImportPage } from "./pages/ImportPage";
import { SelectionPage } from "./pages/SelectionPage";
import { ProcessingPage } from "./pages/ProcessingPage";
import { ResultsPage } from "./pages/ResultsPage";

export type Route =
  | { name: "selection" }
  | { name: "import" }
  | { name: "processing"; batchId: string }
  | { name: "results"; batchId: string };

function parseRoute(pathname: string): Route {
  const processingMatch = pathname.match(/^\/processing\/([^/]+)$/);
  if (processingMatch) return { name: "processing", batchId: processingMatch[1] };

  const resultsMatch = pathname.match(/^\/results\/([^/]+)$/);
  if (resultsMatch) return { name: "results", batchId: resultsMatch[1] };

  if (pathname === "/import") return { name: "import" };
  return { name: "selection" };
}

// Router minimalista basado en la History API — la app solo tiene 4 pantallas
// lineales, así que no se introduce una librería de routing como dependencia.
export function navigate(pathname: string) {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <div className="app">
      <Header route={route} />
      <main className="main">
        {route.name === "import" && <ImportPage />}
        {route.name === "selection" && <SelectionPage />}
        {route.name === "processing" && <ProcessingPage batchId={route.batchId} />}
        {route.name === "results" && <ResultsPage batchId={route.batchId} />}
      </main>
    </div>
  );
}
