const cds = require('@sap/cds');

cds.on('served', async () => {
  const db = await cds.connect.to('db');
  if (db.options?.credentials?.url === ':memory:') {
    console.log('📦 Deploying in-memory SQLite database with seed data...');
    await cds.deploy('*').to(db);
    console.log('✅ Database deployed with seed data');
  }
});

module.exports = cds.server;
