import { navigate, type Route } from "../App";

export function Header({
  route,
  userEmail,
  onLogout,
}: {
  route: Route;
  userEmail: string;
  onLogout: () => void;
}) {
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
        <span className="header-user">{userEmail}</span>
        <button className="header-logout" onClick={onLogout}>
          Cerrar sesión
        </button>
      </nav>
    </header>
  );
}
