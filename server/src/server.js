import mongoose from 'mongoose';
import { config, assertConfig } from './config.js';
import { createApp } from './app.js';
import { ensureSystemAccounts } from './services/accounts.js';

assertConfig();

// Multi-document transactions need a replica set. MongoDB Atlas (even the
// free tier) is always a replica set, so this works there out of the box.
await mongoose.connect(config.mongoUri);
await mongoose.syncIndexes();
await ensureSystemAccounts();

createApp().listen(config.port, () => {
  console.log(`PayLite API listening on port ${config.port}`);
});
