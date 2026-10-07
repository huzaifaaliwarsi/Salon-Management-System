// tests/globalSetup.js — recreate and seed the test database once per test run.
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

export default function setup() {
  const env = { ...process.env, ...dotenv.config({ path: '.env.test', override: true }).parsed };
  if (!env.DATABASE_URL?.includes('_test')) {
    throw new Error('Refusing to reset a non-test database. DATABASE_URL in .env.test must point to *_test.');
  }
  execSync('npx prisma migrate reset --force', { env, stdio: 'pipe' });
}
