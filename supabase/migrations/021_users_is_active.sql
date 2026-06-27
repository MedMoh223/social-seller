-- Ajout colonne is_active sur public.users
-- Permet de désactiver un agent sans le supprimer
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Les utilisateurs existants sont actifs par défaut (déjà géré par DEFAULT true)

-- Index pour filtrer les agents actifs rapidement
CREATE INDEX IF NOT EXISTS users_tenant_active_idx ON public.users (tenant_id, is_active);
