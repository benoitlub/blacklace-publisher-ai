export const BLACKLACE_PARCEL = {
  id: "blacklace-ecosystem",
  code: "PARCEL-001",
  name: "Écosystème Blacklace",
  mission: "Transformer les créations existantes de Benoît en visibilité, ventes, partenaires et apprentissages réels.",
  priorities: ["revenus rapides", "campagnes prêtes", "pages de vente", "prospects qualifiés", "amélioration continue"],
};

export const BLACKLACE_SEEDS = [
  ["gerard-et-gerard", "Gérard & Gérard", "Préparer une landing page et une campagne Instagram/TikTok capables de vendre le livre à 20 €.", "Landing page, hooks, scripts courts, CTA Amazon et calendrier de publication."],
  ["terra", "TERRA", "Identifier son audience la plus réceptive et préparer une campagne de vente directement exploitable.", "Positionnement, page de présentation, campagne Bookstagram/BookTok et liste de relais."],
  ["neverland-ltd", "Neverland Ltd", "Relancer la visibilité des volumes publiés avec une campagne narrative cohérente.", "Angle de campagne, séquence de contenus et page de collection."],
  ["feulette-tachetee", "La Feulette Tachetée", "Créer une promotion claire pour les parents, lecteurs jeunesse et cadeaux.", "Page courte, visuels à produire, posts et ciblage de communautés."],
  ["420-dice", "420 Dice", "Préparer une offre internationale et identifier des partenaires ou distributeurs pertinents.", "Pitch anglais, fiche produit, liste de prospects et premier email de contact."],
  ["prohibited-online", "Pro.Hibited Online", "Clarifier l'offre numérique actuelle et préparer une première campagne de joueurs/tests.", "Landing page, promesse, campagne et liste de communautés à contacter."],
  ["blacklace-dice", "Blacklace Dice", "Trouver un angle simple pour attirer les premiers utilisateurs et tester la conversion.", "Page, démonstration courte, campagne sociale et appel à bêta-testeurs."],
  ["creature-sync", "Creature Sync", "Choisir une audience prioritaire et préparer une bêta publique crédible.", "Positionnement, page bêta, message de recrutement et protocole de feedback."],
  ["feuch-institute", "Feuch Institute", "Transformer la page en porte d'entrée compréhensible vers l'univers Blacklace.", "Architecture de page, promesse, SEO de base et contenus d'entrée."],
  ["bazar-du-feuch", "Bazar du Feuch", "Créer une page orientée découverte et conversion pour les créations disponibles.", "Catalogue priorisé, CTA, page de vente et campagne de lancement."],
  ["poulpe-fiction", "Poulpe Fiction", "Obtenir une première preuve que Gérard produit une récolte utile sans supervision continue.", "Une aventure réelle terminée avec livrable exploitable et apprentissage mesurable."],
].map(([id, title, objective, firstHarvest], index) => ({
  id,
  parcelId: BLACKLACE_PARCEL.id,
  title,
  objective,
  firstHarvest,
  priority: index + 1,
  status: "planted",
  maturity: 0,
  gardener: "gerard",
  plantedBy: "gerard",
}));
