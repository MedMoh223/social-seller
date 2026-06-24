import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { ValidationError, NotFoundError } from '../lib/httpErrors';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const tenantRouter = Router();
tenantRouter.use(requireAuth, authenticatedLimiter);

// GET /tenant — infos du tenant courant
tenantRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id, name, plan, status, whatsapp_number, logo_url, created_at')
      .eq('id', req.user!.tenantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return next(new NotFoundError('Tenant introuvable.'));

    res.status(200).json({ tenant: data });
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  logo_url: z.string().url().max(500).optional().nullable(),
});

// PATCH /tenant — mettre à jour le nom et/ou logo_url
tenantRouter.patch('/', async (req, res, next) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError());

  try {
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update(parsed.data)
      .eq('id', req.user!.tenantId)
      .select('id, name, plan, status, whatsapp_number, logo_url')
      .maybeSingle();

    if (error) throw error;
    if (!data) return next(new NotFoundError());

    res.status(200).json({ tenant: data });
  } catch (err) {
    next(err);
  }
});
