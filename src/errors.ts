const messages = {
  ARGUMENT_INVALID: 'Use iglo.mem init [--reset-credentials], prepare, search "<query>", status, or gc.',
  REPOSITORY_INVALID: 'Run iglo.mem inside a valid Git worktree.',
  CONFIG_INVALID: 'Invalid or missing .agent/memory.json. Run iglo.mem init or repair the configuration.',
  INTERNAL_ERROR: 'The operation failed.',
} as const;

export type ErrorCode = keyof typeof messages;

export class AppError extends Error {
  constructor(readonly code: ErrorCode) {
    super(messages[code]);
    this.name = 'AppError';
  }
}

// Never serialize an arbitrary exception: it may contain paths, input or secrets.
export function errorResponse(error: unknown) {
  const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
  return { error: { code, message: messages[code] } };
}
