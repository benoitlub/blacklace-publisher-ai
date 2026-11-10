export const GERARD_GMAIL = "gerardpoulpefiction@gmail.com";
export const candidatureId = /^candidature-[a-f0-9]{20}$/;

export function candidatureAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const address = value.trim();
  return address.length <= 254 && /^[\w.!#$%&'*+/=?^\x60{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(address) ? address : null;
}

export function parseCandidatureMail(content: string) {
  const separator = "\n### Brouillon de candidature\n";
  const index = content.indexOf(separator);
  if (index < 0 || content.indexOf(separator, index + separator.length) >= 0) return null;
  const offer = content.slice(0, index);
  const draft = content.slice(index + separator.length);
  const message = /^Objet : ([^\r\n]{3,250})\n\n([\s\S]+)$/.exec(draft);
  if (!message) return null;
  const [, subject, body] = message;
  if (body.trim().length < 10 || body.length > 30000) return null;
  const listed = /^- Destinataire vérifié dans l’annonce : (.+)$/m.exec(offer)?.[1];
  const recipient = candidatureAddress(listed);
  if (listed && !recipient) return null;
  return { recipient, subject, body };
}

export async function candidatureRevision(content: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

export function gmailCandidatureReceipt(result: unknown) {
  const envelope = result as { successful?: boolean; data?: any } | null;
  if (envelope?.successful === false || envelope?.data?.successful === false) return null;
  const response = envelope?.data?.data ?? envelope?.data ?? envelope;
  if (!response || typeof response !== "object") return null;
  const id = response.id ?? response.messageId ?? response.message_id;
  return typeof id === "string" && /^[a-zA-Z0-9_-]{5,160}$/.test(id) ? id : null;
}
