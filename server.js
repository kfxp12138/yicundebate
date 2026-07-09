const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 5177);
const host = process.env.HOST || "127.0.0.1";
const votes = {
  affirm: 0,
  negative: 0,
};
const choices = new Map();
const clients = new Set();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getVoterIdFromUrl(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams.get("voterId") || "";
}

function snapshot(voterId = "") {
  return {
    affirm: votes.affirm,
    negative: votes.negative,
    choice: voterId ? choices.get(voterId) || "" : "",
  };
}

function hashVoterId(voterId) {
  return crypto.createHash("sha256").update(voterId).digest("hex").slice(0, 16);
}

function detailSnapshot(voterId = "") {
  return {
    ...snapshot(voterId),
    voters: Array.from(choices.entries()).map(([id, choice]) => ({
      id: hashVoterId(id),
      choice,
    })),
  };
}

function broadcast() {
  const data = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) {
    res.write(data);
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/votes") {
    sendJson(res, snapshot(url.searchParams.get("voterId") || ""));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/votes/detail") {
    sendJson(res, detailSnapshot(url.searchParams.get("voterId") || ""));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/votes/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify(snapshot(getVoterIdFromUrl(req)))}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/vote") {
    try {
      const body = await readBody(req);
      const team = body.team;
      const voterId = String(body.voterId || "");
      if (!["affirm", "negative"].includes(team) || !voterId) {
        sendJson(res, { error: "invalid vote" }, 400);
        return;
      }

      const previous = choices.get(voterId);
      if (previous && previous !== team) votes[previous] = Math.max(0, votes[previous] - 1);
      if (previous !== team) votes[team] += 1;
      choices.set(voterId, team);
      broadcast();
      sendJson(res, snapshot(voterId));
    } catch {
      sendJson(res, { error: "bad request" }, 400);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reset") {
    votes.affirm = 0;
    votes.negative = 0;
    choices.clear();
    broadcast();
    sendJson(res, snapshot());
    return;
  }

  sendJson(res, { error: "not found" }, 404);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(root, rawPath));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`Debate control server running at http://${host}:${port}`);
});
