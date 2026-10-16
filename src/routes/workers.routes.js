import { Router } from 'express';
import * as workersController from '../controllers/workers.controller.js';

const router = Router();

router.get('/', workersController.searchWorkers);

// New (spec §13) - placed before "/:id" would be ambiguous with a generic
// id matcher, but "saved" is not a valid Mongo ObjectId / username collision
// risk is effectively nil; kept explicit and first regardless for clarity.
router.get('/saved', requireAuth, workersController.getSavedWorkers);

router.get('/:id', workersController.getWorkerProfile);
router.post('/:id/save', requireAuth, workersController.saveWorker);
router.delete('/:id/save', requireAuth, workersController.unsaveWorker);
router.post('/:id/hire', requireAuth, requireVerifiedEmail, validate(hireWorkerSchema), workersController.hireWorker);

export default router;
