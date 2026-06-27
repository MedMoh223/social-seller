import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/httpErrors';
import { logger } from '../lib/logger';

export const agentsRouter = Router();

agentsRouter.use(requireAuth, authenticatedLimiter);

// Seul le owner peut gérer les agents
function requireOwner(req: any, res: any, next: any) {
  if (req.user?.role !== 'owner') {
    return next(new ForbiddenError('Seul le propriétaire peut gérer les agents.'));
  }
  next();
}

const EMAIL_DOMAIN = '@socialseller.app';
const COUNTRY_CODE = '+223';

function phoneToEmail(phone: string): string {
  const normalized = phone.startsWith('+') ? phone : `${COUNTRY_CODE}${phone}`;
  return `${normalized}${EMAIL_DOMAIN}`;
}

// ── GET /agents/me ───────────────────────────────────────────────────────────
agentsRouter.get('/me', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, role, is_active')
      .eq('id', req.user!.id)
      .single();

    if (error) throw error;
    res.status(200).json({ user: data });
  } catch (err) {
    logger.error({ err }, 'failed to get current user');
    next(err);
  }
});

// ── GET /agents ──────────────────────────────────────────────────────────────
agentsRouter.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, role, is_active, created_at')
      .eq('tenant_id', req.user!.tenantId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.status(200).json({ agents: data ?? [] });
  } catch (err) {
    logger.error({ err }, 'failed to list agents');
    next(err);
  }
});

// ── POST /agents/invite ───────────────────────────────────────────────────────
const inviteSchema = z.object({
  phone: z.string().min(8).max(15),
  fullName: z.string().trim().min(1).max(100),
  role: z.enum(['agent', 'owner']).default('agent'),
});

agentsRouter.post('/invite', requireOwner, async (req, res, next) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.issues[0]?.message ?? 'Données invalides.'));
  }

  const { phone, fullName, role } = parsed.data;
  const email = phoneToEmail(phone);

  try {
    // Vérifier si l'email existe déjà dans Supabase Auth
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existing.users.find((u) => u.email === email);

    if (existingUser) {
      // L'utilisateur existe — vérifier s'il appartient déjà à ce tenant
      const { data: existingMember } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', existingUser.id)
        .eq('tenant_id', req.user!.tenantId)
        .maybeSingle();

      if (existingMember) {
        return next(new ConflictError('Cet agent fait déjà partie de votre équipe.'));
      }

      // Appartient à un autre tenant — refuser
      return next(new ConflictError('Ce numéro est déjà utilisé dans une autre boutique.'));
    }

    // Générer un mot de passe temporaire
    const tempPassword = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10).toUpperCase() + '!';

    // Créer le compte Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true, // auto-confirmé
      user_metadata: { full_name: fullName },
    });

    if (authError || !authData.user) {
      throw authError ?? new Error('user_creation_failed');
    }

    // Insérer dans public.users avec le tenant du owner
    const { error: insertError } = await supabaseAdmin.from('users').insert({
      id: authData.user.id,
      tenant_id: req.user!.tenantId,
      full_name: fullName,
      phone,
      role,
      is_active: true,
    });

    if (insertError) {
      // Rollback : supprimer l'auth user créé
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw insertError;
    }

    logger.info({ agentId: authData.user.id, tenantId: req.user!.tenantId }, 'agent invited');

    res.status(201).json({
      agent: {
        id: authData.user.id,
        full_name: fullName,
        phone,
        role,
        is_active: true,
      },
      temp_password: tempPassword, // À communiquer à l'agent hors-app
    });
  } catch (err) {
    logger.error({ err }, 'failed to invite agent');
    next(err);
  }
});

// ── PATCH /agents/:id ─────────────────────────────────────────────────────────
const updateAgentSchema = z.object({
  is_active: z.boolean().optional(),
  role: z.enum(['agent', 'owner']).optional(),
  full_name: z.string().trim().min(1).max(100).optional(),
});

agentsRouter.patch('/:id', requireOwner, async (req, res, next) => {
  const parsed = updateAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(new ValidationError(parsed.error.issues[0]?.message ?? 'Données invalides.'));
  }

  const agentId = req.params.id;

  // Empêcher le owner de se désactiver lui-même
  if (agentId === req.user!.id && parsed.data.is_active === false) {
    return next(new ForbiddenError('Vous ne pouvez pas vous désactiver vous-même.'));
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update(parsed.data)
      .eq('id', agentId)
      .eq('tenant_id', req.user!.tenantId)
      .select('id, full_name, phone, role, is_active')
      .single();

    if (error) {
      if (error.code === 'PGRST116') return next(new NotFoundError('Agent introuvable.'));
      throw error;
    }

    res.status(200).json({ agent: data });
  } catch (err) {
    logger.error({ err, agentId }, 'failed to update agent');
    next(err);
  }
});

// ── DELETE /agents/:id ────────────────────────────────────────────────────────
agentsRouter.delete('/:id', requireOwner, async (req, res, next) => {
  const agentId = req.params.id;

  if (agentId === req.user!.id) {
    return next(new ForbiddenError('Vous ne pouvez pas supprimer votre propre compte.'));
  }

  try {
    // Vérifier que l'agent appartient bien au tenant
    const { data: member } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', agentId)
      .eq('tenant_id', req.user!.tenantId)
      .maybeSingle();

    if (!member) return next(new NotFoundError('Agent introuvable.'));

    // Supprimer de public.users + auth
    await supabaseAdmin.from('users').delete().eq('id', agentId);
    await supabaseAdmin.auth.admin.deleteUser(agentId);

    res.status(200).json({ success: true });
  } catch (err) {
    logger.error({ err, agentId }, 'failed to delete agent');
    next(err);
  }
});
