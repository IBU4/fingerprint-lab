export function onRequestGet({ request }) {
  return Response.redirect(new URL("/?mode=proxy", request.url).toString(), 302);
}
