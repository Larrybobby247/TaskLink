import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, created } from '../utils/apiResponse.js';
import * as categoryService from '../services/category.service.js';

export const listCategories = asyncHandler(async (req, res) => {
  const categories = await categoryService.listCategories();
  return ok(res, { categories });
});

export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);
  return created(res, { category });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  return ok(res, { category });
});

export const disableCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.disableCategory(req.params.id);
  return ok(res, { category });
});

export const reorderCategories = asyncHandler(async (req, res) => {
  const categories = await categoryService.reorderCategories(req.body.orderedIds);
  return ok(res, { categories });
});
