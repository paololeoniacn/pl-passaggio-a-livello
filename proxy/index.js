import { createServer } from "node:http";

const PORT = parseInt(process.env.PORT ?? "8080", 10);
const PROXY_SECRET = process.env.PROXY_SECRET;
const VT_BASE = "http://www.viaggiatreno.it/";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

if (!PROXY_SECRET) {
  console.error("FATAL: PROXY_SECRET env var is not set");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  // Auth
  if (req.headers["x-proxy-secret"] !== PROXY_SECRET) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized");
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const target = parsedUrl.searchParams.get("url");

  // Validate target
  if (!target || !target.startsWith(VT_BASE)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden: only viaggiatreno.it URLs are allowed");
    return;
  }

  try {
    const vtRes = await fetch(target, {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: VT_BASE,
      },
    });

    const body = await vtRes.text();
    res.writeHead(vtRes.status, {
      "Content-Type": vtRes.headers.get("Content-Type") ?? "application/json",
    });
    res.end(body);
  } catch (err) {
    console.error("Proxy fetch error:", err);
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end(`Bad Gateway: ${String(err)}`);
  }
});

server.listen(PORT, () => {
  console.log(`VT proxy listening on port ${PORT}`);
});
