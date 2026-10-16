import { asyncHandler } from '../utils/asyncHandler.js';
import { paginated } from '../utils/apiResponse.js';
import { getPagination } from '../utils/AppError.js';
import * as workerService from '../services/worker.service.js';
import * as gigService from '../services/gig.service.js';

/**
 * Single endpoint for the Search page (spec §3): `type=workers` or
 * `type=gigs` (defaults to workers). Kept as one endpoint with a `type`
 * switch, rather than two separate ones, so the frontend's search bar and
 * tab-switcher can hit the same URL shape either way.
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
