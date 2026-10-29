// Same-origin measurement path entry point; the catch-all serves its subpaths.
import { onRequest as forward } from "./[[path]].js";

export async function onRequest(context) {
  return forward(context);
}
