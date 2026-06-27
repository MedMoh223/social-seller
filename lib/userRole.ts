/**
 * Store module-level pour le rôle de l'utilisateur connecté.
 * Chargé une fois au démarrage dans _layout.tsx via /agents/me.
 */

type Role = 'owner' | 'agent';

let currentRole: Role | null = null;
let currentUserId: string | null = null;

export function setUserRole(role: Role, userId: string): void {
  currentRole = role;
  currentUserId = userId;
}

export function clearUserRole(): void {
  currentRole = null;
  currentUserId = null;
}

export function getUserRole(): Role | null {
  return currentRole;
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

export function isOwner(): boolean {
  return currentRole === 'owner';
}
