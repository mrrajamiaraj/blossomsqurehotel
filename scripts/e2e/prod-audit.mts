// Read-only production audit (GET requests only; nothing is written):
//   * crawls every internal page reachable from the homepage: status codes,
//     broken internal links, broken images;
//   * security headers and HTTPS certificate;
//   * page performance in headless Chrome with mobile 4G + 4× CPU throttling:
//     TTFB, FCP, LCP, CLS, transferred bytes.
//
//   AUDIT_BASE=https://blossomsquare.online AUDIT_OUT=<dir> npx tsx scripts/e2e/prod-audit.mts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import tls from "node:tls";
import { Browser, sleep } from "./browser.mts";

const BASE = (process.env.AUDIT_BASE ?? "https://blossomsquare.online").replace(/\/$/, "");
const OUT = process.env.AUDIT_OUT ?? "e2e-results";
const origin = new URL(BASE).origin;

/* ------------------------------------------------------------- crawl */

const pages = new Map<string, { status: number; ms: number; bytes: number; from: string }>();
const assets = new Map<string, { status: number; from: string }>();
const queue: { url: string; from: string }[] = [{ url: `${BASE}/`, from: "(start)" }];
const SKIP = /^\/(admin|api|booking\/(manage|confirmation|payment))(\/|$)/;

const abs = (href: string, base: string) => {
  try {
    const u = new URL(href, base);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
};

while (queue.length && pages.size < 80) {
  const { url, from } = queue.shift()!;
  if (pages.has(url)) continue;
  const t = Date.now();
  let status = 0;
  let html = "";
  try {
    const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": "BSQ-release-audit" } });
    status = r.status;
    html = r.headers.get("content-type")?.includes("text/html") ? await r.text() : "";
  } catch {
    status = 0;
  }
  pages.set(url, { status, ms: Date.now() - t, bytes: html.length, from });
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"/g)) {
    const u = abs(m[1].replace(/&amp;/g, "&"), url);
    if (!u || !u.startsWith(origin)) continue;
    const p = new URL(u).pathname;
    if (SKIP.test(p) || /\.(pdf|png|jpg|webp|ics)$/.test(p)) continue;
    if (!pages.has(u) && !queue.some((q) => q.url === u)) queue.push({ url: u, from: url });
  }
  for (const m of html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)) {
    const u = abs(m[1].replace(/&amp;/g, "&"), url);
    if (u && !assets.has(u) && !u.startsWith("data:")) assets.set(u, { status: -1, from: url });
  }
}
for (const [u, a] of assets) {
  try {
    const r = await fetch(u, { method: "GET" });
    a.status = r.status;
    await r.arrayBuffer();
  } catch {
    a.status = 0;
  }
}

/* ------------------------------------------------- headers & certificate */

const headerChecks: Record<string, Record<string, string | null>> = {};
for (const p of ["/", "/booking", "/admin/login"]) {
  const r = await fetch(`${BASE}${p}`, { redirect: "manual" });
  const h = (n: string) => r.headers.get(n);
  headerChecks[p] = {
    status: String(r.status),
    "strict-transport-security": h("strict-transport-security"),
    "content-security-policy": h("content-security-policy")?.slice(0, 120) ?? null,
    "x-content-type-options": h("x-content-type-options"),
    "x-frame-options": h("x-frame-options"),
    "referrer-policy": h("referrer-policy"),
    "permissions-policy": h("permissions-policy"),
    "x-powered-by": h("x-powered-by"),
    "cache-control": h("cache-control"),
  };
}
const httpRedirect = await fetch(`http://${new URL(BASE).host}/`, { redirect: "manual" }).then((r) => `${r.status} → ${r.headers.get("location")}`).catch((e) => `error ${e.message}`);
const wwwRedirect = await fetch(`https://www.${new URL(BASE).host}/`, { redirect: "manual" }).then((r) => `${r.status} → ${r.headers.get("location")}`).catch((e) => `error ${e.message}`);
const cert = await new Promise<{ issuer: string; validTo: string; daysLeft: number; protocol: string }>((resolve, reject) => {
  const s = tls.connect(443, new URL(BASE).host, { servername: new URL(BASE).host }, () => {
    const c = s.getPeerCertificate();
    resolve({ issuer: String(c.issuer?.O ?? c.issuer?.CN), validTo: c.valid_to, daysLeft: Math.round((Date.parse(c.valid_to) - Date.now()) / 86_400_000), protocol: String(s.getProtocol()) });
    s.end();
  });
  s.on("error", reject);
});

/* ------------------------------------------------------- performance */

const perfPages = ["/", "/rooms", "/rooms/deluxe-couple", "/booking", "/contact", "/gallery"];
const perf: Record<string, unknown>[] = [];
const b = await Browser.launch(9335);
try {
  await b.viewport(390, 844, true);
  await b.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await b.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await b.send("Network.setCacheDisabled", { cacheDisabled: true });
  await b.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__perf = { lcp: 0, cls: 0 };
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });`,
  });
  for (const p of perfPages) {
    await b.goto(`${BASE}${p}`);
    await sleep(3000);
    const m = await b.eval<Record<string, number>>(`(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const res = performance.getEntriesByType('resource');
      return {
        ttfb: Math.round(nav.responseStart), fcp: Math.round(fcp ? fcp.startTime : 0), lcp: Math.round(window.__perf.lcp), cls: Math.round(window.__perf.cls * 1000) / 1000,
        load: Math.round(nav.loadEventEnd), requests: res.length + 1,
        kb: Math.round((nav.transferSize + res.reduce((s, r) => s + (r.transferSize || 0), 0)) / 1024),
        jsKb: Math.round(res.filter(r => r.initiatorType === 'script' || /\\.js(\\?|$)/.test(r.name)).reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
        imgKb: Math.round(res.filter(r => r.initiatorType === 'img' || /\\/_next\\/image/.test(r.name)).reduce((s, r) => s + (r.transferSize || 0), 0) / 1024),
      };
    })()`);
    perf.push({ page: p, ...m });
    console.log(`  perf ${p}: LCP ${m.lcp}ms FCP ${m.fcp}ms TTFB ${m.ttfb}ms CLS ${m.cls} ${m.kb}KB (${m.jsKb}KB JS, ${m.imgKb}KB img)`);
  }
} finally {
  await b.close();
}

const report = {
  base: BASE,
  at: new Date().toISOString(),
  pages: [...pages].map(([url, v]) => ({ url: url.replace(origin, ""), ...v })),
  brokenPages: [...pages].filter(([, v]) => v.status >= 400 || v.status === 0).map(([u, v]) => ({ url: u.replace(origin, ""), ...v })),
  redirects: [...pages].filter(([, v]) => v.status >= 300 && v.status < 400).map(([u, v]) => ({ url: u.replace(origin, ""), status: v.status })),
  images: assets.size,
  brokenImages: [...assets].filter(([, a]) => a.status !== 200).map(([u, a]) => ({ url: u, ...a })),
  headers: headerChecks,
  httpRedirect,
  wwwRedirect,
  cert,
  perf,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(path.join(OUT, "prod-audit.json"), JSON.stringify(report, null, 2));
console.log(
  `\nCrawled ${pages.size} pages (${report.brokenPages.length} broken, ${report.redirects.length} redirects), ${assets.size} images (${report.brokenImages.length} broken).` +
    `\nHTTP→ ${httpRedirect}; www → ${wwwRedirect}; certificate ${cert.issuer}, ${cert.daysLeft} days left, ${cert.protocol}.`,
);
console.log(JSON.stringify(headerChecks["/"], null, 1));
