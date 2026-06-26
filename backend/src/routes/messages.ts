import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { authenticatedLimiter } from '../middleware/rateLimiter';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { decryptToken } from '../lib/tokenCrypto';
import { sendWhatsAppMessage, sendFacebookMessage } from '../services/metaGraphClient';
import { ConflictError, NotFoundError, NotImplementedError, ValidationError } from '../lib/httpErrors';
import { logger } from '../lib/logger';

export const messagesRouter = Router();

messagesRouter.use(requireAuth, authenticatedLimiter);

// ── PATCH /conversations/:id/status ────────────────────────────────────────
const updateStatusSchema = z.object({
  status: z.enum(['new', 'in_progress', 'resolved']),
});

messagesRouter.patch('/:id/status', async (req, res, next) => {
  const parsed = updateStatusSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ValidationError('Statut invalide.'));
    return;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('conversations')
      .update({ status: parsed.data.status })
      .eq('id', req.params.id)
      .eq('tenant_id', req.user!.tenantId)
      .select('id, status')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      next(new NotFoundError('Conversation introuvable.'));
      return;
    }

    res.status(200).json({ conversation: data });
  } catch (err) {
    logger.error({ err, conversationId: req.params.id }, 'failed to update conversation status');
    next(err);
  }
});

// ── POST /conversations/:id/messages ───────────────────────────────────────
const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4096),
});

messagesRouter.post('/:id/messages', async (req, res, next) => {
  const parsed = sendMessageSchema.safeParse(req.body);

  if (!parsed.success) {
    next(new ValidationError('Message invalide.'));
    return;
  }

  try {
    // Tenant-scoped lookup: a conversation id that exists but belongs to
    // another tenant returns no row here, same as one that doesn't
    // exist at all — never reveals whether the id belongs to someone else.
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from('conversations')
      .select('id, platform, external_thread_id, social_connection_id')
      .eq('id', req.params.id)
      .eq('tenant_id', req.user!.tenantId)
      .maybeSingle();

    if (conversationError) throw conversationError;

    if (!conversation) {
      next(new NotFoundError('Conversation introuvable.'));
      return;
    }

    if (!conversation.social_connection_id) {
      next(new ConflictError('Aucun canal connecté pour cette conversation.'));
      return;
    }

    const { data: connection, error: connectionError } = await supabaseAdmin
      .from('social_connections')
      .select('id, platform, access_token_enc, metadata')
      .eq('id', conversation.social_connection_id)
      .eq('tenant_id', req.user!.tenantId)
      .is('disconnected_at', null)
      .maybeSingle();

    if (connectionError) throw connectionError;

    if (!connection) {
      next(new ConflictError('Le canal de cette conversation est déconnecté.'));
      return;
    }

    if (!conversation.external_thread_id) {
      next(new ConflictError('Destinataire introuvable pour cette conversation.'));
      return;
    }

    const accessToken = decryptToken(connection.access_token_enc as string);
    let externalMessageId: string;

    if (connection.platform === 'whatsapp') {
      const phoneNumberId = (connection.metadata as Record<string, unknown> | null)?.phone_number_id;

      if (typeof phoneNumberId !== 'string') {
        next(new ConflictError('Numéro WhatsApp introuvable pour ce canal.'));
        return;
      }

      externalMessageId = await sendWhatsAppMessage(
        phoneNumberId,
        accessToken,
        conversation.external_thread_id,
        parsed.data.content,
      );
    } else if (connection.platform === 'facebook') {
      externalMessageId = await sendFacebookMessage(
        accessToken,
        conversation.external_thread_id,
        parsed.data.content,
      );
    } else {
      next(new NotImplementedError("L'envoi de messages TikTok n'est pas encore disponible."));
      return;
    }

    const { data: message, error: insertError } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        tenant_id: req.user!.tenantId,
        social_connection_id: connection.id,
        direction: 'outbound',
        content: parsed.data.content,
        external_message_id: externalMessageId,
        delivery_status: 'sent',
      })
      .select('id, content, created_at, delivery_status')
      .single();

    if (insertError) throw insertError;

    res.status(201).json({ message });
  } catch (err) {
    logger.error({ err, conversationId: req.params.id }, 'failed to send outbound message');
    next(err);
  }
});
