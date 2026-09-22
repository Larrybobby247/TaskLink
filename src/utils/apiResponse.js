export function ok(res, data, meta = {}) {
  return res.status(200).json({ success: true, data, ...meta });
}
export function created(res, data, meta = {}) {
  return res.status(201).json({ success: true, data, ...meta });
}
export function paginated(res, items, { page, limit, total }) {
  return res.status(200).json({
    success: true,
    data: items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}
export function fail(res, statusCode, message, errors = undefined) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
}
