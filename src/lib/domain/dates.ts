import type { DateISO } from './types';

const FORMAT_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Vrai si la chaîne est une date calendaire valide au format `YYYY-MM-DD`. */
export function estDateISO(valeur: string): valeur is DateISO {
  if (!FORMAT_ISO.test(valeur)) return false;
  const [a, m, j] = valeur.split('-').map(Number);
  if (m < 1 || m > 12 || j < 1) return false;
  // Le jour 0 du mois suivant = dernier jour du mois courant.
  // Date.UTC évite toute interprétation en heure locale.
  return j <= new Date(Date.UTC(a, m, 0)).getUTCDate();
}

function assertDateISO(valeur: string, nomParam: string): void {
  if (!estDateISO(valeur)) {
    throw new TypeError(`${nomParam} : date invalide « ${valeur} » (format attendu : YYYY-MM-DD)`);
  }
}

/** Ajoute `jours` (éventuellement négatif) à une date calendaire. */
export function ajouterJours(date: DateISO, jours: number): DateISO {
  assertDateISO(date, 'date');
  if (!Number.isInteger(jours)) {
    throw new TypeError(`jours doit être un entier, reçu ${jours}`);
  }
  const [a, m, j] = date.split('-').map(Number);
  // Tout le calcul reste en UTC : aucun décalage de fuseau possible.
  const d = new Date(Date.UTC(a, m - 1, j + jours));
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours calendaires de `debut` à `fin` (négatif si `fin` précède). */
export function differenceJours(debut: DateISO, fin: DateISO): number {
  assertDateISO(debut, 'debut');
  assertDateISO(fin, 'fin');
  const ms = Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** Liste inclusive des jours de `debut` à `fin`. Vide si `fin` précède `debut`. */
export function intervalleJours(debut: DateISO, fin: DateISO): DateISO[] {
  const total = differenceJours(debut, fin);
  if (total < 0) return [];
  return Array.from({ length: total + 1 }, (_, i) => ajouterJours(debut, i));
}
