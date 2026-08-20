// =============================================================================
// connect-return
// =============================================================================
// The landing pad for Stripe's hosted onboarding, and a redirect back into the
// app.
//
// ## Why this exists at all
//
// Account Links only accept https URLs — a custom scheme like `msn://payouts`
// is rejected outright with "Not a valid URL". That is fine for the Laravel app,
// whose return_url is just another web route, but a phone app has nowhere on
// the web to land. So this is the smallest possible web page: Stripe sends the
// practitioner here, and it sends them straight on to the app.
//
// GET only, no auth. It carries no secrets and does nothing but redirect —
// requiring a token would break it, because Stripe redirects a browser here and
// the browser has no Supabase session.
//
// `?state=complete` or `?state=refresh`, passed through so the app knows
// whether onboarding finished or was abandoned and needs restarting.

const APP_SCHEME = Deno.env.get("DEEP_LINK_SCHEME") ?? "msn";

Deno.serve((req: Request) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") === "refresh" ? "refresh" : "complete";
  const target = `${APP_SCHEME}://payouts?onboarding=${state}`;

  // A meta-refresh page rather than a bare 302: iOS Safari will not always
  // follow a redirect straight into a custom scheme, and a visible link is the
  // fallback for anyone whose browser refuses entirely.
  const body = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="0;url=${target}">
<title>Returning to My Source Network</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; background: #F9F6F2;
         color: #343331; display: grid; place-items: center; height: 100vh; margin: 0; }
  a { color: #913688; }
</style>
</head><body>
  <p>Taking you back to the app… <a href="${target}">Tap here if nothing happens.</a></p>
</body></html>`;

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
});
