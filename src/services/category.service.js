import { Category } from '../models/index.js';
import { AppError } from '../utils/AppError.js';

export async function listCategories({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { isActive: true };
  return Category.find(filter).sort({ sortOrder: 1, name: 1 });
}

export async function createCategory(payload) {
  const slug = payload.slug || payload.name.toLowerCase().trim().replace(/\s+/g, '-');
  return Category.create({ ...payload, slug });
}

export async function updateCategory(id, payload) {
  const category = await Category.findByIdAndUpdate(id, payload, { new: true });
  if (!category) throw new AppError('Category not found', 404);
  return category;
}

export async function disableCategory(id) {
  return updateCategory(id, { isActive: false });
}

export async function reorderCategories(orderedIds) {
  await Promise.all(orderedIds.map((id, index) => Category.updateOne({ _id: id }, { sortOrder: index })));
  return listCategories({ includeInactive: true });
}
