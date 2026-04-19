// src/lib/native-server.ts
// Server-side native detection (runs in middleware + server components)
// Do NOT import Capacitor here — this is for Node/Edge server contexts only
//
// TESTING LOCALLY:
// To simulate a native request in dev, curl with a matching User-Agent:
//   curl -H "User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 com.sunstoneengineering.studio" http://localhost:3000/
// Should return a 307/302 redirect to /auth/login.
//
// To verify web requests still work:
//   curl http://localhost:3000/
// Should return the landing page HTML.

export function isNativeRequest(opts: { userAgent: string; cookieValue?: string }): boolean {
  const { userAgent, cookieValue } = opts;
  if (cookieValue === '1') return true;
  if (!userAgent) return false;

  return (
    userAgent.includes('com.sunstoneengineering.studio') ||
    userAgent.includes('CapacitorWebView') ||
    userAgent.includes('Capacitor') ||
    (userAgent.includes('Android') && userAgent.includes('; wv)')) ||
    (userAgent.includes('Mobile') && userAgent.includes('AppleWebKit') && !userAgent.includes('Safari/'))
  );
}
