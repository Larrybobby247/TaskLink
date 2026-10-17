import { asyncHandler } from '../utils/asyncHandler.js';
import { paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as workerService from '../services/worker.service.js';
import * as gigService from '../services/gig.service.js';

/**
 * Single endpoint for the Search page (spec section 3): `type=workers` or
 * `type=gigs` (defaults to workers). The query string is validated by
 * unifiedSearchQuerySchema in search.routes.js (bad ids / values are rejected
 * with a clear 422 instead of crashing the query).
 */
export const search = asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req.query);
  const type = req.query.type === 'gigs' ? 'gigs' : 'workers';

  if (type === 'gigs') {
    const { items, total } = await gigService.searchGigs({ ...req.query, page, limit, skip });
    return paginated(res, items, { page, limit, total });
  }

  const { items, total } = await workerService.searchWorkers({ ...req.query, page, limit, skip });
  return paginated(res, items, { page, limit, total });
});
