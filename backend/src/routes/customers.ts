import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { ValidationError, NotFoundError } from '../lib/httpErrors';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const customersRouter = Router();
customersRouter.use(requireAuth, authenticatedLimiter);

const createSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  source: z.enum(['whatsapp', 'facebook', 'tiktok', 'manual']).default('manual'),
  external_id: z.string().max(64).optional().nullable(),
});

const updateSchema = createSchema.partial();

// GET /customers — liste paginée (50 par page, tri updated_at desc)
customersRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : null;

    let query = supabaseAdmin
      .from('customers')
      .select('id, name, phone, email, source, external_id, created_at, updated_at')
      .eq('tenant_id', req.user!.tenantId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.status(200).json({ customers: data ?? [] });
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id
customersRouter.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('id, name, phone, email, notes, source, external_id, created_at, updated_at')
      .eq('id', req.params.id)
      .eq('tenant_id', req.user!.tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    if (!data) return next(new NotFoundError());

    res.status(200).json({ customer: data });
  } catch (err) {
    next(err);
  }
});

// POST /customers
customersRouter.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError());

  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({ ...parsed.data, tenant_id: req.user!.tenantId })
      .select('id, name, phone, email, source, external_id, created_at')
      .single();

    if (error) {
      if (error.code === '23505') return next(new ValidationError('Ce client existe déjà.'));
      throw error;
    }

    res.status(201).json({ customer: data });
  } catch (err) {
    next(err);
  }
});

// PATCH /customers/:id
customersRouter.patch('/:id', async (req, res, next) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return next(new ValidationError());

  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .update(parsed.data)
      .eq('id', req.params.id)
      .eq('tenant_id', req.user!.tenantId)
      .is('deleted_at', null)
      .select('id, name, phone, email, source, external_id, updated_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) return next(new NotFoundError());

    res.status(200).json({ customer: data });
  } catch (err) {
    next(err);
  }
});

// DELETE /customers/:id — soft delete
customersRouter.delete('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.user!.tenantId)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) return next(new NotFoundError());

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
