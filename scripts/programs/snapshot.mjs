// One-off: download each college's official PGWP-eligible program page (HTML or PDF) so readers can be written against
// the real markup. Output goes to program-pages/ on this branch only.
import fs from "node:fs"; import { execFileSync } from "node:child_process";
const urls = JSON.parse(fs.readFileSync(new URL("./urls.json", import.meta.url)));
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
fs.mkdirSync("program-pages", { recursive: true });
const report = [];
for (const [id, list] of Object.entries(urls)) for (const [i, u] of list.entries()) {
  const base = `program-pages/${id}__${i + 1}`;
  try {
    const r = await fetch(u, { headers: { "user-agent": UA, accept: "text/html,application/pdf,*/*" }, redirect: "follow", signal: AbortSignal.timeout(60000) });
    const buf = Buffer.from(await r.arrayBuffer()), pdf = buf.slice(0, 4).toString() === "%PDF";
    fs.writeFileSync(base + (pdf ? ".pdf" : ".html"), buf);
    if (pdf) fs.writeFileSync(base + ".txt", execFileSync("pdftotext", ["-layout", base + ".pdf", "-"], { maxBuffer: 50e6 }));
    report.push({ id, url: u, final: r.url, status: r.status, bytes: buf.length, pdf });
  } catch (e) { report.push({ id, url: u, error: String(e.cause?.code || e.message) }); }
  console.log(report.at(-1));
}
fs.writeFileSync("program-pages/report.json", JSON.stringify(report, null, 1));
