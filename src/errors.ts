const messages = {
  ARGUMENT_INVALID: 'Use iglo.mem init [--reset-credentials], prepare, search "<query>", status, or gc.',
  REPOSITORY_INVALID: 'Run iglo.mem inside a valid Git worktree.',
  CONFIG_INVALID: 'Invalid or missing .agent/memory.json. Run iglo.mem init or repair the configuration.',
  API_KEY_MISSING: 'No API key is available. Run iglo.mem init interactively or supply OPENROUTER_API_KEY.',
  CREDENTIALS_INVALID: 'Saved credentials or their location are invalid. Repair ~/.config/iglo.mem/credentials.json and its owner-only permissions, or use OPENROUTER_API_KEY.',
  CREDENTIALS_SAVE_FAILED: 'Could not save credentials. Check the user credentials directory and try init again.',
  SETUP_REQUIRES_TTY: 'Credential reset requires an interactive terminal. Run iglo.mem init --reset-credentials interactively.',
  SETUP_CANCELLED: 'Credential setup was cancelled. Previous saved credentials were preserved.',
  INDEX_NOT_READY: 'No prepared index found. Run iglo.mem prepare in this worktree.',
  INDEX_INVALID: 'The prepared index is invalid or incomplete. Run iglo.mem prepare.',
  INDEX_INCOMPATIBLE: 'The prepared index uses incompatible settings. Run iglo.mem prepare.',
  INDEX_WRITE_FAILED: 'Could not update the index. Check repository permissions and run iglo.mem prepare.',
  SOURCE_INVALID: 'Could not read the configured Markdown sources. Check their permissions and symlinks.',
  EMBEDDING_FAILED: 'The embedding request failed. Check OPENROUTER_API_KEY or run iglo.mem init --reset-credentials; also check model, provider input limits and connectivity.',
  INDEX_BUSY: 'The index is busy. Retry after the other operation finishes.',
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
