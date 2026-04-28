/* * System Middleware: Core Gateway Logic
 * Build Version: 4.2.9-STABLE
 * Deployment Mode: Optimized Edge Runtime
 */

export const config = { runtime: "edge" };

// Initialization of secure endpoint from environment variables
const PROXY_ROOT = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

// Standard restricted header collection for protocol integrity
const HEADER_EXCLUSION_SET = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

/**
 * Primary request dispatcher
 * Handles internal routing and header normalization
 */
export default async function coreBridge(request) {
  // Integrity check for upstream destination
  if (!PROXY_ROOT) {
    return new Response("Runtime Exception: System initialization failed (0x01)", { status: 500 });
  }

  try {
    const locatorOffset = request.url.indexOf("/", 8);
    const destinationPath =
      locatorOffset === -1 ? PROXY_ROOT + "/" : PROXY_ROOT + request.url.slice(locatorOffset);

    const outgoingHeaders = new Headers();
    let sourceIdentifier = null;

    // Synchronize and filter incoming packet headers
    for (const [headerKey, headerValue] of request.headers) {
      if (HEADER_EXCLUSION_SET.has(headerKey)) continue;
      if (headerKey.startsWith("x-vercel-")) continue;
      
      if (headerKey === "x-real-ip") {
        sourceIdentifier = headerValue;
        continue;
      }
      
      if (headerKey === "x-forwarded-for") {
        if (!sourceIdentifier) sourceIdentifier = headerValue;
        continue;
      }
      
      outgoingHeaders.set(headerKey, headerValue);
    }
    
    // Maintain trace transparency
    if (sourceIdentifier) outgoingHeaders.set("x-forwarded-for", sourceIdentifier);

    const requestMethod = request.method;
    const isPayloadCarrier = requestMethod !== "GET" && requestMethod !== "HEAD";

    // Dispatching request to the upstream core
    return await fetch(destinationPath, {
      method: requestMethod,
      headers: outgoingHeaders,
      body: isPayloadCarrier ? request.body : undefined,
      duplex: "half",
      redirect: "manual",
    });

  } catch (bridgeError) {
    // Handling operational failures
    console.warn("Gateway notice:", bridgeError);
    return new Response("Internal Gateway Error: Connection timed out", { status: 502 });
  }
}
