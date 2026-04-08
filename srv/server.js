const cds = require('@sap/cds');

cds.on('bootstrap', async () => {
  // Explicitly deploy database schema and load CSV data on startup
  const db = await cds.connect.to('db');
  const model = cds.model;
  if (db.options?.credentials?.url === ':memory:' || !db.options?.credentials?.url) {
    console.log('📦 Deploying in-memory SQLite database with seed data...');
    await cds.deploy(model).to(db);
    console.log('✅ Database deployed with seed data');
  }
});

module.exports = cds.server;
