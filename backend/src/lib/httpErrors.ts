export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly publicMessage: string;

  constructor(statusCode: number, code: string, publicMessage: string) {
    super(publicMessage);
    this.statusCode = statusCode;
    this.code = code;
    this.publicMessage = publicMessage;
  }
}

export class UnauthorizedError extends AppError {
  constructor(publicMessage = 'Authentification requise.') {
    super(401, 'unauthorized', publicMessage);
  }
}

export class ForbiddenError extends AppError {
  constructor(publicMessage = "Vous n'avez pas accès à cette ressource.") {
    super(403, 'forbidden', publicMessage);
  }
}

export class ValidationError extends AppError {
  constructor(publicMessage = 'Requête invalide.') {
    super(400, 'validation_error', publicMessage);
  }
}

export class NotFoundError extends AppError {
  constructor(publicMessage = 'Ressource introuvable.') {
    super(404, 'not_found', publicMessage);
  }
}

export class ConflictError extends AppError {
  constructor(publicMessage = 'Conflit avec une ressource existante.') {
    super(409, 'conflict', publicMessage);
  }
}

export class WebhookSignatureError extends AppError {
  constructor(publicMessage = 'Signature de webhook invalide.') {
    super(401, 'invalid_webhook_signature', publicMessage);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(publicMessage = 'Trop de requêtes, réessayez plus tard.') {
    super(429, 'too_many_requests', publicMessage);
  }
}
