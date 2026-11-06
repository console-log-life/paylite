// Run with: npm run reconcile
// Checks that the ledger balances and every cached balance matches it.
// Exits with code 1 if anything is off, so it can run on a schedule or in CI.
import mongoose from 'mongoose';
import { config, assertConfig } from '../src/config.js';
import { reconcileAll } from '../src/services/reconcile.js';

assertConfig();
await mongoose.connect(config.mongoUri);

const report = await reconcileAll();
console.log(JSON.stringify(report, null, 2));
console.log(report.ok ? 'Ledger OK' : 'LEDGER MISMATCH');

await mongoose.disconnect();
process.exit(report.ok ? 0 : 1);
