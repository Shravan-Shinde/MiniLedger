const path = require('path');
const fs = require('fs');
const { default: EmbeddedPostgres } = require('embedded-postgres');

async function main() {
  const dataDir = path.resolve(__dirname, '../.pgdata');
  const alreadyInit = fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  console.log('Starting Embedded PostgreSQL 16 on port 5432...');
  console.log('Data directory:', dataDir);

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'miniledger',
    password: 'miniledger_dev_password',
    port: 5432,
    persistent: true,
    authMethod: 'trust',
    onLog: (msg) => process.stdout.write(`[PG] ${msg}`),
    onError: (err) => console.error('[PG ERROR]', err)
  });

  if (!alreadyInit) {
    console.log('Initializing database cluster...');
    await pg.initialise();
  }

  await pg.start();
  console.log('PostgreSQL is running on localhost:5432');

  try {
    await pg.createDatabase('miniledger');
    console.log('Database "miniledger" created.');
  } catch (e) {
    // Already exists
    console.log('Database "miniledger" is ready.');
  }

  const shutdown = async () => {
    console.log('Stopping PostgreSQL...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep process alive
  setInterval(() => {}, 1000);
}

main().catch((err) => {
  console.error('Failed to start Embedded PostgreSQL:', err);
  process.exit(1);
});
