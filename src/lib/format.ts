import type { DateISO } from './domain/types';

/**
 * Formatage pour l'affichage. Locale fr-ML, devise XOF (FCFA).
 * Le franc CFA n'a pas de sous-unité : aucune décimale n'est affichée.
 */

const nombreFr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export const formaterNombre = (n: number) => nombreFr.format(n);

export function formaterFCFA(montant: number): string {
  return `${nombreFr.format(Math.round(montant))} F`;
}

/** Version compacte pour les grands montants : 1 250 000 F → 1,25 M F */
export function formaterFCFACompact(montant: number): string {
  const abs = Math.abs(montant);
  if (abs >= 1_000_000) {
    return `${(montant / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M F`;
  }
  if (abs >= 10_000) {
    return `${(montant / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} k F`;
  }
  return formaterFCFA(montant);
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                     'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** 2026-07-20 → « 20 juil. 2026 » */
export function formaterDate(jour: DateISO): string {
  const [a, m, j] = jour.split('-');
  return `${Number(j)} ${MOIS_COURTS[Number(m) - 1]} ${a}`;
}

/** 2026-07-20 → « 20 juil. » */
export function formaterDateCourte(jour: DateISO): string {
  const [, m, j] = jour.split('-');
  return `${Number(j)} ${MOIS_COURTS[Number(m) - 1]}`;
}

/** 187 → « 6 mois » ; 45 → « 45 jours » */
export function formaterAge(jours: number): string {
  if (jours < 60) return `${jours} jour${jours > 1 ? 's' : ''}`;
  const semaines = Math.floor(jours / 7);
  if (jours < 120) return `${semaines} semaines`;
  const mois = Math.floor(jours / 30.44);
  return `${mois} mois`;
}
