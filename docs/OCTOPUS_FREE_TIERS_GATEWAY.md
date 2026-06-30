# Octopus Free-Tiers Gateway — Publisher AI

Objectif : permettre au Poulpe / Publisher AI d'utiliser une plateforme tierce ou plusieurs fournisseurs IA via une passerelle unique, avec priorite aux offres gratuites, fallback propre, suivi des quotas et mode mock si aucune cle n'est disponible.

Principe : le Poulpe ne doit pas devenir une usine a gaz. Il sait deleguer, choisir le bon bras, et revenir au mock sans casser l'application.

---

## 1. Idee reprise

On ne copie pas une plateforme externe telle quelle. On reprend l'architecture utile :

- un gateway IA unique cote serveur ;
- des providers interchangeables : Mistral, OpenRouter, Groq, HuggingFace, Cloudflare, GitHub Models, etc. ;
- un routeur qui choisit le provider selon la tache, la disponibilite et le quota ;
- un fallback automatique si une cle manque, si un quota est atteint ou si un provider repond mal ;
- un journal des appels pour savoir qui a servi quoi ;
- un mode mock maintenu pour que l'application ne plante jamais.

---

## 2. Architecture cible

```txt
Frontend Publisher AI
  Dashboard / Generate / Connectors / Settings
        |
        | POST /api/generate/*
        v
API Server Express
        |
        v
services/ai-gateway/
  provider-registry.ts
  router.ts
  quota-store.ts
  task-types.ts
  providers/
    mistral.ts
    openrouter.ts
    groq.ts
    huggingface.ts
    third-party.ts
    mock.ts
        |
        v
Fournisseurs IA externes ou plateforme tierce
```

Le frontend ne parle jamais directement aux providers. Toutes les cles restent cote serveur.

---

## 3. Taches supportees

```ts
export type AiTaskType =
  | "text.post"
  | "text.thread"
  | "text.summary"
  | "image.prompt"
  | "video.prompt"
  | "video.storyboard"
  | "translation"
  | "metadata.tags";
```

Pour la video IA, le Poulpe ne genere pas forcement la video lui-meme au depart. Il peut :

1. creer le prompt video ;
2. creer le storyboard ;
3. preparer les plans ;
4. envoyer la demande vers une plateforme tierce si une cle existe ;
5. sinon produire un paquet pret a coller dans Kling, Runway, Pika, Veo, Wan, etc.

---

## 4. Contrat interne

```ts
export interface AiGatewayRequest {
  task: AiTaskType;
  prompt: string;
  system?: string;
  universe?: string;
  agent?: string;
  preferredProvider?: string;
  maxTokens?: number;
  temperature?: number;
  metadata?: Record<string, unknown>;
}

export interface AiGatewayResponse {
  ok: boolean;
  provider: string;
  model?: string;
  output: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    estimatedCost?: number;
  };
  fallbackUsed?: boolean;
  error?: string;
}
```

---

## 5. Strategie de routing

Ordre recommande :

1. provider explicitement demande ;
2. provider gratuit disponible pour ce type de tache ;
3. provider avec quota restant ;
4. provider le plus fiable ;
5. mock Blacklace.

Pseudo-code :

```ts
const candidates = registry
  .forTask(request.task)
  .filter(provider => provider.isConfigured())
  .filter(provider => quotaStore.canUse(provider.id));

for (const provider of candidates) {
  const result = await provider.generate(request);
  if (result.ok) return result;
  quotaStore.markFailure(provider.id, result.error);
}

return mockProvider.generate(request);
```

---

## 6. Variables d'environnement proposees

```env
AI_GATEWAY_MODE=auto
AI_GATEWAY_DEFAULT_PROVIDER=mistral
AI_GATEWAY_LOG_USAGE=true

MISTRAL_API_KEY=
OPENROUTER_API_KEY=
GROQ_API_KEY=
HUGGINGFACE_API_KEY=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
GITHUB_MODELS_TOKEN=

THIRD_PARTY_AI_GATEWAY_URL=
THIRD_PARTY_AI_GATEWAY_KEY=
THIRD_PARTY_AI_GATEWAY_NAME=

KLING_API_KEY=
RUNWAY_API_KEY=
PIKA_API_KEY=
LUMA_API_KEY=
REPLICATE_API_TOKEN=
FAL_API_KEY=
```

Aucune cle ne doit etre exposee au frontend.

---

## 7. UI Publisher AI

Ajouter dans Connectors ou Settings :

- statut des providers : configure / absent / erreur / mock ;
- nombre d'appels estimes ;
- dernier provider utilise ;
- bouton de test par provider ;
- priorite de routing ;
- mode : Mock, Auto, Provider force.

Ajouter dans le generateur :

- choix Auto par defaut ;
- badge visible : Servi par Mistral, Servi par OpenRouter, Mock Blacklace, etc. ;
- pour la video : export d'un pack video comprenant prompt, storyboard, plans, voix off, style, ratio, duree.

---

## 8. Garde-fous

- Respecter les conditions d'utilisation de chaque provider.
- Ne pas automatiser la creation massive de comptes.
- Ne pas stocker les cles en base sans chiffrement.
- Ne jamais logger une cle API.
- Prevoir une validation humaine avant publication.
- Garder le mode mock comme parachute officiel.

---

## 9. Plan d'integration

### Passe 1 — Gateway texte propre

- Creer `artifacts/api-server/src/services/ai-gateway/`.
- Deplacer la logique Mistral existante derriere un provider `mistral`.
- Ajouter `mock` comme provider officiel.
- Modifier `/api/generate/*` pour appeler `aiGateway.generate()`.
- Build vert.

### Passe 2 — Providers et fallback

- Ajouter OpenRouter, Groq et HuggingFace comme providers optionnels.
- Ajouter le router `auto`.
- Ajouter logs d'usage simples.
- Ajouter statut dans `Connectors`.

### Passe 3 — Video IA via plateforme tierce

- Ajouter `video.prompt` et `video.storyboard`.
- Ajouter export de pack video.
- Ajouter provider `third-party-gateway` si `THIRD_PARTY_AI_GATEWAY_URL` existe.
- Brancher ensuite Kling / Runway / Pika / Replicate / Fal uniquement si cles disponibles.

---

## 10. Definition de fini

- L'application demarre sans aucune cle API.
- Une generation texte fonctionne en mock.
- Une generation texte utilise un vrai provider si cle disponible.
- Si le provider echoue, le fallback repond.
- Le frontend indique quel provider a repondu.
- Les cles restent cote serveur.
- `pnpm install`, `pnpm run typecheck` et `pnpm run build` passent.
