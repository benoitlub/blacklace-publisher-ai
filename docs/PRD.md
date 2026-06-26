# PRD — Feuch Institute Blacklace Publisher AI

**Version** : 1.0  
**Date** : Juin 2026  
**Auteur** : Feuch Institute / Replit Agent  

---

## 1. Problème

Benoît gère manuellement la présence éditoriale de 7 univers narratifs distincts (Blacklace, Creature-Sync, Kif & Molla, TERRA, Pro.Hibited, Clochette, Blacklace Dice) sur plusieurs plateformes (Instagram, Facebook, TikTok, KDP, site web).

Cette charge représente environ 10h/semaine de travail répétitif (rédaction, planification, approbation, publication) qui empêche la création.

---

## 2. Solution

Un tableau de bord éditorial centralisé avec des agents IA spécialisés qui génèrent, planifient et gèrent les publications — libérant Benoît pour la création pure.

---

## 3. Personas

**Benoît** (seul utilisateur V1)
- Créateur de contenu / auteur / développeur
- Gère plusieurs univers narratifs simultanément
- Maîtrise technique avancée
- Besoin : déléguer sans perdre le contrôle éditorial

---

## 4. Fonctionnalités V1

### 4.1 Dashboard
- Vue synthétique du mois éditorial
- Stats : posts prévus, brouillons, campagnes actives, agents actifs
- Fil des 10 dernières publications
- Indicateurs de statut des connecteurs

### 4.2 Agents éditoriaux
- 6 agents prédéfinis avec personnalité, ton, missions, limites
- Toggle actif/inactif par agent
- Exemples de phrases caractéristiques
- Fiches de mission style "rapport d'agent"

### 4.3 Calendrier éditorial
- Vue 30 jours des publications planifiées
- Groupement par date
- Génération mock d'un mois de contenu (≈30 posts)
- Intégration Mistral pour génération réelle si clé présente

### 4.4 Publications
- CRUD complet sur les posts
- Filtres par statut / agent / plateforme
- Workflow de statuts : draft → approved → scheduled → published / failed
- Action "Approuver" directe

### 4.5 Campagnes
- Organisation des publications par campagne / univers
- Suivi début/fin, plateformes, agents assignés
- Statuts : planning → active → paused → completed → archived

### 4.6 Connecteurs
- Cartes de statut pour 6 intégrations
- Mode mock transparent si clés absentes
- Test de connexion en un clic
- Instructions de configuration inline

### 4.7 Paramètres
- Posts par semaine, niveau d'autonomie
- Langue principale, ton global
- Toggles Notion / Mistral

---

## 5. Ce qui N'est PAS dans V1

- Publication automatique réelle sur les réseaux sociaux
- Authentification multi-utilisateurs
- Scheduling automatique sans validation humaine
- Export de médias
- Analytics de performance des publications
- Synchronisation bidirectionnelle avec Notion

---

## 6. Métriques de succès

- L'application démarre sans clés API
- Le bouton "Générer un mois de contenu" crée ≥25 posts cohérents
- Chaque agent génère un style de texte reconnaissable
- Interface fonctionnelle sur desktop (1280px+) et mobile (390px+)
- Aucune dépendance à des services payants obligatoires

---

## 7. Contraintes techniques

- Zéro paiement requis
- Pas de secret API hardcodé
- Mode dégradé gracieux pour chaque connecteur
- Exportable en zip / pushable sur GitHub
- TypeScript strict sur tout le projet
