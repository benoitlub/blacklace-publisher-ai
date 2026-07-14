export type ContactBankRecord = {
  readonly id: string;
  readonly displayName: string;
  readonly sourceRef: string;
  readonly evidence: readonly string[];
  readonly email?: string;
  readonly organization?: string;
  readonly role?: string;
  readonly sector?: string;
  readonly country?: string;
  readonly languages?: readonly string[];
  readonly projectsMentioned?: readonly string[];
  readonly offersMentioned?: readonly string[];
  readonly tags?: readonly string[];
  readonly lastInteractionAt?: string;
  readonly responseHistory?: readonly string[];
};

export type ContactNeed = {
  readonly objective: string;
  readonly project?: string;
  readonly audience?: readonly string[];
  readonly sectors?: readonly string[];
  readonly countries?: readonly string[];
  readonly languages?: readonly string[];
  readonly preferredRoles?: readonly string[];
};

export type ContactLearningProfile = {
  readonly acceptedSignals?: Readonly<Record<string, number>>;
  readonly rejectedSignals?: Readonly<Record<string, number>>;
};

export type RankedContact = {
  readonly contact: ContactBankRecord;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
  readonly sourceRef: string;
};

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(values: readonly string[] | undefined): string[] {
  return (values ?? []).flatMap((value) => normalize(value).split(/\s+/)).filter((value) => value.length > 2);
}

function contactText(contact: ContactBankRecord): string {
  return normalize([
    contact.displayName,
    contact.organization,
    contact.role,
    contact.sector,
    contact.country,
    ...(contact.languages ?? []),
    ...(contact.projectsMentioned ?? []),
    ...(contact.offersMentioned ?? []),
    ...(contact.tags ?? []),
    ...(contact.evidence ?? []),
    ...(contact.responseHistory ?? []),
  ].filter(Boolean).join(" "));
}

function learnedWeight(signal: string, learning?: ContactLearningProfile): number {
  const accepted = Number(learning?.acceptedSignals?.[signal] ?? 0);
  const rejected = Number(learning?.rejectedSignals?.[signal] ?? 0);
  return Math.max(-4, Math.min(6, accepted * 0.75 - rejected * 0.9));
}

export function rankContacts(
  contacts: readonly ContactBankRecord[],
  need: ContactNeed,
  learning?: ContactLearningProfile,
): RankedContact[] {
  const needTokens = new Set(tokens([
    need.objective,
    need.project ?? "",
    ...(need.audience ?? []),
    ...(need.sectors ?? []),
    ...(need.countries ?? []),
    ...(need.languages ?? []),
    ...(need.preferredRoles ?? []),
  ]));

  return contacts
    .map((contact): RankedContact => {
      const text = contactText(contact);
      const reasons: string[] = [];
      const warnings: string[] = [];
      let score = 0;

      for (const token of needTokens) {
        if (!text.includes(token)) continue;
        const signal = `token:${token}`;
        score += 2 + learnedWeight(signal, learning);
        reasons.push(`Correspondance observée : ${token}`);
      }

      const project = normalize(need.project);
      if (project && (contact.projectsMentioned ?? []).some((value) => normalize(value).includes(project))) {
        score += 16 + learnedWeight(`project:${project}`, learning);
        reasons.push(`Projet déjà mentionné : ${need.project}`);
      }

      const roleMatches = tokens(need.preferredRoles).filter((token) => normalize(contact.role).includes(token));
      if (roleMatches.length) {
        score += 9 + learnedWeight(`role:${roleMatches[0]}`, learning);
        reasons.push(`Rôle compatible : ${contact.role}`);
      }

      const sectorMatches = tokens(need.sectors).filter((token) => normalize(contact.sector).includes(token));
      if (sectorMatches.length) {
        score += 8 + learnedWeight(`sector:${sectorMatches[0]}`, learning);
        reasons.push(`Secteur compatible : ${contact.sector}`);
      }

      if ((contact.responseHistory?.length ?? 0) > 0) {
        score += 7 + learnedWeight("history:response", learning);
        reasons.push("Historique de réponse disponible");
      }

      if (contact.lastInteractionAt) {
        const ageDays = (Date.now() - new Date(contact.lastInteractionAt).getTime()) / 86_400_000;
        if (Number.isFinite(ageDays) && ageDays < 365) {
          score += 5 + learnedWeight("history:recent", learning);
          reasons.push("Relation récente");
        }
      }

      if (!contact.evidence.length) {
        score -= 20;
        warnings.push("Aucune preuve exploitable");
      }
      if (/no.?reply|do.?not.?reply/i.test(contact.email ?? "")) {
        score -= 25;
        warnings.push("Adresse automatique");
      }
      if ((contact.tags ?? []).some((tag) => /refus|unsubscribe|desinscription/i.test(normalize(tag)))) {
        score -= 40;
        warnings.push("Refus ou désinscription explicite");
      }

      return {
        contact,
        score: Math.max(0, Math.round(score * 10) / 10),
        reasons: [...new Set(reasons)].slice(0, 8),
        warnings,
        sourceRef: contact.sourceRef,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.contact.displayName.localeCompare(b.contact.displayName));
}

export function learnFromContactDecision(
  ranked: RankedContact,
  decision: "accepted" | "rejected",
  current: ContactLearningProfile = {},
): ContactLearningProfile {
  const acceptedSignals = { ...(current.acceptedSignals ?? {}) };
  const rejectedSignals = { ...(current.rejectedSignals ?? {}) };
  const signals = ranked.reasons.map((reason) => `reason:${normalize(reason)}`);

  for (const signal of signals) {
    if (decision === "accepted") acceptedSignals[signal] = (acceptedSignals[signal] ?? 0) + 1;
    else rejectedSignals[signal] = (rejectedSignals[signal] ?? 0) + 1;
  }

  return { acceptedSignals, rejectedSignals };
}
