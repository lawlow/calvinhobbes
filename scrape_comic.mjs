#!/usr/bin/env node
import { writeFileSync } from "node:fs";
const { Script, createContext } = await import("node:vm");

const PAGE_URL = "https://www.gocomics.com/calvinandhobbes";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchPage(cookie = "") {
  const headers = { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" };
  if (cookie) headers["Cookie"] = cookie;
  const res = await fetch(PAGE_URL, { headers });
  const text = await res.text();
  return { status: res.status, text, headers: res.headers };
}

function extractPow(html) {
  const m = html.match(/data-pow="([^"]+)"/);
  return m ? m[1] : null;
}

async function solveChallenge(pow) {
  const [userkey, challenge] = pow.split("#");
  const wRes = await fetch("https://www.gocomics.com/.bunny-shield/assets/shield-worker.js", { headers: { "User-Agent": USER_AGENT } });
  const workerCode = await wRes.text();
  const b64m = workerCode.match(/721:function\(A,I\)\{A\.exports="([^"]+)"/);
  const buf = Buffer.from(b64m[1], "base64");
  const diff = 13;
  const diffString = "0".repeat(Math.floor(diff / 8));

  const answer = await new Promise((resolve, reject) => {
    global.self = global;
    global.window = global;
    const originalProcess = global.process;
    global.process = { versions: {} };
    let found = null;
    let timeoutHandle = null;
    global.postMessage = (msg) => {
      if (Array.isArray(msg) && msg.length === 2) {
        found = msg[1];
        if (timeoutHandle) clearTimeout(timeoutHandle);
        resolve(found);
      }
    };
    global.location = { href: "https://www.gocomics.com/.bunny-shield/assets/shield-worker.js", hostname: "www.gocomics.com" };
    global.loadArgon2WasmBinary = () => Promise.resolve(new Uint8Array(buf));
    if (!global.atob) global.atob = (s) => Buffer.from(s, "base64").toString("binary");
    // Disable the worker's progress interval so it cannot keep the process alive.
    global.setInterval = () => 0;

    const ctx = createContext(global);
    new Script(workerCode, { filename: "shield-worker.js" }).runInContext(ctx);
    ctx.onmessage({ data: [userkey, challenge, diff, diffString, { time: 2, mem: 512, hashLen: 32, parallelism: 1 }, 0, 4] });

    // Restore the real process object now that the worker has been kicked off.
    global.process = originalProcess;

    timeoutHandle = setTimeout(() => { if (found === null) reject(new Error("challenge not solved")); }, 120000);
  });

  const powResponse = `${pow}#${answer}`;
  const verifyRes = await fetch("https://www.gocomics.com/.bunny-shield/verify-pow", {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/json",
      "BunnyShield-Challenge-Response": powResponse,
    },
    redirect: "manual",
  });
  const setCookie = verifyRes.headers.get("set-cookie");
  const cookies = setCookie ? setCookie.split(/,(?=\s*\w+=)/).map(c => c.split(";")[0]).join("; ") : "";
  return cookies;
}

async function main() {
  let { status, text } = await fetchPage();
  let cookie = "";
  if (status === 403 || extractPow(text)) {
    const pow = extractPow(text);
    if (pow) {
      cookie = await solveChallenge(pow);
      const r = await fetchPage(cookie);
      status = r.status;
      text = r.text;
    }
  }

  const idx = text.indexOf("showComicViewer__comic");
  if (idx === -1) {
    console.error("Could not find showComicViewer__comic in page");
    process.exit(1);
  }
  const sub = text.slice(idx, idx + 500);
  const m = sub.match(/\\"url\\":\\"(https:\/\/featureassets\.gocomics\.com\/assets\/[^\\"]+)\\"/);
  if (!m) {
    console.error("Could not extract comic image url");
    process.exit(1);
  }
  const imgUrl = m[1] + "?optimizer=image&width=2800&quality=85";
  console.log("Found image:", imgUrl);

  const imgRes = await fetch(imgUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!imgRes.ok) {
    console.error("Failed to download image:", imgRes.status);
    process.exit(1);
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const imgB64 = buf.toString("base64");
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calvin and Hobbes</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        html, body {
            height: 100%;
            background: #333;
        }
        body {
            display: flex;
            justify-content: center;
            align-items: center;
        }
        img {
            max-width: 90vw;
            max-height: 90vh;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        }
    </style>
</head>
<body>
    <img src="data:${contentType};base64,${imgB64}" alt="Calvin and Hobbes">
</body>
</html>
`;

  writeFileSync(new URL("./calvinandhobbes.html", import.meta.url), html);
  console.log("Created calvinandhobbes.html");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });