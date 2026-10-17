import { Router } from 'express';
import * as searchController from '../controllers/search.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { unifiedSearchQuerySchema } from '../validators/gig.validators.js';

const router = Router();

router.get('/', validate(unifiedSearchQuerySchema, 'query'), searchController.search);

export default router;
