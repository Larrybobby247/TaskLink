import { Router } from 'express';
import * as workersController from '../controllers/workers.controller.js';

const router = Router();

router.get('/', workersController.searchWorkers);
router.get('/:id', workersController.getWorkerProfile);

export default router;
