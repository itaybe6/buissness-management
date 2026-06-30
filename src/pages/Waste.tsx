import { Navigate } from "react-router-dom";

/** Legacy route — waste lives under the inventory page. */
export function Waste() {
  return <Navigate to="/inventory?tab=waste" replace />;
}
