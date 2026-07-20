'use client';

import { useActionState, useState } from 'react';
import { supprimerLigne, type Retour as TypeRetour } from '@/lib/actions/suppressions';
import type { LigneHistorique } from '@/lib/queries/historique';

/**
 * Suppression en deux temps.
 *
 * Une suppression de saisie modifie le stock, l'effectif ou la comptabilité,
 * et rien ne permet de l'annuler depuis l'interface. La confirmation en ligne
 * évite le clic réflexe, sans imposer une boîte de dialogue modale.
 */
export function BoutonSuppression({ ligne }: { ligne: LigneHistorique }) {
  const [etat, action, enCours] = useActionState<TypeRetour | null, FormData>(
    supprimerLigne,
    null,
  );
  const [confirme, setConfirme] = useState(false);

  if (etat && !etat.ok) {
    return (
      <div className="text-right">
        <p className="text-xs text-alerte">{etat.erreur}</p>
        <button
          type="button"
          onClick={() => setConfirme(false)}
          className="mt-1 text-xs text-texte-doux underline"
        >
          Fermer
        </button>
      </div>
    );
  }

  if (!confirme) {
    return (
      <button
        type="button"
        onClick={() => setConfirme(true)}
        className="shrink-0 rounded-lg border border-bordure px-2.5 py-1 text-xs font-medium text-texte-doux transition hover:border-alerte hover:text-alerte"
        aria-label={`Supprimer : ${ligne.categorie} du ${ligne.date}`}
      >
        Supprimer
      </button>
    );
  }

  return (
    <form action={action} className="flex shrink-0 items-center gap-1.5">
      <input type="hidden" name="table" value={ligne.table} />
      <input type="hidden" name="ligneId" value={ligne.id} />
      <button
        type="submit"
        disabled={enCours}
        className="rounded-lg bg-alerte px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {enCours ? '…' : 'Confirmer'}
      </button>
      <button
        type="button"
        onClick={() => setConfirme(false)}
        className="rounded-lg border border-bordure px-2.5 py-1 text-xs text-texte-doux"
      >
        Annuler
      </button>
    </form>
  );
}
