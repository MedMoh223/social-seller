# Social Seller — Instructions de sécurité pour Claude Code

## Identité du projet

Application SaaS multi-tenant — Djiguitech
Stack : Expo SDK 56 + TypeScript + Expo Router + Supabase + Node.js/Express (Railway)

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
