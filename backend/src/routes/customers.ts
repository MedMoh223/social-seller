import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { ValidationError, NotFoundError } from '../lib/httpErrors';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { recordAuditLog } from '../services/auditLogService';

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
// Supports ?q=search et ?external_id=xxx (lookup exact par external_id)
customersRouter.get('/', async (req, res, next) => {
  try {
    const search     = typeof req.query.q           === 'string' ? req.query.q.trim()           : null;
    const externalId = typeof req.query.external_id === 'string' ? req.query.external_id.trim() : null;

    let query = supabaseAdmin
      .from('customers')
      .select('id, name, phone, email, source, external_id, created_at, updated_at')
      .eq('tenant_id', req.user!.tenantId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (externalId) {
      query = query.eq('external_id', externalId);
    } else if (search) {
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

const deleteSchema = z.object({
  reason: z.string().trim().min(1, 'Un motif est requis.').max(500),
});

// DELETE /customers/:id — soft delete avec motif obligatoire
customersRouter.delete('/:id', async (req, res, next) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.issues[0]?.message ?? 'Un motif est requis.'));
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('customers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.user!.tenantId)
      .is('deleted_at', null)
      .select('id, name')
      .maybeSingle();

    if (error) throw error;
    if (!data) return next(new NotFoundError());

    await recordAuditLog({
      tenantId: req.user!.tenantId,
      userId: req.user!.id,
      action: 'customer_deleted',
      tableName: 'customers',
      recordId: data.id,
      oldValue: { name: data.name, reason: parsed.data.reason },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
