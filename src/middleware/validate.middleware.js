import { AppError } from '../utils/AppError.js';

/** Validates req.body/query/params against a Zod schema, replacing them with the parsed+coerced values. */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
      return next(new AppError('Validation failed', 422, errors));
    }
    req[source] = result.data;
    next();
  };
}
