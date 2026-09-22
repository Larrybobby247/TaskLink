import { Router } from 'express';
import * as categoriesController from '../controllers/categories.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', categoriesController.listCategories);
router.post('/', requireAuth, requireAdmin, categoriesController.createCategory);
router.patch('/:id', requireAuth, requireAdmin, categoriesController.updateCategory);
router.patch('/:id/disable', requireAuth, requireAdmin, categoriesController.disableCategory);
router.post('/reorder', requireAuth, requireAdmin, categoriesController.reorderCategories);

export default router;
