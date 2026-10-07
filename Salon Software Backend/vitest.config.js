// vitest.config.js
// API tests run against a separate database (salonos_test, see .env.test).
// globalSetup resets + re-seeds it once per run. Test files share the DB and build on each other
// (01-auth → 02-… → 07-…), so they run one at a time in file-name order.

import { defineConfig } from 'vitest/config';
import { BaseSequencer } from 'vitest/node';

class AlphabeticalSequencer extends BaseSequencer {
  async sort(files) {
    return [...files].sort((a, b) => (a.moduleId ?? a[1] ?? '').localeCompare(b.moduleId ?? b[1] ?? ''));
  }
}

export default defineConfig({
  test: {
    environment:     'node',
    globalSetup:     ['./tests/globalSetup.js'],
    setupFiles:      ['./tests/setupEnv.js'],
    fileParallelism: false,
    sequence:        { sequencer: AlphabeticalSequencer },
    testTimeout:     30000,
    hookTimeout:     120000,
  },
});
