// Command line: collects immigration draws from official government pages and writes data/draws.json.
// On the live site the same reader runs inside Cloudflare (admin "Refresh now" and the scheduled Worker in cron/)
// and keeps its result in D1; data/draws.json is the starting copy shipped with the site.
//   node scripts/draws/fetch.mjs                 every source
//   DRAWS_ONLY=sk,ee node scripts/draws/fetch.mjs only those sources
//   DRAWS_LOCAL=map.json ...                     tests: read pages from local files (url → file)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { IO, runDraws } from "./core.mjs";

const OUT = new URL("../../data/draws.json", import.meta.url);
const LOCAL = process.env.DRAWS_LOCAL ? JSON.parse(fs.readFileSync(process.env.DRAWS_LOCAL, "utf8")) : null;
if (LOCAL) IO.fetchPage = (url) => (LOCAL[url] ? Promise.resolve(fs.readFileSync(LOCAL[url], "utf8")) : Promise.reject(new Error("no local copy")));
IO.pdfText = async (url) => {
  if (LOCAL) return fs.readFileSync(LOCAL[url] || LOCAL["sk-pdf"], "utf8");
  const file = path.join(os.tmpdir(), "sinp-eoi.pdf");
  fs.writeFileSync(file, await IO.getBuffer(url));
  return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8", maxBuffer: 20e6 });
};
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : { draws: [], sources: [] };
const only = (process.env.DRAWS_ONLY || "").split(/[\s,]+/).filter(Boolean);
if (only.length) console.log("Refreshing only: " + only.join(", "));
const { out, sources } = await runDraws(old, { only, log: console.log });
fs.mkdirSync(new URL("../../data/", import.meta.url), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
if (!only.length && sources.every((x) => !x.ok)) process.exit(1);
