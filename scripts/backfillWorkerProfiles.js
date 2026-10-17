/* eslint-disable no-console */
// One-off, idempotent maintenance script.
//
// Worker search and public profiles are built on WorkerProfile documents, but a
// profile used to be created only when a worker happened to open their profile
// settings. This creates the missing profile for every user who is in Worker
// Mode or owns at least one gig, so they show up in search. Safe to re-run.
//
//   npm run backfill:worker-profiles

import { connectDB, disconnectDB } from '../src/config/db.js';
import { User, WorkerProfile, Gig } from '../src/models/index.js';

async function main() {
  await connectDB();

  const [modeIds, gigOwnerIds] = await Promise.all([
    User.distinct('_id', { currentMode: 'worker' }),
    Gig.distinct('worker'),
  ]);
  const candidateIds = [...new Map([...modeIds, ...gigOwnerIds].map((id) => [String(id), id])).values()];

  if (!candidateIds.length) {
    console.log('[backfill] No candidate users found.');
    return;
  }

  const result = await WorkerProfile.bulkWrite(
    candidateIds.map((id) => ({
      updateOne: { filter: { user: id }, update: { $setOnInsert: { user: id } }, upsert: true },
    }))
  );

  console.log(`[backfill] Checked ${candidateIds.length} users, created ${result.upsertedCount} missing worker profiles.`);
}

main()
  .catch((err) => {
    console.error('[backfill] Failed:', err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
