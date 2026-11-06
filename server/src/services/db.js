import mongoose from 'mongoose';

// Runs `work(session)` inside a MongoDB transaction and returns its result.
//
// withTransaction commits if `work` finishes, aborts if it throws, and
// re-runs `work` automatically when MongoDB reports a temporary conflict
// (for example, two payments updating the same account at the same moment).
// Because of those re-runs, `work` must only change data through `session`.
export async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
