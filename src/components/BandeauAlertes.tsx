import type { PointProduction } from '@/lib/queries/bande';
import { formaterDate, formaterNombre } from '@/lib/format';
import { SEUIL_ALERTE_PONTE } from '@/lib/domain/constants';

/**
 * Centre d'alertes.
 *
 * Les alertes sont dérivées de l'état : rien n'est stocké, rien n'est à
 * « marquer comme lu ». Saisir la récolte manquante fait disparaître la ligne.
 * C'est aussi pourquoi on affiche la date concernée plutôt qu'un horodatage
 * de déclenchement : c'est le jour à corriger qui intéresse l'utilisatrice.
 */
export function BandeauAlertes({ points }: { points: PointProduction[] }) {
  const absences = points.filter((p) => p.alerteAbsence);
  const baisses = points.filter((p) => p.alerteBaisse);

  if (absences.length === 0 && baisses.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-bordure bg-succes-doux px-4 py-3">
        <span aria-hidden className="text-succes">✓</span>
        <p className="text-sm text-succes">
          Aucune alerte. Les récoltes sont à jour et la production est au niveau attendu.
        </p>
      </div>
    );
  }

  const recentes = [...absences, ...baisses]
    .sort((a, b) => (a.jour < b.jour ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="overflow-hidden rounded-xl border border-bordure bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-bordure bg-alerte-doux px-4 py-2.5">
        <h2 className="text-sm font-semibold text-alerte">
          {absences.length + baisses.length} alerte
          {absences.length + baisses.length > 1 ? 's' : ''} à traiter
        </h2>
        <span className="text-xs text-alerte">
          {absences.length > 0 && `${absences.length} récolte(s) manquante(s)`}
          {absences.length > 0 && baisses.length > 0 && ' · '}
          {baisses.length > 0 && `${baisses.length} jour(s) sous le seuil`}
        </span>
      </header>

      <ul className="divide-y divide-bordure">
        {recentes.map((p) => (
          <li key={p.jour} className="flex items-start gap-3 px-4 py-3">
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                p.alerteAbsence ? 'bg-alerte' : 'bg-avertissement'
              }`}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {p.alerteAbsence ? (
                  <>
                    <span className="font-medium">Aucune récolte enregistrée</span>{' '}
                    le {formaterDate(p.jour)}.
                  </>
                ) : (
                  <>
                    <span className="font-medium">Production sous le seuil</span> le{' '}
                    {formaterDate(p.jour)} : {formaterNombre(p.oeufs)} œufs pour{' '}
                    {formaterNombre(p.effectif)} poules.
                  </>
                )}
              </p>
              <p className="chiffres mt-0.5 text-xs text-texte-doux">
                {p.alerteAbsence
                  ? 'Saisissez la récolte de ce jour pour lever l’alerte.'
                  : `${p.tauxPonte?.toFixed(1)} % — seuil ${SEUIL_ALERTE_PONTE * 100} %`}
              </p>
            </div>
          </li>
        ))}
      </ul>

      {absences.length + baisses.length > recentes.length && (
        <footer className="border-t border-bordure px-4 py-2 text-xs text-texte-doux">
          et {absences.length + baisses.length - recentes.length} autre(s) plus ancienne(s)
        </footer>
      )}
    </div>
  );
}
