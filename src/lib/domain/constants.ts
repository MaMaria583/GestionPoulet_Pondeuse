/**
 * Constantes métier du module « poules pondeuses ».
 * Centralisées ici : ces valeurs apparaissent dans les calculs ET dans
 * les libellés affichés à l'utilisateur, elles ne doivent jamais diverger.
 */

/** Une alvéole standard contient 30 œufs. */
export const OEUFS_PAR_ALVEOLE = 30;

/**
 * En conditions normales, 1 poule pond 1 œuf par jour.
 * En dessous de 80 % de l'effectif réel, on alerte.
 */
export const SEUIL_ALERTE_PONTE = 0.8;

/**
 * L'alerte « pas de récolte » ne s'active qu'une semaine après le début
 * effectif de la ponte : la montée en production n'est pas immédiate et
 * alerter trop tôt produirait du bruit que l'utilisateur apprendrait à ignorer.
 */
export const DELAI_ALERTE_RECOLTE_JOURS = 7;

/**
 * Durée de la montée en ponte, pendant laquelle la règle des 80 % ne s'applique pas.
 *
 * Une bande qui démarre pond autour de 25 % et atteint son pic en 3 à 4 semaines.
 * Évaluer le seuil dès le premier jour déclencherait une alerte quotidienne
 * pendant tout ce temps — l'utilisatrice apprendrait à les ignorer et
 * manquerait les vraies chutes. Une alerte permanente n'alerte plus.
 *
 * 28 jours correspond au plateau d'une ISA Brown. À ajuster selon la souche.
 */
export const DELAI_PIC_PONTE_JOURS = 28;
