# Pack de profils professionnels — Benoît Lubert

Statut : **référentiel de travail**, non connecté automatiquement au runtime de Publisher ou Gérard.
Objectif : préparer trois CV ciblés et la sélection des candidatures. Ne pas présenter ce document comme des CV PDF/DOCX finalisés.

## Coordonnées vérifiées dans les CV de référence
- Nom : Benoît Lubert
- Localisation : La Celle-Saint-Cloud, Yvelines, France
- Email professionnel : benoitlubert@gmail.com
- Téléphone : **à confirmer** (ne pas utiliser l'ancien numéro espagnol sans vérification)

## Profil A — Formateur multimédia, création numérique et IA
**Titre cible :** Formateur multimédia · Design graphique · Outils numériques et IA

- Environ 20 ans d'expérience en formation multimédia, notamment GRETA Pau, M2i, Doranco et IBGS Paris.
- Compétences : Adobe Photoshop, Illustrator, InDesign, création web, vidéo et motion design, pédagogie, création numérique, outils d'IA créative.
- Formation : certification Adobe Photoshop (2008), formation Webmaster IBGS (2000–2002), Beaux-Arts de Versailles (1996–1999).
- Valoriser la conception d'ateliers et la transmission des savoir-faire ; ne pas inventer de diplômes ou de titres de poste.

**Offres à cibler :** formateur bureautique créative / multimédia, animateur numérique, médiateur numérique, formateur outils graphiques et IA.

## Profil B — Directeur artistique, graphiste et expériences interactives
**Titre cible :** Directeur artistique · Designer graphique · Multimédia et XR

- Pro.Hibited / Blacklace Island : conception d'identités, jeux physiques et numériques, univers narratifs, contenus visuels et vidéo.
- Nestandco.eu (2020–2023) : conception produit, visualisation 3D, communication numérique.
- Growbarato / CHK-Solutions / Rótula Tu Mismo : identité visuelle, packaging, supports imprimés et numériques ; dates exactes à confirmer selon les CV sources.
- Compétences : Adobe Creative Cloud, Figma, WordPress, HTML/CSS, 3ds Max, Cinema 4D, Unity, AR/XR, vidéo et motion.

**Offres à cibler :** graphiste polyvalent, designer multimédia, directeur artistique, créateur de contenus, concepteur d'expériences interactives.

## Profil C — Vente, animation commerciale et CBD
**Titre cible :** Conseiller de vente · Animateur commercial · Univers CBD, vape et jeux

- Alter Smoke, Parly 2 : conseiller de vente, août–octobre 2026.
- Metro CSC, Valence : gestion de club, accueil, animation, communication et événements ; dates précises à vérifier.
- Connaissance pratique de l'univers CBD, du chanvre, de la culture et des accessoires.
- Créateur de jeux de société (Pro.Hibited, 420 Dice, Jointed) ; présentation lors d'événements spécialisés.
- Expérience d'animation auprès d'enfants et de publics variés.

**Offres à cibler :** vendeur spécialisé, animateur jeux, commercial de proximité, conseiller CBD/vape, animation événementielle.

## Règles pour la prospection Gérard
1. Ne postuler qu'à une offre authentifiée, actuelle et correspondant raisonnablement à l'un des trois profils.
2. Choisir le CV adapté ; personnaliser le message à partir de faits documentés, sans inventer qualifications, résultats ou disponibilités.
3. L'utilisateur a autorisé l'envoi autonome des candidatures **fiables et correctement préparées**, sans validation individuelle. Cette autorisation ne couvre pas les autres actions extérieures (contrats, achats, engagements, publications non liées à la candidature).
4. Suspendre une candidature si des coordonnées essentielles, pièces exigées ou déclarations réglementaires ne peuvent être vérifiées.
5. Éviter les doublons et consigner : entreprise, poste, URL de l'offre, CV choisi, date, canal, identifiant/preuve d'envoi, réponse et statut dans Récoltes.
6. Ne jamais annoncer « candidature envoyée » sans preuve du canal d'envoi.
7. Respecter les programmations sociales existantes ; ne pas modifier Metricool ou les workflows de publication pour ce chantier.

## Travaux restant à faire
- Générer les trois CV finalisés (DOCX/PDF) après contrôle des versions Figma et des dates.
- Vérifier le mécanisme d'import de ressources Publisher.
- Raccorder ce pack à une mission de prospection réelle dans Poulpe Fiction et tester la chaîne jusqu'à une preuve d'envoi.

## Diagnostic d'intégration au 15 novembre 2026 — chemins existants

**Ne pas créer une seconde architecture de recrutement.** Les composants suivants existent déjà sur la branche principale des dépôts :

- `poulpe-fiction/scripts/gerard-job-radar.mjs` : recherche, filtrage d'offres, sélection sommaire d'un profil et préparation de brouillons ; le texte prévoit encore un CV à joindre ou à sélectionner.
- `poulpe-fiction/garden/restart-seeds.json` : Seed `benoit-job-search`, parcelle `benoit-career`, template `job-search`, livraison `review-only`.
- `poulpe-fiction/src/poulpe-fiction-mobile-v2/screens/HarvestScreen.tsx` : carte de candidature, confirmation `window.confirm`, appel `/api/garden/v1/candidatures/:id/send` et mention explicite d'absence de pièce jointe.
- `blacklace-publisher-ai/publisher-worker/src/candidature-mail.ts` : validation du contenu et reconnaissance d'un reçu Gmail.
- `blacklace-publisher-ai/knowledge/profiles/benoit-lubert/README_KNOWLEDGE_PACKAGE.md` : paquet professionnel existant daté du 12 juillet 2026 ; à actualiser plutôt qu'à remplacer aveuglément.
- `poulpe-fiction/publisher-knowledge.js` : adaptation des Knowledge Packs vérifiés pour Gérard.

**Raccordement restant, à traiter dans une PR de code distincte après inspection des handlers :**
1. Vérifier comment le Worker sert le slug `benoit-lubert-professional` ; un fichier dans `knowledge-packs/` n'est pas automatiquement chargé par ce mécanisme.
2. Générer et contrôler les trois PDF CV, puis prévoir une source de pièces jointes accessible à l'envoi Gmail ; ne jamais envoyer un mail présenté comme candidature complète si le CV obligatoire manque.
3. Appliquer l'autorisation spécifique de Benoît aux **candidatures vérifiées uniquement** ; garder le contrôle d'identité, le destinataire sourcé, le verrou anti-doublon et la confirmation Gmail avec identifiant.
4. Mettre à jour Récoltes pour afficher les candidatures envoyées automatiquement et leurs reçus, sans prétendre qu'un brouillon est un envoi.
5. Tester le parcours de bout en bout sans modifier les workflows Metricool/Buffer ; ne déclarer le système opérationnel qu'après un envoi réel justifié et vérifié.

**Statut :** diagnostic de raccordement documenté, **aucun envoi automatique activé**, aucune pièce jointe installée.
