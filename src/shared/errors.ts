export interface StructuredError {
  code: string;
  message: string;
  retryable: boolean;
  subsystem: string;
  diagnosticId: string;
  cause?: string;
}

export function createStructuredError(code: string, message: string, options: Partial<Omit<StructuredError, 'code' | 'message'>> = {}): StructuredError {
  return {
    code,
    message,
    retryable: options.retryable ?? false,
    subsystem: options.subsystem ?? 'APPLICATION',
    diagnosticId: options.diagnosticId ?? `${code}-${Date.now().toString(36)}`,
    ...(options.cause ? { cause: options.cause } : {})
  };
}

export function toUserError(error: unknown, fallback: StructuredError): StructuredError {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) return error as StructuredError;
  return { ...fallback, cause: error instanceof Error ? error.message : String(error) };
}
