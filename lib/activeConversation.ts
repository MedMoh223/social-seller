/**
 * Module-level store pour la conversation actuellement visible.
 * Utilisé par setNotificationHandler dans _layout.tsx pour supprimer
 * les notifications push quand l'utilisateur est déjà dans la conversation.
 */
let activeConversationId: string | null = null;

export function setActiveConversation(id: string | null): void {
  activeConversationId = id;
}

export function getActiveConversation(): string | null {
  return activeConversationId;
}
