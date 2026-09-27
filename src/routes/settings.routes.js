import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller.js';

// Intentionally public (no requireAuth) - this only ever exposes non-sensitive
// pricing/limit fields. Admin-only management of these values stays under
// /api/admin/settings (see admin.routes.js).
const router = Router();

router.get('/', settingsController.getPublicSettings);

export default router;
