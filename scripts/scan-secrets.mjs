// Scans the project for secrets before committing: `npm run scan:secrets`.
// Exits with code 1 if anything suspicious is found.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const SKIP_FILES = /\.(webp|png|jpe?g|gif|svg|ico|woff2?)$|package-lock\.json$/;

const RULES = [
  ['Supabase service_role key (JWT)', (t) => findJwts(t).some((p) => p.role === 'service_role')],
  ['Supabase secret key', (t) => /sb_secret_[A-Za-z0-9_-]{10,}/.test(t)],
  ['Hard-coded Supabase JWT (use env variables)', (t) => findJwts(t).length > 0],
  ['Private key', (t) => /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/.test(t)],
  ['Postgres connection string with password', (t) => /postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/.test(t)],
  ['GitHub token', (t) => /gh[pousr]_[A-Za-z0-9]{30,}/.test(t)],
  ['AWS key', (t) => /AKIA[0-9A-Z]{16}/.test(t)],
  ['Generic password assignment', (t) => /(password|passwd|secret)\s*[:=]\s*['"][^'"\s]{8,}['"]/i.test(t)],
];

function findJwts(text) {
  return [...text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)].map((m) => {
    try {
      return JSON.parse(Buffer.from(m[0].split('.')[1], 'base64url').toString());
    } catch {
      return {};
    }
  });
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(name)) yield* walk(p);
    } else if (!SKIP_FILES.test(name)) yield p;
  }
}

let problems = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (/^\.env($|\.)/.test(rel) && rel !== '.env.example') {
    console.log(`•  ${rel}: .env file present — make sure it is in .gitignore (it is) and never committed`);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  for (const [name, test] of RULES) {
    if (test(text)) {
      console.log(`✗  ${rel}: ${name}`);
      problems++;
    }
  }
}
console.log(problems ? `\n${problems} problem(s) found.` : '✓  No secrets found.');
process.exit(problems ? 1 : 0);
