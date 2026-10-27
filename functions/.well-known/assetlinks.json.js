// Digital Asset Links: proves the WorkerPool Android app (ca.workerpool.app) belongs to workerpool.ca,
// so the app opens the site full screen without a browser bar.
// The first fingerprint is the upload key in android/upload-keystore.p12. Add Google Play's
// app signing key fingerprint (Play Console → Setup → App signing → SHA-256) as the Cloudflare
// variable ANDROID_CERT_SHA256 (separate several with commas).
const UPLOAD_KEY = "BF:3F:EC:74:3D:5B:CE:2C:65:02:E0:96:AC:B6:B4:EA:71:A3:42:60:29:65:90:05:47:99:90:A3:33:52:E3:D9";
export function onRequestGet({ env }) {
  const prints = [UPLOAD_KEY, ...String(env.ANDROID_CERT_SHA256 || "").split(",")].map((s) => s.trim().toUpperCase()).filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
  const body = [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: env.ANDROID_PACKAGE || "ca.workerpool.app", sha256_cert_fingerprints: [...new Set(prints)] } }];
  return new Response(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" } });
}
