/**
 * OpenAI-compatible proxy that turns model "thinking" off.
 * A request for model "<name>-nothink" goes upstream as "<name>" with
 * chat_template_kwargs.enable_thinking = false. Other requests pass through unchanged.
 *
 * texel-studio reaches it through its Ollama route (OLLAMA_URL + OLLAMA_MODELS in its .env),
 * so only the "-nothink" model name uses this proxy.
 *
 * Usage: npx tsx tools/art/nothink-proxy.ts   (env: PORT=11490, UPSTREAM=http://127.0.0.1:11434)
 */
import http from "node:http";

const PORT = Number(process.env.PORT ?? 11490);
const UPSTREAM = new URL(process.env.UPSTREAM ?? "http://127.0.0.1:11434");
const SUFFIX = "-nothink";

const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    let body = Buffer.concat(chunks);
    if (req.method === "POST" && body.length && req.headers["content-type"]?.includes("json")) {
      try {
        const json = JSON.parse(body.toString("utf8"));
        if (typeof json.model === "string" && json.model.endsWith(SUFFIX)) {
          json.model = json.model.slice(0, -SUFFIX.length);
          json.chat_template_kwargs = { ...(json.chat_template_kwargs ?? {}), enable_thinking: false };
          body = Buffer.from(JSON.stringify(json));
        }
      } catch {
        // Not JSON after all: forward unchanged.
      }
    }
    const headers = { ...req.headers, host: UPSTREAM.host, "content-length": String(body.length) };
    const up = http.request(
      { hostname: UPSTREAM.hostname, port: UPSTREAM.port, path: req.url, method: req.method, headers },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    up.on("error", (e) => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    });
    up.end(body);
  });
});

// No timeouts: one model step can take minutes.
server.requestTimeout = 0;
server.headersTimeout = 0;
server.listen(PORT, "127.0.0.1", () => console.log(`nothink proxy on 127.0.0.1:${PORT} -> ${UPSTREAM.origin}`));
