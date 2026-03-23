const DANGEROUS_PATTERNS = [
  /cat\s+.*\.env/i,
  /echo\s+\$\w*(token|key|secret|password|pwd)\w*/i,
  /printenv/i,
  /^\s*env\s*$/i,
  /cat\s+.*\.(pem|rsa|key)\b/i,
  /cat\s+.*\.ssh\/id_/i,
];

const SECRET_PATTERNS = [
  /\d{8,10}:[a-zA-Z0-9_-]{30,}/g,       // Telegram Bot Token
  /sk-[a-zA-Z0-9]{40,}/g,                // OpenAI-style API Key
  /ghp_[a-zA-Z0-9]{36,}/g,              // GitHub PAT
  /xox[bpors]-[a-zA-Z0-9-]{10,}/g,      // Slack token
];

const SENSITIVE_FIELD_NAMES = /^(password|passwd|pwd|token|secret|api_key|apikey|auth|credential|private_key)$/i;

const MAX_OUTPUT_LENGTH = 200;

export function isDangerousCommand(command: string): boolean {
  return DANGEROUS_PATTERNS.some(p => p.test(command));
}

export function sanitize(text: string): string {
  if (!text) return "";

  // Layer 1: dangerous command pattern → hide entirely
  if (isDangerousCommand(text)) {
    return "[보안상 내용이 숨겨졌습니다]";
  }

  // Layer 2: mask secret patterns in output
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), "****");
  }

  // Layer 3: truncate
  if (result.length > MAX_OUTPUT_LENGTH) {
    result = result.slice(0, MAX_OUTPUT_LENGTH);
  }

  return result;
}

export function sanitizeField(fieldName: string, value: string): string {
  if (SENSITIVE_FIELD_NAMES.test(fieldName)) return "****";
  return value;
}
