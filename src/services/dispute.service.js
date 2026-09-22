import { Dispute, Order } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { notify } from './notification.service.js';

export async function openDispute(userId, orderId, { reason, description, evidence }) {
  const order = await Order.findById(orderId);
  if (!order) throw new AppError('Order not found', 404);

  const uid = String(userId);
  if (String(order.client) !== uid && String(order.worker) !== uid) {
    throw new AppError('You are not part of this order', 403);
  }
  if (['CANCELLED'].includes(order.status)) {
    throw new AppError('Cannot open a dispute on a cancelled order', 400);
  }

  const dispute = await Dispute.create({ order: orderId, openedBy: userId, reason, description, evidence });

  order.status = 'DISPUTED';
  order.disputeStatus = 'OPEN';
  await order.save();

  const otherPartyId = String(order.client) === uid ? order.worker : order.client;
  await notify({
    userId: otherPartyId,
    type: 'DISPUTE_UPDATE',
    title: 'A dispute was opened',
    body: `A dispute was opened on your order. Our team will review it shortly.`,
    entityType: 'DISPUTE',
    entityId: dispute._id,
  });

  return dispute;
}

export async function resolveDispute(adminId, disputeId, { status, resolution }) {
  const dispute = await Dispute.findById(disputeId).populate('order');
  if (!dispute) throw new AppError('Dispute not found', 404);

  dispute.status = status;
  dispute.resolution = resolution;
  dispute.resolvedBy = adminId;
  dispute.resolvedAt = new Date();
  await dispute.save();

  const order = dispute.order;
  order.disputeStatus = 'RESOLVED';
  if (status === 'RESOLVED_WORKER') order.status = 'COMPLETED';
  else if (status === 'RESOLVED_CLIENT') order.status = 'CANCELLED';
  await order.save();

  for (const partyId of [order.client, order.worker]) {
    await notify({
      userId: partyId,
      type: 'DISPUTE_UPDATE',
      title: 'Dispute resolved',
      body: `Your dispute has been resolved: ${resolution}`,
      entityType: 'DISPUTE',
      entityId: dispute._id,
    });
  }

  return dispute;
}

export async function addAdminNote(adminId, disputeId, note) {
  const dispute = await Dispute.findById(disputeId);
  if (!dispute) throw new AppError('Dispute not found', 404);
  dispute.adminNotes.push({ admin: adminId, note });
  await dispute.save();
  return dispute;
}
