/**
 * Remove qualquer caractere não numérico.
 * Exemplo: "(41) 99876-5432" -> "41998765432"
 */
export function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * Verifica se o telefone representa um celular brasileiro válido.
 * Exemplo válido: "41998765432"
 * Exemplo inválido (fixo): "4134567890"
 */
export function isBrazilianMobile(digits: string): boolean {
  let normalized = digits;

  if (normalized.startsWith("55") && normalized.length === 13) {
    normalized = normalized.slice(2);
  }

  if (normalized.length !== 11) {
    return false;
  }

  const ddd = Number(normalized.slice(0, 2));
  if (ddd < 11 || ddd > 99) {
    return false;
  }

  return normalized[2] === "9";
}

/**
 * Normaliza telefone para o formato internacional com DDI brasileiro.
 * Exemplo: "(41) 99876-5432" -> "+5541998765432"
 * Exemplo inválido: "(41) 3456-7890" -> null
 */
export function normalizePhone(raw: string): string | null {
  const sanitized = sanitizePhone(raw);
  if (!sanitized) {
    return null;
  }

  const withCountryCode =
    sanitized.startsWith("55") && (sanitized.length === 12 || sanitized.length === 13)
      ? sanitized
      : `55${sanitized}`;

  const localDigits = withCountryCode.slice(2);
  if (!isBrazilianMobile(localDigits)) {
    return null;
  }

  return `+${withCountryCode}`;
}
