// A small Chrome DevTools Protocol driver for end-to-end tests, using the
// installed Chrome (no extra downloads): launch headless, open a page, act
// like a user (click by visible text, fill by label), screenshot, and collect
// console errors and failed requests.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Helpers available in every page as window.__h.
const HELPERS = `
window.__h = {
  vis(e) { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; },
  norm(s) { return (s || '').replace(/\\s+/g, ' ').trim(); },
  all(sel, text) { const t = text === undefined ? undefined : text.toLowerCase(); return [...document.querySelectorAll(sel)].filter((e) => __h.vis(e) && (t === undefined || __h.norm(e.textContent).toLowerCase().includes(t) || (e.getAttribute('aria-label') || '').toLowerCase().includes(t))); },
  one(sel, text) { const m = __h.all(sel, text); if (!m.length) throw new Error('Not found: ' + sel + (text ? ' "' + text + '"' : '')); return m[0]; },
  click(sel, text) { const e = __h.one(sel, text); if (e.disabled) throw new Error('Disabled: ' + sel + ' "' + text + '"'); e.scrollIntoView({ block: 'center' }); e.click(); return true; },
  field(label) {
    const ls = [...document.querySelectorAll('label')].filter((l) => __h.vis(l) && __h.norm(l.textContent).startsWith(label));
    for (const l of ls) { const c = l.querySelector('input,select,textarea') || (l.htmlFor && document.getElementById(l.htmlFor)); if (c) return c; }
    const byAria = document.querySelector('[aria-label="' + label + '"]'); if (byAria) return byAria;
    const byPh = [...document.querySelectorAll('input,textarea')].find((i) => i.placeholder === label); if (byPh) return byPh;
    throw new Error('No field: ' + label);
  },
  set(el, v) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
  fill(label, v) { return __h.set(__h.field(label), v); },
  tick(label) { const c = __h.field(label); if (!c.checked) c.click(); return c.checked; },
  text() { return document.body ? document.body.innerText : ''; },
};`;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class Browser {
  private proc!: ChildProcess;
  private ws!: WebSocket;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private waiters: { method: string; resolve: (p: unknown) => void }[] = [];
  readonly consoleErrors: { url: string; text: string }[] = [];
  readonly failedRequests: { url: string; status: number }[] = [];
  private currentUrl = "";
  private requests = new Map<string, string>();

  static async launch(port = 9333): Promise<Browser> {
    const b = new Browser();
    const profile = path.join(tmpdir(), `bsq-e2e-${Date.now()}`);
    b.proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--window-size=1366,900", "about:blank"], { stdio: "ignore" });
    let target: { webSocketDebuggerUrl: string } | null = null;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      try {
        const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        target = list.find((t) => t.type === "page") ?? null;
      } catch {
        /* not up yet */
      }
    }
    if (!target) throw new Error("Chrome didn't start");
    b.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      b.ws.onopen = res;
      b.ws.onerror = rej;
    });
    b.ws.onmessage = (ev) => b.onMessage(JSON.parse(String(ev.data)));
    await b.send("Page.enable");
    await b.send("Runtime.enable");
    await b.send("Network.enable");
    await b.send("Page.addScriptToEvaluateOnNewDocument", { source: HELPERS });
    return b;
  }

  private onMessage(m: { id?: number; result?: unknown; error?: { message: string }; method?: string; params?: Record<string, unknown> }) {
    if (m.id !== undefined) {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.error) p.reject(new Error(m.error.message));
      else p.resolve(m.result);
      return;
    }
    const params = m.params ?? {};
    if (m.method === "Runtime.exceptionThrown") {
      const d = params.exceptionDetails as { text: string; exception?: { description?: string } };
      this.consoleErrors.push({ url: this.currentUrl, text: d.exception?.description ?? d.text });
    }
    if (m.method === "Runtime.consoleAPICalled" && params.type === "error") {
      const args = params.args as { value?: unknown; description?: string }[];
      this.consoleErrors.push({ url: this.currentUrl, text: args.map((a) => String(a.value ?? a.description ?? "")).join(" ").slice(0, 300) });
    }
    if (m.method === "Network.responseReceived") {
      const r = params.response as { url: string; status: number };
      if (r.status >= 400 && !/favicon|\/_next\/static\/.*\.map$/.test(r.url)) this.failedRequests.push({ url: r.url, status: r.status });
    }
    if (m.method === "Network.loadingFailed" && !(params.canceled as boolean)) {
      const url = this.requests.get(params.requestId as string) ?? "?";
      if (!/favicon/.test(url)) this.failedRequests.push({ url, status: 0 });
    }
    if (m.method === "Network.requestWillBeSent") this.requests.set(params.requestId as string, (params.request as { url: string }).url);
    for (const w of [...this.waiters]) if (w.method === m.method) {
      this.waiters.splice(this.waiters.indexOf(w), 1);
      w.resolve(params);
    }
  }

  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject }));
  }

  private once(method: string, timeout = 30_000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const w = { method, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error(`Timed out waiting for ${method}`));
        }
      }, timeout);
    });
  }

  async goto(url: string) {
    this.currentUrl = url;
    const loaded = this.once("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
    await sleep(400);
  }

  /** Evaluates in the page (await allowed); throws the page's error. */
  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send<{ result: { value: T }; exceptionDetails?: { exception?: { description?: string }; text: string } }>("Runtime.evaluate", {
      expression: `(async () => { return (${expression}); })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split("\n")[0] ?? r.exceptionDetails.text);
    return r.result.value;
  }

  async url(): Promise<string> {
    return this.eval<string>("location.href");
  }

  /** Waits until the expression is truthy (polling). */
  async waitFor(expression: string, timeout = 20_000, what = expression): Promise<unknown> {
    const end = Date.now() + timeout;
    let last: unknown;
    while (Date.now() < end) {
      try {
        // Coerce to a boolean: DOM nodes can't be returned by value.
        last = await this.eval(`!!(${expression})`);
        if (last) return last;
      } catch {
        /* page navigating */
      }
      await sleep(250);
    }
    throw new Error(`Timed out: ${what}`);
  }

  waitText(text: string, timeout = 20_000) {
    // Case-insensitive: CSS text-transform changes what innerText reports.
    return this.waitFor(`__h.text().toLowerCase().includes(${JSON.stringify(text.toLowerCase())})`, timeout, `text "${text}"`);
  }

  async screenshot(file: string) {
    const r = await this.send<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(r.data, "base64"));
  }

  async viewport(width: number, height: number, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  }

  async clearCookies() {
    await this.send("Network.clearBrowserCookies");
  }

  async close() {
    try {
      await this.send("Browser.close");
    } catch {
      /* already gone */
    }
    this.proc.kill();
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) from a base32 secret. */
export async function totp(secretBase32: string, at = Date.now()): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secretBase32.replace(/[\s=]/g, "").toUpperCase();
  let bits = "";
  for (const c of clean) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}
