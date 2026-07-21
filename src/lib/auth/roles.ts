/**
 * Rôles et permissions. Miroir de l'ENUM `role_utilisateur` en base.
 *
 * Le contrôle se fait par capacité (« peut saisir »), pas par comparaison de
 * rôle disséminée dans le code (`role === 'proprietaire' || role === '…'`).
 * Ajouter un rôle ne demande alors de toucher qu'à ce fichier.
 */

export type role_utilisateur = 'proprietaire' | 'gestionnaire' | 'saisie' | 'lecture';

export const LIBELLES_ROLE: Record<role_utilisateur, string> = {
  proprietaire: 'Propriétaire',
  gestionnaire: 'Gestionnaire',
  saisie: 'Saisie',
  lecture: 'Lecture seule',
};

/** Du plus privilégié au moins privilégié. */
const NIVEAU: Record<role_utilisateur, number> = {
  proprietaire: 4,
  gestionnaire: 3,
  saisie: 2,
  lecture: 1,
};

/**
 * Accès aux montants : recettes, dépenses, résultat.
 *
 * Volontairement écrit en liste EXPLICITE et non avec `NIVEAU`, car la règle
 * ne suit pas la hiérarchie des droits : « lecture seule » voit les finances
 * (c'est un rôle de consultation, pour un comptable ou le conjoint), alors que
 * « saisie », pourtant plus privilégié en écriture, ne les voit pas — c'est un
 * employé qui enregistre les récoltes, la trésorerie ne le regarde pas.
 * Exprimer cela avec un seuil numérique donnerait une règle fausse.
 */
const VOIT_FINANCES: role_utilisateur[] = ['proprietaire', 'gestionnaire', 'lecture'];
export const peutVoirFinances = (r: role_utilisateur) => VOIT_FINANCES.includes(r);

/** Page d'arrivée après connexion, selon ce que la personne vient faire. */
export const accueilDuRole = (r: role_utilisateur) => (r === 'saisie' ? '/saisie' : '/');

export const peutLire = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.lecture;
export const peutSaisir = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.saisie;
export const peutSupprimer = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.gestionnaire;
export const peutGererBandes = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.gestionnaire;
export const peutGererUtilisateurs = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.proprietaire;
