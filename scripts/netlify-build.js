// Netlify build step (no dependencies). Two modes:
//  - BACKEND_URL set (e.g. https://thought-authorities-ai-ipo.onrender.com): the Netlify site forwards every
//    request to the running server, so accounts, login, MFA and all workspace features work on the
//    Netlify address. On the server, set ALLOWED_ORIGINS and BASE_URL to the Netlify site address.
//  - BACKEND_URL not set: publish the static preview (index.html) only.
import fs from 'node:fs';

fs.rmSync('dist', { recursive: true, force: true });
fs.mkdirSync('dist');
const backend = (process.env.BACKEND_URL || '').trim().replace(/\/$/, '');
if (backend) {
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(backend)) {
    console.error(`BACKEND_URL must look like https://your-app.onrender.com (got "${backend}")`);
    process.exit(1);
  }
  fs.writeFileSync('dist/_redirects', `/*  ${backend}/:splat  200!\n`);
  console.log(`Netlify will forward all requests to ${backend}.`);
  console.log(`On the server, set ALLOWED_ORIGINS and BASE_URL to ${process.env.URL || 'this Netlify site address'}.`);
} else {
  fs.copyFileSync('index.html', 'dist/index.html');
  console.log('BACKEND_URL not set: publishing the static preview (index.html).');
}
