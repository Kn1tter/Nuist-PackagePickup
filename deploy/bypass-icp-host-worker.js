import { connect } from "cloudflare:sockets";

const ORIGIN_IP = "47.117.146.86";
const ORIGIN_PORT = 80;
const CRLF = "\r\n";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") || "origin";
    const debug = url.searchParams.get("debug") === "1";

    if (url.searchParams.get("ping") === "1") {
      return Response.json({ ok: true, marker: "socket-v5" });
    }

    const targetHost = mode === "example" ? "example.com" : ORIGIN_IP;
    const hostHeader = mode === "example" ? "example.com" : ORIGIN_IP;
    const path = mode === "example" ? "/" : (url.pathname || "/") + url.search;

    try {
      const socket = connect({ hostname: targetHost, port: ORIGIN_PORT });
      await socket.opened;

      const writer = socket.writable.getWriter();
      const encoder = new TextEncoder();
      const req =
        `GET ${path} HTTP/1.1${CRLF}` +
        `Host: ${hostHeader}${CRLF}` +
        `Connection: close${CRLF}` +
        `Accept: */*${CRLF}` +
        `User-Agent: CF-Worker-Bypass/1.0${CRLF}` +
        CRLF;

      await writer.write(encoder.encode(req));
      await writer.close();

      const reader = socket.readable.getReader();
      const chunks = [];
      let total = 0;
      let reads = 0;
      while (reads < 50) {
        const { done, value } = await reader.read();
        reads += 1;
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
        if (total > 2_000_000) break;
      }

      const buf = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        buf.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const text = new TextDecoder().decode(buf);

      if (debug || mode === "example") {
        return Response.json({
          marker: "socket-v5",
          mode,
          opened: true,
          len: total,
          reads,
          head: text.slice(0, 400),
        });
      }

      if (!total) {
        return Response.json(
          { marker: "socket-v5", error: "empty origin response" },
          { status: 502 },
        );
      }

      const sep = text.indexOf(CRLF + CRLF);
      if (sep < 0) {
        return new Response(text, {
          status: 502,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      const headText = text.slice(0, sep);
      const bodyText = text.slice(sep + 4);
      const status = parseInt(
        (headText.split(CRLF)[0] || "").split(" ")[1] || "502",
        10,
      );
      const outHeaders = new Headers();
      for (const line of headText.split(CRLF).slice(1)) {
        const i = line.indexOf(":");
        if (i < 0) continue;
        const key = line.slice(0, i).trim();
        const value = line.slice(i + 1).trim();
        const lower = key.toLowerCase();
        if (
          ["transfer-encoding", "connection", "keep-alive", "content-length"].includes(
            lower,
          )
        ) {
          continue;
        }
        outHeaders.set(key, value);
      }

      return new Response(bodyText, { status, headers: outHeaders });
    } catch (error) {
      return Response.json(
        {
          marker: "socket-v5",
          error: String(error),
          name: error && error.name,
          message: error && error.message,
        },
        { status: 502 },
      );
    }
  },
};
