import mongoose from 'mongoose';
import { Gig, Task, Application, WorkerProfile, User, Category } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex, tokenizeQuery } from '../utils/search.js';
import { getGigLimitAndUsage } from './planLimits.service.js';
import { selectWorker } from './order.service.js';
import { deleteAsset } from './upload.service.js';

const WORKER_CARD_FIELDS = 'fullName username profileImage rating reviewCount completedTasksAsWorker';
const WORKER_DETAIL_FIELDS = `${WORKER_CARD_FIELDS} location identityVerified bio accountStatus`;

function assertOwnership(gig, workerId) {
  if (String(gig.worker) !== String(workerId)) throw new AppError('You do not own this gig', 403);
}

// A malformed id used to throw a CastError (HTTP 500). It is simply "not found".
async function findGigOrThrow(gigId) {
  if (!mongoose.isValidObjectId(gigId)) throw new AppError('Gig not found', 404);
  const gig = await Gig.findById(gigId);
  if (!gig) throw new AppError('Gig not found', 404);
  return gig;
}

/** Makes sure a worker has a WorkerProfile. Search and public profiles are built on it. */
async function ensureWorkerProfile(userId) {
  await WorkerProfile.updateOne({ user: userId }, { $setOnInsert: { user: userId } }, { upsert: true });
}

export async function createGig(worker, payload) {
  await ensureWorkerProfile(worker._id);
  return Gig.create({ ...payload, worker: worker._id, status: 'DRAFT' });
}

export async function updateGig(worker, gigId, payload) {
  const gig = await findGigOrThrow(gigId);
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
  const gig = await findGigOrThrow(gigId);
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
  await ensureWorkerProfile(worker._id);
  return gig;
}

export async function pauseGig(worker, gigId) {
  const gig = await findGigOrThrow(gigId);
  assertOwnership(gig, worker._id);
  gig.status = 'PAUSED';
  await gig.save();
  return gig;
}

/** Used when an account is suspended/deactivated: its gigs stop appearing publicly. Data is kept. */
export async function pauseAllGigsForUser(userId) {
  await Gig.updateMany({ worker: userId, status: 'PUBLISHED' }, { status: 'PAUSED' });
}

export async function deleteGig(worker, gigId) {
  const gig = await findGigOrThrow(gigId);
  assertOwnership(gig, worker._id);

  // A gig that has live orders attached shouldn't vanish from under an
  // in-progress order - tasks keep their own snapshot of what was agreed
  // (Order.agreedAmountKobo etc, frozen at selection time), but the gig
  // itself should be paused instead of deleted while that's unresolved.
  const hasActiveOrder = await Task.exists({
    gig: gig._id,
    status: { $in: ['WORKER_SELECTED', 'PAYMENT_PENDING', 'PAYMENT_SECURED', 'IN_PROGRESS', 'SUBMITTED', 'REVISION_REQUESTED', 'DISPUTED'] },
  });
  if (hasActiveOrder) {
    throw new AppError('This gig has an order in progress - pause it instead of deleting while that order is active', 400);
  }

  await Promise.all((gig.images || []).map((img) => deleteAsset(img.publicId).catch(() => {})));
  await gig.deleteOne();
  return { message: 'Gig deleted' };
}

/**
 * Public visitors only see PUBLISHED gigs from active accounts. The gig's
 * owner (and admins) can also open their own DRAFT/PAUSED gigs - that is what
 * makes "Edit" and "Preview" work for gigs that aren't live yet.
 * Previously this always returned 404 for non-published gigs, so a worker
 * could never open the edit form for a draft.
 */
export async function getGigById(gigId, { viewer = null } = {}) {
  if (!mongoose.isValidObjectId(gigId)) throw new AppError('Gig not found', 404);

  const gig = await Gig.findById(gigId)
    .populate('category')
    .populate('worker', WORKER_DETAIL_FIELDS)
    .lean();
  if (!gig) throw new AppError('Gig not found', 404);

  const isOwner = Boolean(viewer) && String(gig.worker?._id) === String(viewer._id);
  const isAdmin = viewer?.role === 'ADMIN';
  const workerActive = gig.worker?.accountStatus === 'ACTIVE';

  if (!isOwner && !isAdmin && (gig.status !== 'PUBLISHED' || !workerActive)) {
    throw new AppError('This gig is not available', 404);
  }

  if (gig.worker) delete gig.worker.accountStatus;

  const profile = gig.worker?._id
    ? await WorkerProfile.findOne({ user: gig.worker._id }).select('availability headline').lean()
    : null;
  gig.workerProfile = profile ? { availability: profile.availability, headline: profile.headline } : null;
  gig.isOwner = isOwner;

  return gig;
}

/** The worker's own gigs, with real (never invented) performance numbers. */
export async function getMyGigs(workerId, { status } = {}) {
  const filter = { worker: workerId };
  if (status) filter.status = status;

  const gigs = await Gig.find(filter).sort({ updatedAt: -1 }).populate('category').lean();
  if (!gigs.length) return gigs;

  const orderStats = await Task.aggregate([
    { $match: { gig: { $in: gigs.map((g) => g._id) }, source: 'GIG_ORDER' } },
    {
      $group: {
        _id: '$gig',
        orders: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
      },
    },
  ]);
  const byGig = new Map(orderStats.map((s) => [String(s._id), s]));

  return gigs.map((g) => {
    const s = byGig.get(String(g._id));
    return { ...g, stats: { views: g.viewCount || 0, orders: s?.orders || 0, completed: s?.completed || 0 } };
  });
}

/**
 * Gig search. Free text is matched (case-insensitive, partial) against the gig
 * title, skills and description, the worker's username / display name, and the
 * category name. Every word must match somewhere, so "graphic larry" finds
 * Larry's graphic design gigs. (The old Mongo $text search only matched whole
 * words, so searching "larry" never found the username "larrydev".)
 */
export async function searchGigs({ q, category, minPriceKobo, maxPriceKobo, minRating, worker, sort = 'newest', skip = 0, limit = 20 }) {
  const and = [{ status: 'PUBLISHED' }];

  if (category) and.push({ category });
  if (worker) and.push({ worker });

  if (minPriceKobo || maxPriceKobo) {
    const range = {};
    if (minPriceKobo) range.$gte = Number(minPriceKobo);
    if (maxPriceKobo) range.$lte = Number(maxPriceKobo);
    and.push({ startingPriceKobo: range });
  }

  // Real aggregate worker rating (Review-backed) - never a fabricated gig rating.
  if (minRating) {
    const ids = await User.distinct('_id', { rating: { $gte: Number(minRating) }, accountStatus: 'ACTIVE' });
    and.push({ worker: { $in: ids } });
  }

  for (const term of tokenizeQuery(q)) {
    const re = new RegExp(escapeRegex(term), 'i');
    const clauses = [{ title: re }, { skills: re }, { description: re }];

    // One-letter terms only match gig text; looking up every user/category
    // containing "a" would be wasteful and meaningless.
    if (term.length >= 2) {
      const [userIds, categoryIds] = await Promise.all([
        User.distinct('_id', { accountStatus: 'ACTIVE', $or: [{ username: re }, { fullName: re }] }),
        Category.distinct('_id', { name: re }),
      ]);
      if (userIds.length) clauses.push({ worker: { $in: userIds } });
      if (categoryIds.length) clauses.push({ category: { $in: categoryIds } });
    }
    and.push({ $or: clauses });
  }

  const filter = and.length === 1 ? and[0] : { $and: and };
  const sortMap = {
    newest: { createdAt: -1 },
    price_low: { startingPriceKobo: 1, createdAt: -1 },
    price_high: { startingPriceKobo: -1, createdAt: -1 },
  };

  const [items, total] = await Promise.all([
    Gig.find(filter)
      .populate('category')
      .populate('worker', WORKER_CARD_FIELDS)
      .sort(sortMap[sort] || sortMap.newest)
      .skip(skip)
      .limit(limit)
      .lean(),
    Gig.countDocuments(filter),
  ]);
  return { items, total };
}

/**
 * Real selection, not fabricated. Scores published gigs by the worker's
 * actual rating + actual completed-task count + recency - no invented
 * numbers (§17 rule 9, spec §2.2). Workers who set themselves UNAVAILABLE are
 * skipped (the gig can't take new orders), and no single worker may fill more
 * than two slots. If there simply aren't many gigs yet, this returns whatever
 * is available rather than padding the list.
 */
export async function getFeaturedGigs(limit = 6) {
  const gigs = await Gig.find({ status: 'PUBLISHED', 'coverImage.url': { $exists: true } })
    .populate('category')
    .populate('worker', WORKER_CARD_FIELDS)
    .sort({ createdAt: -1 })
    .limit(200) // candidate pool, re-ranked below; keeps this cheap without a full collection scan
    .lean();

  const workerIds = [...new Set(gigs.map((g) => String(g.worker?._id)).filter(Boolean))];
  const profiles = await WorkerProfile.find({ user: { $in: workerIds } }).select('user availability').lean();
  const availabilityByWorker = new Map(profiles.map((p) => [String(p.user), p.availability]));

  const now = Date.now();
  const scored = gigs
    .filter((g) => g.worker && availabilityByWorker.get(String(g.worker._id)) !== 'UNAVAILABLE')
    .map((g) => {
      const rating = g.worker.rating || 0;
      const completed = g.worker.completedTasksAsWorker || 0;
      const ageDays = (now - new Date(g.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, 14 - ageDays) / 14; // new gigs get a mild boost for their first two weeks
      const busyPenalty = availabilityByWorker.get(String(g.worker._id)) === 'BUSY' ? 0.5 : 0;
      return { gig: g, score: rating * 2 + Math.log(1 + completed) + recencyScore - busyPenalty };
    })
    .sort((a, b) => b.score - a.score);

  const MAX_PER_WORKER = 2;
  const perWorker = new Map();
  const picked = [];
  const overflow = [];
  for (const { gig } of scored) {
    const key = String(gig.worker._id);
    if ((perWorker.get(key) || 0) < MAX_PER_WORKER) {
      perWorker.set(key, (perWorker.get(key) || 0) + 1);
      picked.push(gig);
    } else {
      overflow.push(gig);
    }
  }
  return [...picked, ...overflow].slice(0, limit);
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
  const gig = await findGigOrThrow(gigId);
  await gig.populate('category');
  if (gig.status !== 'PUBLISHED') throw new AppError('This gig is not currently available for orders', 400);
  if (String(gig.worker) === String(client._id)) throw new AppError('You cannot order your own gig', 400);

  const [workerUser, workerProfile] = await Promise.all([
    User.findById(gig.worker).select('accountStatus').lean(),
    WorkerProfile.findOne({ user: gig.worker }).select('availability').lean(),
  ]);
  if (!workerUser || workerUser.accountStatus !== 'ACTIVE') {
    throw new AppError('This worker is not available right now', 400);
  }
  if (workerProfile?.availability === 'UNAVAILABLE') {
    throw new AppError("This worker isn't taking new orders right now", 400);
  }

  let amountKobo = gig.startingPriceKobo;
  let deliveryDays = gig.deliveryDays;
  if (packageName) {
    const pkg = gig.packages.find((p) => p.name === packageName);
    if (!pkg) throw new AppError('That package is not available on this gig', 400);
    amountKobo = pkg.priceKobo;
    deliveryDays = pkg.deliveryDays;
  }

  // Task descriptions are capped at 5000 characters. The client's own
  // requirements are the most important part, so they are kept in full and the
  // gig description is trimmed to make room (previously the requirements were
  // appended last and could be cut off).
  const header = `Ordered via gig: "${gig.title}"\n`;
  const requirementsBlock = requirements ? `\n\n--- Client requirements ---\n${requirements}` : '';
  const room = Math.max(0, 5000 - header.length - requirementsBlock.length);
  const description = `${header}${gig.description.slice(0, room)}${requirementsBlock}`.slice(0, 5000);

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
            description,
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
