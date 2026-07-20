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

export const peutLire = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.lecture;
export const peutSaisir = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.saisie;
export const peutSupprimer = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.gestionnaire;
export const peutGererBandes = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.gestionnaire;
export const peutGererUtilisateurs = (r: role_utilisateur) => NIVEAU[r] >= NIVEAU.proprietaire;
