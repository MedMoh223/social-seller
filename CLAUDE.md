# Social Seller — Instructions pour Claude Code

## Briefing de session — OBLIGATOIRE

Au démarrage de chaque nouvelle session (après /clear ou première ouverture), avant toute autre chose, produire automatiquement ce briefing :

```
🚀 Social Seller — Briefing session [date du jour]

📊 MVP : X/17 stories complètes
🎯 Priorité : [story suivante]
🐛 Bug actif : [bug en cours si applicable]
📌 Prochaine action : [tâche concrète à faire]
```

Ne pas attendre que Mohamed demande ce briefing — l'envoyer systématiquement en premier message.

---

## Identité du projet

Application SaaS multi-tenant — Djiguitech
Stack : Expo SDK 54 + TypeScript + Expo Router + Supabase + Node.js/Express (Railway)

## État MVP — 27/06/2026

| Story | Description | État |
|-------|-------------|------|
| US-01 | Créer un tenant | ✅ |
| US-02 | Super Admin suspendre/résilier | ❌ post-MVP |
| US-03 | Renouvellement abonnement WhatsApp | ❌ post-MVP |
| US-04 | Activation compte | ✅ email + auto-confirm |
| US-05 | Profil boutique + logo | ✅ |
| US-06 | Connecter WhatsApp Business | ✅ |
| US-07 | Connecter page Facebook | ✅ |
| US-08 | Connecter TikTok | ⏳ en attente review API |
| US-09 | Inbox unifiée temps réel | ✅ |
| US-10 | Répondre aux clients (WhatsApp + Facebook) | ✅ |
| US-11 | Filtrer/rechercher inbox | ✅ |
| US-12 | Marquer conversation résolue | ✅ |
| US-13 | Créer commande depuis conversation | ✅ |
| US-14 | Notif statut commande WhatsApp/Facebook | ✅ |
| US-15 | Liste commandes + filtre + export CSV | ✅ |
| US-16 | Annuler commande avec motif + réappro stock | ✅ |
| US-17 | Catalogue produits | ✅ |

**Hors stories livrés : Dashboard home, Gestion agents, RBAC owner/agent**
**Prochaine priorité : Tests app RBAC en cours**

## Bug actif

- Écran gris OAuth Android après authentification WhatsApp/Facebook
  - Cause : Custom Tab (`createTask: true` par défaut = tâche séparée)
  - Fixes appliqués : `createTask: false` dans channels.tsx, `res.redirect(302)` backend, `maybeCompleteAuthSession()` dans oauth-success/error.tsx
  - Nouveau build APK testé — toujours NOK, investigation en cours

## Fixes techniques récents (session 27/06/2026)

- RBAC complet : rôles owner/agent avec permissions différenciées
- Migration 022 : renommage role 'merchant' → 'owner' (schéma initial utilisait 'merchant')
- Dashboard home : KPIs, pipeline commandes, revenus, top produits, alertes stock
- Gestion agents : invite (téléphone + mot de passe temporaire), liste, désactiver, supprimer
- `(tabs)/_layout.tsx` : chargement du rôle bloquant avant rendu des tabs
- Produit : upload image Android via FormData, zoom image

## Schéma base de données — valeurs de référence

**RÈGLE : Mettre à jour cette section après chaque migration.**

### Table `public.users`
- `role` : `'owner'` | `'agent'` | `'super_admin'` *(migration 022 : 'merchant' → 'owner')*
- `is_active` : boolean (migration 021)

### Table `public.orders`
- `status` : `'new'` | `'confirmed'` | `'preparing'` | `'shipped'` | `'delivered'` | `'cancelled'`

### Table `public.conversations`
- `status` : `'in_progress'` | `'resolved'`
- `platform` : `'whatsapp'` | `'facebook'` | `'tiktok'`

### Table `public.social_connections`
- `platform` : `'whatsapp'` | `'facebook'` | `'tiktok'`
- `disconnected_at` : null si connecté, timestamp si déconnecté

### Table `public.products`
- `is_archived` : boolean (soft delete)

### Migrations appliquées
001 schéma initial · 002 audit log · 003-022 (voir supabase/migrations/)
Dernière migration : **022_rename_merchant_role_to_owner.sql**

## Tâches techniques restantes

- [ ] Résoudre écran gris OAuth Android
- [ ] Regenerer database.types.ts via `supabase gen types`
- [ ] Acheter socialseller.app + DNS + Resend prod
- [ ] TikTok DM : accès via business.tiktok.com après approbation API

## Règles de sécurité ABSOLUES

### Variables d'environnement

- Ne JAMAIS hardcoder une clé API, secret, mot de passe ou token dans le code
- Toutes les variables sensibles dans .env (jamais committé)
- Utiliser process.env.VARIABLE_NAME côté serveur
- Utiliser expo-secure-store pour les tokens côté mobile (jamais AsyncStorage pour les secrets)
- Le fichier .env doit toujours être dans .gitignore

### Multi-tenant & isolation des données

- Chaque requête Supabase doit être filtrée par tenant_id
- Ne JAMAIS faire une requête sans clause WHERE tenant_id = ?
- Row Level Security (RLS) activé sur TOUTES les tables
- Toujours vérifier que l'utilisateur appartient au bon tenant avant toute opération

### Authentification

- Utiliser uniquement Supabase Auth — ne pas implémenter d'auth custom
- Valider le JWT à chaque requête API côté serveur
- Les tokens de session stockés via expo-secure-store uniquement
- Expiration de session : 7 jours maximum

### API & Webhooks

- Valider la signature de tous les webhooks entrants (WhatsApp, Facebook, TikTok)
- Rate limiting sur toutes les routes API publiques
- Valider et sanitizer tous les inputs utilisateur (jamais de données brutes en base)
- CORS configuré strictement — whitelist uniquement

### Base de données

- Ne JAMAIS désactiver RLS sur une table en production
- Utiliser des transactions pour les opérations critiques (commande + stock)
- Pas de DELETE sans soft delete (colonne deleted_at)
- Logs d'audit pour les actions sensibles (suspension tenant, annulation commande)

### Code

- Pas de console.log avec des données sensibles en production
- Pas de stack trace exposée à l'utilisateur final
- Dépendances : vérifier les vulnérabilités avant d'ajouter un nouveau package
- Pas de eval(), pas de dangerouslySetInnerHTML

## Environnements

- Dev : .env.local — Mailpit + Supabase dev project
- Staging : .env.staging — Mailtrap + Supabase staging project
- Prod : .env.production — Resend + Supabase prod project

## Emails

- noreply@djiguitech.com — emails transactionnels (Resend en prod)
- support@djiguitech.com — support clients
