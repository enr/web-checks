// Logger with centralized secret redaction (IMPLEMENTATION_PLAN §A.6).
// Secret values are registered once at resolution time; every output goes
// through redact() so a secret can never appear in report/log.

export interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** Single source of truth for secret values that must never be printed. */
export class SecretRegistry {
  private readonly secrets = new Set<string>();

  register(value: string): void {
    if (value.length > 0) this.secrets.add(value);
  }

  redact(str: string): string {
    let out = str;
    for (const secret of this.secrets) {
      out = out.split(secret).join('«redacted»');
    }
    return out;
  }
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export class ConsoleLogger implements Logger {
  constructor(
    private readonly secrets: SecretRegistry,
    private readonly minLevel: LogLevel = 'info',
  ) {}

  private emit(level: LogLevel, msg: string): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    process.stderr.write(`${this.secrets.redact(msg)}\n`);
  }

  debug(msg: string): void {
    this.emit('debug', msg);
  }
  info(msg: string): void {
    this.emit('info', msg);
  }
  warn(msg: string): void {
    this.emit('warn', msg);
  }
  error(msg: string): void {
    this.emit('error', msg);
  }
}
