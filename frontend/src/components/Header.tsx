import { navigate, type Route } from "../App";

export function Header({ route }: { route: Route }) {
  return (
    <header className="header">
      <span className="header-title">Mapeo de imágenes</span>
      <nav className="header-nav">
        <button className={route.name === "selection" ? "active" : ""} onClick={() => navigate("/")}>
          Selección
        </button>
        <button className={route.name === "import" ? "active" : ""} onClick={() => navigate("/import")}>
          Importar CSV
        </button>
      </nav>
    </header>
  );
}
