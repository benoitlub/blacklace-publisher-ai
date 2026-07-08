# Publisher Studio — Knowledge Observatory

## Decision validee

Publisher Studio n'est plus seulement un assistant de redaction ou de publication.

Publisher Studio devient le **Knowledge Observatory** d'Octopus Engine.

> Publisher produit des connaissances. Octopus Engine produit des decisions.

## Triangle produit

Version publique :

- **Publisher** observe et presente.
- **Le Poulpe** memorise, compare et conseille.
- **Octopus Engine** decide et orchestre.

Version interne :

- Gerard reste le nom complice du Poulpe.
- Gerard ne doit pas apparaitre dans l'interface publique.

## Pipeline principal

```txt
Source brute
→ Radar
→ Candidats SaaS
→ Observatoire
→ Observation
→ Extraction
→ Knowledge
→ Knowledge Pack
→ Octopus Engine
```

## Responsabilites

### Publisher

Publisher est l'interface et le laboratoire visible.

Il sert a :

- coller des sources brutes ;
- afficher les candidats detectes ;
- lancer une observation ;
- visualiser les Knowledge Packs ;
- presenter les rapports, Seeds, Harvests et decisions.

Publisher ne decide pas seul.

### Le Poulpe

Le Poulpe est l'entite d'observation et de memoire.

Il sert a :

- reperer des outils et SaaS ;
- memoriser les observations ;
- comparer les outils ;
- detecter des patterns ;
- proposer des actions.

Le Poulpe observe avant de produire.

### Octopus Engine

Octopus Engine reste le cerveau technique.

Il sert a :

- planifier ;
- orchestrer ;
- coordonner ;
- executer les missions ;
- appliquer les regles Guardian, Capabilities et EventBus.

Octopus Engine ne doit pas etre melange au Publisher.

## Etat actuel du prototype

Valide en V1 mock :

- Radar local ;
- extraction locale de candidats SaaS depuis une source brute ;
- score d'interet mock ;
- bouton Observer ;
- Observatoire ;
- pipeline Source → Observation → Extraction → Knowledge → Knowledge Pack ;
- export mock vers Octopus ;
- aucun scraping reel ;
- aucun LLM ;
- aucune modification d'Octopus Engine.

## Prochaines etapes

### 1. Memoire des observations

Une fois un SaaS observe, le Poulpe ne doit plus repartir de zero.

Il doit memoriser :

- nom ;
- categorie ;
- dates d'observation ;
- nombre d'observations ;
- confiance ;
- evolutions detectees ;
- comparables ;
- decision actuelle.

### 2. Comparaison de SaaS

Comparer plusieurs outils pour detecter :

- concurrents ;
- patterns communs ;
- differences UX ;
- modeles economiques ;
- opportunites pour Octopus.

### 3. Actions proposees

Apres un Knowledge Pack, proposer :

- ignorer ;
- observer encore ;
- creer un Seed ;
- preparer un Harvest ;
- preparer un article ;
- comparer avec un autre outil ;
- ajouter a une collection.

### 4. Sources reelles

Plus tard seulement :

- Product Hunt ;
- GitHub Trending ;
- Hacker News ;
- Reddit SaaS / AI tools ;
- newsletters ;
- RSS ;
- directories IA.

## Regles d'architecture

- Ne pas creer une deuxieme architecture Publisher.
- Reutiliser Seeds, HarvestDrafts, Garden, Activity, Memory et PublisherLoop si possible.
- Ne pas toucher a Octopus Engine pour une evolution UI du Publisher.
- Ne pas ajouter de scraping, d'API externe ou de LLM tant que la V1 mock n'est pas stabilisee.
- Garder la separation : Publisher observe, Le Poulpe memorise, Octopus Engine decide.

## Formule courte

> Publisher observe.
>
> Le Poulpe apprend.
>
> Octopus Engine decide.
>
> Le Garden cultive.
