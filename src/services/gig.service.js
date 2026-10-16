import mongoose from 'mongoose';
import { Gig, Task, Application, WorkerProfile } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { getGigLimitAndUsage } from './planLimits.service.js';
import { selectWorker } from './order.service.js';
import { deleteAsset } from './upload.service.js';

function assertOwnership(gig, workerId) {
  if (String(gig.worker) !== String(workerId)) throw new AppError('You do not own this gig', 403);
}

export async function createGig(worker, payload) {
  return Gig.create({ ...payload, worker: worker._id, status: 'DRAFT' });
}

export async function updateGig(worker, gigId, payload) {
  const gig = await Gig.findById(gigId);
  if (!gig) throw new AppError('Gig not found', 404);
  assertOwnership(gig, worker._id);
  Object.assign(gig, payload);
  await gig.save();
  return gig;
}

/**
 * Publishing is the only place the plan limit is actually enforced (§5,
 * §17 rule 1: "Enforce subscription limits on the backend. Never trust a
 * frontend-provided subscription status."). A worker can have unlimited
 * DRAFT/PAUSED gigs; only PUBLISHED ones count against the limit.
 */
export async function publishGig(worker, gigId) {
  const gig = await Gig.findById(gigId);
  if (!gig) throw new AppError('Gig not found', 404);
  assertOwnership(gig, worker._id);
  if (gig.status === 'PUBLISHED') return gig;

  if (!gig.coverImage?.url) throw new AppError('Add a cover image before publishing', 400);

  const { limit, published } = await getGigLimitAndUsage(worker);
  if (published >= limit) {
    throw new AppError(
      `You've reached your plan's limit of ${limit} published gig${limit === 1 ? '' : 's'}. Pause another gig or upgrade to Pro to publish more.`,
      403
    );
  }

  gig.status = 'PUBLISHED';
  gig.publishedAt = new Date();
  await gig.save();
  return gig;
}

export async function pauseGig(worker, gigId) {
  const gig = await Gig.findById(gigId);
  if (!gig) throw new AppError('Gig not found', 404);
  assertOwnership(gig, worker._id);
  gig.status = 'PAUSED';
  await gig.save();
  return gig;
}

export async function deleteGig(worker, gigId) {
  const gig = await Gig.findById(gigId);
  if (!gig) throw new AppError('Gig not found', 404);
  assertOwnership(gig, worker._id);

  // A gig that has live orders attached shouldn't vanish from under an
  // in-progress order - tasks keep their own snapshot of what was agreed
  // (Order.agreedAmountKobo etc, frozen at selection time), but the gig
  // itself should be paused instead of deleted while that's unresolved.
  const hasActiveOrder = await Task.exists({
    gig: gig._id,
    status: { $in: ['WORKER_SELECTED', 'AWAITING_PAYMENT', 'PAYMENT_SECURED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED'] },
  });
  if (hasActiveOrder) {
    throw new AppError('This gig has an order in progress - pause it instead of deleting while that order is active', 400);
  }

  await Promise.all((gig.images || []).map((img) => deleteAsset(img.publicId).catch(() => {})));
  await gig.deleteOne();
  return { message: 'Gig deleted' };
}

export async function getGigById(gigId, { includeOwnerView = false } = {}) {
  const gig = await Gig.findById(gigId)
    .populate('category')
    .populate('worker', 'fullName username profileImage rating reviewCount completedTasksAsWorker location identityVerified')
    .lean();
  if (!gig) throw new AppError('Gig not found', 404);
  if (!includeOwnerView && gig.status !== 'PUBLISHED') throw new AppError('This gig is not available', 404);
  return gig;
}

export async function getMyGigs(workerId, { status } = {}) {
  const filter = { worker: workerId };
  if (status) filter.status = status;
  return Gig.find(filter).sort({ updatedAt: -1 }).populate('category');
}

export async function searchGigs({ q, category, minPriceKobo, maxPriceKobo, minRating, worker, sort = 'newest', page, limit, skip }) {
  const filter = { status: 'PUBLISHED' };
  if (q) filter.$text = { $search: q };
  if (category) filter.category = category;
  if (worker) filter.worker = worker;
  if (minPriceKobo || maxPriceKobo) {
    filter.startingPriceKobo = {};
    if (minPriceKobo) filter.startingPriceKobo.$gte = Number(minPriceKobo);
    if (maxPriceKobo) filter.startingPriceKobo.$lte = Number(maxPriceKobo);
  }

  const sortMap = {
    newest: { createdAt: -1 },
    price_low: { startingPriceKobo: 1 },
    price_high: { startingPriceKobo: -1 },
  };

  let query = Gig.find(filter).populate('category').populate('worker', 'fullName username profileImage rating reviewCount');

  // minRating filters on the worker's real aggregate rating (Review-backed,
  // see review.service.js) - never a fabricated gig-level rating, per §17 rule 9.
  if (minRating) {
    const candidates = await query.sort(sortMap[sort] || sortMap.newest).lean();
    const filtered = candidates.filter((g) => (g.worker?.rating || 0) >= Number(minRating));
    const total = filtered.length;
    return { items: filtered.slice(skip, skip + limit), total };
  }

  const [items, total] = await Promise.all([
    query.sort(sortMap[sort] || sortMap.newest).skip(skip).limit(limit).lean(),
    Gig.countDocuments(filter),
  ]);
  return { items, total };
}

/**
 * Real selection, not fabricated. Scores published gigs by the worker's
 * actual rating + actual completed-task count + recency - no invented
 * numbers (§17 rule 9, spec §2.2). If there simply aren't many gigs yet,
 * this returns whatever's available rather than padding the list.
 */
export async function getFeaturedGigs(limit = 6) {
  const gigs = await Gig.find({ status: 'PUBLISHED' })
    .populate('category')
    .populate('worker', 'fullName username profileImage rating reviewCount completedTasksAsWorker')
    .sort({ createdAt: -1 })
    .limit(200) // candidate pool, re-ranked below; keeps this cheap without a full collection scan
    .lean();

  const now = Date.now();
  const scored = gigs.map((g) => {
    const rating = g.worker?.rating || 0;
    const completed = g.worker?.completedTasksAsWorker || 0;
    const ageDays = (now - new Date(g.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 14 - ageDays) / 14; // new gigs get a mild boost for their first two weeks
    const score = rating * 2 + Math.log(1 + completed) + recencyScore;
    return { gig: g, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.gig);
}

export async function incrementGigView(gigId) {
  await Gig.updateOne({ _id: gigId }, { $inc: { viewCount: 1 } });
}

/**
 * The key reuse decision for this feature: rather than inventing a parallel
 * contract/payment system for gigs, this creates a real Task (source:
 * GIG_ORDER, excluded from public search - see task.service.js) and a
 * single pre-matched Application, then calls the EXISTING, tested
 * order.service.js#selectWorker. That one call gives us: frozen agreed
 * price, server-computed commission (Free vs Pro, already correct),
 * rejection-of-other-applications (a no-op here since there's only one),
 * task status transition, and the WORKER_SELECTED notification/email -
 * all without a single line of new payment logic.
 */
export async function orderGig(client, gigId, { packageName, requirements } = {}) {
  const gig = await Gig.findById(gigId).populate('category');
  if (!gig) throw new AppError('Gig not found', 404);
  if (gig.status !== 'PUBLISHED') throw new AppError('This gig is not currently available for orders', 400);
  if (String(gig.worker) === String(client._id)) throw new AppError('You cannot order your own gig', 400);

  let amountKobo = gig.startingPriceKobo;
  let deliveryDays = gig.deliveryDays;
  if (packageName) {
    const pkg = gig.packages.find((p) => p.name === packageName);
    if (!pkg) throw new AppError('That package is not available on this gig', 400);
    amountKobo = pkg.priceKobo;
    deliveryDays = pkg.deliveryDays;
  }

  const description = [
    `Ordered via gig: "${gig.title}"`,
    gig.description,
    requirements ? `\n--- Client requirements ---\n${requirements}` : '',
  ].join('\n');

  // Step 1: create the Task + its single pre-matched Application atomically.
  // This is a self-contained transaction, separate from step 2 below.
  const session = await mongoose.startSession();
  let applicationId;
  try {
    await session.withTransaction(async () => {
      const [task] = await Task.create(
        [
          {
            client: client._id,
            title: gig.title,
            description: description.slice(0, 5000),
            category: gig.category._id,
            budgetType: 'FIXED',
            budgetKobo: amountKobo,
            isRemote: true,
            deadline: new Date(Date.now() + deliveryDays * 24 * 60 * 60 * 1000),
            status: 'PUBLISHED',
            source: 'GIG_ORDER',
            gig: gig._id,
            publishedAt: new Date(),
          },
        ],
        { session }
      );

      const [application] = await Application.create(
        [
          {
            task: task._id,
            worker: gig.worker,
            message: `Direct order for gig "${gig.title}"`,
            status: 'PENDING',
          },
        ],
        { session }
      );

      applicationId = application._id;
    });
  } finally {
    session.endSession();
  }

  // Step 2: selectWorker manages its own transaction internally (see
  // order.service.js) - called here as a plain, separate step, exactly as
  // if a client had posted a task and picked this worker's application by
  // hand. This is where the frozen price, commission calc, and
  // WORKER_SELECTED notification all come from - all pre-existing code.
  const order = await selectWorker(client._id, applicationId);
  return order;
}
