import { Router } from 'express';
import * as walletController from '../controllers/wallet.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, walletController.getWallet);
router.get('/transactions', requireAuth, walletController.getWalletTransactions);

export default router;
