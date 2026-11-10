// Netlify Function that runs the whole A.I. IPO app (same hosting model as the other Thought Authorities
// sites: Netlify Functions + Netlify Database + Netlify Blobs). Static files in /public are served by
// Netlify's CDN first (preferStatic); every other path is handled here.
import { Readable } from 'node:stream';

if (!process.env.NETLIFY_DEV) process.env.NODE_ENV ||= 'production';
process.env.USE_NETLIFY_BLOBS ||= 'true';
process.env.TA_MAX_UPLOAD_MB ||= '4'; // requests to Netlify Functions are limited to 6 MB (base64 adds ~33%)

let handlerPromise;

export default async (request, context) => {
  handlerPromise ??= import('../../src/server.js').then((m) => m.handle);
  const handle = await handlerPromise;

  const url = new URL(request.url);
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : null;

  // Minimal Node-style request for the existing handler.
  const req = Readable.from(body && body.length ? [body] : []);
  req.method = request.method;
  req.url = url.pathname + url.search;
  req.headers = {};
  request.headers.forEach((v, k) => { req.headers[k] = v; });
  req.socket = { remoteAddress: context?.ip || 'unknown' };

  return new Promise((resolve, reject) => {
    const headers = new Headers();
    let status = 200;
    const res = {
      headersSent: false,
      setHeader(k, v) { headers.delete(k); for (const x of [].concat(v)) headers.append(k, String(x)); },
      getHeader(k) {
        if (k.toLowerCase() === 'set-cookie') { const all = headers.getSetCookie(); return all.length ? all : undefined; }
        return headers.get(k) ?? undefined;
      },
      writeHead(s) { status = s; this.headersSent = true; return this; },
      end(chunk) {
        const noBody = request.method === 'HEAD' || status === 204 || status === 304;
        resolve(new Response(noBody || chunk === undefined ? null : chunk, { status, headers }));
      },
    };
    Promise.resolve(handle(req, res)).catch(reject);
  });
};

export const config = { path: '/*', preferStatic: true };
