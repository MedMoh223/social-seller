-- Migration 022 : renommer le rôle 'merchant' en 'owner'
-- Le RBAC introduit en sprint 3 utilise 'owner' comme rôle propriétaire,
-- mais le schéma initial utilisait 'merchant'. On aligne le tout.

-- 1. Supprimer l'ancienne contrainte d'abord (elle bloque 'owner')
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. Mettre à jour les lignes existantes
UPDATE public.users
SET role = 'owner'
WHERE role = 'merchant';

-- 3. Ajouter la nouvelle contrainte avec 'owner'
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
    CHECK (role IN ('super_admin', 'owner', 'agent'));
