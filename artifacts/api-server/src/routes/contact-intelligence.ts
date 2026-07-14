import { Router } from "express";
import {
  learnFromContactDecision,
  rankContacts,
  type ContactBankRecord,
  type ContactLearningProfile,
  type ContactNeed,
  type RankedContact,
} from "../knowledge/contact-intelligence";

const router = Router();

router.post("/rank", (req, res) => {
  const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts as ContactBankRecord[] : [];
  const need = req.body?.need as ContactNeed | undefined;
  const learning = req.body?.learning as ContactLearningProfile | undefined;

  if (!contacts.length) {
    return res.status(400).json({ error: "Une banque de contacts non vide est requise." });
  }
  if (!need?.objective?.trim()) {
    return res.status(400).json({ error: "L'objectif de recherche est requis." });
  }

  const ranked = rankContacts(contacts, need, learning);
  return res.json({
    version: 1,
    objective: need.objective,
    evaluatedAt: new Date().toISOString(),
    sourceCount: contacts.length,
    matchedCount: ranked.length,
    ranked,
    policy: {
      observationOnly: true,
      externalContactRequiresApproval: true,
      traceableSourcesRequired: true,
    },
  });
});

router.post("/learn", (req, res) => {
  const ranked = req.body?.ranked as RankedContact | undefined;
  const decision = req.body?.decision as "accepted" | "rejected" | undefined;
  const learning = req.body?.learning as ContactLearningProfile | undefined;

  if (!ranked?.contact?.id || !["accepted", "rejected"].includes(String(decision))) {
    return res.status(400).json({ error: "Une recommandation et une décision accepted/rejected sont requises." });
  }

  return res.json({
    version: 1,
    contactId: ranked.contact.id,
    decision,
    learning: learnFromContactDecision(ranked, decision!, learning),
    learnedAt: new Date().toISOString(),
  });
});

export default router;
