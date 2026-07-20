import {
  echec,
  succes,
  type DateISO,
  type Recolte,
  type Resultat,
  type SortieOeuf,
} from './types';
import { formaterQuantite } from './oeufs';

/**
 * Stock d'œufs d'une bande.
 *
 *   Stock actuel = Total récolté − Œufs cassés à la récolte − Total sorti
 *
 * Les œufs cassés au ramassage n'entrent jamais en stock : les compter
 * puis les ressortir ferait apparaître une vente fantôme dans les analyses.
 */

export interface DetailStock {
  totalRecolte: number;
  totalCasseRecolte: number;
  totalVendu: number;
  totalAutresSorties: number;
  totalSorti: number;
  stockActuel: number;
}

export function calculerStockOeufs(
  recoltes: readonly Recolte[],
  sorties: readonly SortieOeuf[],
  aLaDate?: DateISO,
): DetailStock {
  const recoltesRetenues = aLaDate
    ? recoltes.filter((r) => r.dateRecolte <= aLaDate)
    : recoltes;
  const sortiesRetenues = aLaDate
    ? sorties.filter((s) => s.dateSortie <= aLaDate)
    : sorties;

  const totalRecolte = somme(recoltesRetenues.map((r) => r.nombreOeufs));
  const totalCasseRecolte = somme(recoltesRetenues.map((r) => r.oeufsCasses));

  const totalVendu = somme(
    sortiesRetenues.filter((s) => s.type === 'vente').map((s) => s.nombreOeufs),
  );
  const totalAutresSorties = somme(
    sortiesRetenues.filter((s) => s.type !== 'vente').map((s) => s.nombreOeufs),
  );
  const totalSorti = totalVendu + totalAutresSorties;

  return {
    totalRecolte,
    totalCasseRecolte,
    totalVendu,
    totalAutresSorties,
    totalSorti,
    stockActuel: totalRecolte - totalCasseRecolte - totalSorti,
  };
}

/**
 * Contrôle bloquant avant toute sortie d'œufs (vente comprise).
 *
 * Règle du cahier des charges : interdiction stricte de valider une vente
 * dont la quantité dépasse le stock disponible.
 *
 * Cette fonction donne un retour immédiat dans l'interface ; le trigger
 * `check_stock_oeufs` en base reste le garde-fou qui ne peut pas être contourné
 * (import de données, script, appel concurrent).
 */
export function verifierSortieOeufs(
  stockActuel: number,
  quantiteDemandee: number,
): Resultat<number> {
  if (!Number.isInteger(quantiteDemandee) || quantiteDemandee <= 0) {
    return echec('La quantité doit être un entier supérieur à zéro.');
  }
  if (quantiteDemandee > stockActuel) {
    return echec(
      `Stock insuffisant : ${formaterQuantite(quantiteDemandee)} demandés, ` +
        `${formaterQuantite(Math.max(stockActuel, 0))} en stock.`,
    );
  }
  return succes(stockActuel - quantiteDemandee);
}

const somme = (valeurs: readonly number[]) => valeurs.reduce((a, b) => a + b, 0);
