/* Cloud + file backup for learn PWAs — survives Chrome «clear site data» via recovery code */
(function (global) {
  "use strict";

  // Public Railway sync API (Redis-backed). One recovery code covers all 4 apps (same GitHub Pages origin).
  const SYNC_ENDPOINT = "https://sync-api-production-1ce8.up.railway.app";
  const CODE_KEY = "learn_sync_code_v1";
  const META_KEY = "learn_sync_meta_v1";
  const DEBOUNCE_MS = 2500;

  let APP_ID = "unknown-learn";
  let FILE_PREFIX = "learn";
  let timer = null;
  let lastStatus = { ok: true, text: "" };

  function cfg(opts) {
    if (!opts) return;
    if (opts.appId) APP_ID = opts.appId;
    if (opts.filePrefix) FILE_PREFIX = opts.filePrefix;
    if (opts.endpoint) {
      // allow override for tests
      Object.defineProperty(global, "__LEARN_SYNC_ENDPOINT_OVERRIDE", { value: opts.endpoint, writable: true });
    }
  }

  function endpoint() {
    return global.__LEARN_SYNC_ENDPOINT_OVERRIDE || SYNC_ENDPOINT;
  }

  function getCode() {
    try {
      return localStorage.getItem(CODE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setCode(code) {
    const c = normalizeCode(code);
    if (!c) return false;
    try {
      localStorage.setItem(CODE_KEY, c);
      const meta = getMeta();
      meta.codeSetAt = Date.now();
      setMeta(meta);
    } catch (e) {}
    return true;
  }

  function clearCode() {
    try {
      localStorage.removeItem(CODE_KEY);
    } catch (e) {}
  }

  function getMeta() {
    try {
      return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {};
    } catch (e) {
      return {};
    }
  }

  function setMeta(m) {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(m || {}));
    } catch (e) {}
  }

  function normalizeCode(raw) {
    const c = String(raw || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return c.length >= 10 && c.length <= 48 ? c : "";
  }

  function randomCode() {
    const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
    const bytes = new Uint8Array(16);
    (global.crypto || window.crypto).getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  function collectBundle() {
    const progress = global.RLProgress && RLProgress.get ? RLProgress.get() : null;
    const srs = global.RLSrs && RLSrs._state ? RLSrs._state() : { cards: {}, seen: {} };
    return {
      v: 1,
      appId: APP_ID,
      exportedAt: Date.now(),
      progress: progress,
      srs: srs,
    };
  }

  function applyBundle(bundle, opts) {
    opts = opts || {};
    if (!bundle || typeof bundle !== "object") throw new Error("קובץ גיבוי לא תקין");
    if (bundle.appId && bundle.appId !== APP_ID && !opts.force) {
      throw new Error("הגיבוי שייך לאפליקציה אחרת (" + bundle.appId + ")");
    }
    if (bundle.progress && global.RLProgress && RLProgress.importState) {
      RLProgress.importState(bundle.progress);
    } else if (bundle.progress && global.RLProgress) {
      // fallback: write raw then reload page expectation
      throw new Error("importState חסר");
    }
    if (bundle.srs && global.RLSrs && RLSrs.importState) {
      RLSrs.importState(bundle.srs);
    }
    return true;
  }

  function downloadBackup() {
    const bundle = collectBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const name = FILE_PREFIX + "-progress-" + new Date().toISOString().slice(0, 10) + ".json";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 500);

    // Android PWA: also try Web Share with file when available
    try {
      const file = new File([blob], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        // don't auto-share; caller may invoke shareBackup()
      }
    } catch (e) {}
    return name;
  }

  async function shareBackup() {
    const bundle = collectBundle();
    const name = FILE_PREFIX + "-progress-" + new Date().toISOString().slice(0, 10) + ".json";
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    try {
      const file = new File([blob], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "גיבוי התקדמות",
          text: "שמרו את הקובץ מחוץ לדפדפן — שורד «ניקוי נתוני אתר».",
        });
        return true;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return false;
    }
    downloadBackup();
    return false;
  }

  function importFromFile(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const data = JSON.parse(String(reader.result || ""));
          applyBundle(data);
          schedulePush(true);
          resolve(data);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = function () {
        reject(new Error("קריאת הקובץ נכשלה"));
      };
      reader.readAsText(file);
    });
  }

  async function pushNow() {
    const code = getCode();
    if (!code) {
      lastStatus = { ok: false, text: "אין קוד גיבוי" };
      return { ok: false, reason: "no_code" };
    }
    const base = endpoint();
    if (!base || base.indexOf("XXXX") >= 0) {
      lastStatus = { ok: false, text: "שרת גיבוי לא מוגדר" };
      return { ok: false, reason: "no_endpoint" };
    }
    const payload = collectBundle();
    try {
      const res = await fetch(base.replace(/\/$/, "") + "/v1/" + code, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Learn-Sync": "1" },
        body: JSON.stringify({ appId: APP_ID, payload: payload }),
      });
      if (!res.ok) {
        const err = await res.json().catch(function () {
          return {};
        });
        lastStatus = { ok: false, text: "שמירה בענן נכשלה (" + (err.error || res.status) + ")" };
        return { ok: false, status: res.status, error: err };
      }
      const meta = getMeta();
      meta.lastPushAt = Date.now();
      meta.lastPushOk = true;
      setMeta(meta);
      lastStatus = { ok: true, text: "סונכרן לענן" };
      return { ok: true };
    } catch (e) {
      lastStatus = { ok: false, text: "אין רשת לסנכרון" };
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  function schedulePush(immediate) {
    if (timer) clearTimeout(timer);
    if (immediate) {
      timer = null;
      return pushNow();
    }
    timer = setTimeout(function () {
      timer = null;
      pushNow();
    }, DEBOUNCE_MS);
  }

  async function pullAndRestore(codeInput) {
    const code = normalizeCode(codeInput || getCode());
    if (!code) throw new Error("הזינו קוד גיבוי תקין (לפחות 10 תווים)");
    const base = endpoint();
    if (!base || base.indexOf("XXXX") >= 0) throw new Error("שרת גיבוי לא מוגדר עדיין");
    const res = await fetch(base.replace(/\/$/, "") + "/v1/" + code, {
      headers: { "X-Learn-Sync": "1" },
    });
    if (res.status === 404) throw new Error("לא נמצא גיבוי לקוד הזה");
    if (!res.ok) throw new Error("שגיאת שרת (" + res.status + ")");
    const doc = await res.json();
    const entry = doc && doc.apps && doc.apps[APP_ID];
    if (!entry || !entry.payload) {
      const keys = doc && doc.apps ? Object.keys(doc.apps) : [];
      throw new Error(
        keys.length
          ? "בקוד הזה יש גיבוי ל: " + keys.join(", ") + " — לא ל־" + APP_ID
          : "הקוד ריק עדיין — שמרו התקדמות באפליקציה ואז סנכרנו"
      );
    }
    applyBundle(entry.payload, { force: true });
    setCode(code);
    const meta = getMeta();
    meta.lastPullAt = Date.now();
    setMeta(meta);
    return entry.payload;
  }

  async function enableCloud() {
    let code = getCode();
    if (!code) {
      code = randomCode();
      setCode(code);
    }
    const r = await pushNow();
    return { code: getCode(), push: r };
  }

  function status() {
    const meta = getMeta();
    return {
      code: getCode(),
      hasCode: !!getCode(),
      lastPushAt: meta.lastPushAt || null,
      lastPullAt: meta.lastPullAt || null,
      lastStatus: lastStatus,
      endpointReady: !!(endpoint() && endpoint().indexOf("XXXX") < 0),
      appId: APP_ID,
    };
  }

  // Hook progress saves
  function attachAutoSync() {
    if (global.RLProgress && typeof RLProgress.setSaveHook === "function") {
      RLProgress.setSaveHook(function () {
        schedulePush(false);
      });
    }
    if (global.RLSrs && typeof RLSrs.setSaveHook === "function") {
      RLSrs.setSaveHook(function () {
        schedulePush(false);
      });
    }
  }

  global.RLCloudSync = {
    cfg,
    getCode,
    setCode,
    clearCode,
    normalizeCode,
    randomCode,
    collectBundle,
    applyBundle,
    downloadBackup,
    shareBackup,
    importFromFile,
    pushNow,
    schedulePush,
    pullAndRestore,
    enableCloud,
    status,
    attachAutoSync,
    CODE_KEY,
  };
})(window);
