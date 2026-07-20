'use client';

import { useActionState, useState } from 'react';
import {
  cloturerBande,
  creerBande,
  modifierBande,
  rouvrirBande,
  type Retour as TypeRetour,
} from '@/lib/actions/bandes';
import { Champ, Retour, Selection, Texte } from './saisie/champs';
import type { ResumeBande } from '@/lib/queries/bande';

const bouton =
  'rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-50';

export function FormulaireCreationBande({ aujourdhui }: { aujourdhui: string }) {
  const [etat, action, enCours] = useActionState<TypeRetour | null, FormData>(creerBande, null);
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
      >
        Nouvelle bande
      </button>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-bordure bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold">Nouvelle bande</h2>
      <div className="space-y-4">
        <Retour etat={etat} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Code" aide="Unique dans votre exploitation, ex. B-2026-02.">
            <Texte type="text" name="code" required maxLength={50} />
          </Champ>
          <Champ label="Nom (facultatif)">
            <Texte type="text" name="nom" maxLength={200} />
          </Champ>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Date d’introduction">
            <Texte type="date" name="dateIntroduction" defaultValue={aujourdhui} required />
          </Champ>
          <Champ label="Effectif initial">
            <Texte type="number" name="effectifInitial" min="1" step="1" required />
          </Champ>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ
            label="Début de ponte (facultatif)"
            aide="Renseignable plus tard, quand la ponte démarre."
          >
            <Texte type="date" name="dateDebutPonte" />
          </Champ>
          <Champ label="Souche (facultatif)">
            <Texte type="text" name="souche" maxLength={100} placeholder="ISA Brown" />
          </Champ>
        </div>

        <Champ label="Notes (facultatif)">
          <Texte type="text" name="notes" maxLength={1000} />
        </Champ>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={enCours}
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {enCours ? 'Création…' : 'Créer la bande'}
          </button>
          <button
            type="button"
            onClick={() => setOuvert(false)}
            className="rounded-lg border border-bordure px-4 py-2.5 text-sm font-medium text-texte-doux"
          >
            Annuler
          </button>
        </div>
      </div>
    </form>
  );
}

export function ActionsBande({
  bande,
  aujourdhui,
}: {
  bande: ResumeBande;
  aujourdhui: string;
}) {
  const [etatCloture, actionCloture, clotureEnCours] = useActionState<TypeRetour | null, FormData>(
    cloturerBande,
    null,
  );
  const [etatReouv, actionReouv, reouvEnCours] = useActionState<TypeRetour | null, FormData>(
    rouvrirBande,
    null,
  );
  const [etatModif, actionModif, modifEnCours] = useActionState<TypeRetour | null, FormData>(
    modifierBande,
    null,
  );
  const [modeEdition, setModeEdition] = useState(false);
  const [confirmeCloture, setConfirmeCloture] = useState(false);

  const etat = etatCloture ?? etatReouv ?? etatModif;

  if (modeEdition) {
    return (
      <form action={actionModif} className="mt-3 border-t border-bordure pt-3">
        <input type="hidden" name="bandeId" value={bande.id} />
        <div className="space-y-3">
          <Retour etat={etat} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Nom">
              <Texte type="text" name="nom" defaultValue={bande.nom ?? ''} maxLength={200} />
            </Champ>
            <Champ label="Souche">
              <Texte type="text" name="souche" defaultValue={bande.souche ?? ''} maxLength={100} />
            </Champ>
          </div>
          <Champ
            label="Début de ponte"
            aide="Détermine le point de départ des alertes et de la courbe."
          >
            <Texte type="date" name="dateDebutPonte" defaultValue={bande.dateDebutPonte ?? ''} />
          </Champ>
          <Champ label="Notes">
            <Texte type="text" name="notes" maxLength={1000} />
          </Champ>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={modifEnCours}
              className={`${bouton} bg-accent text-white`}
            >
              {modifEnCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button
              type="button"
              onClick={() => setModeEdition(false)}
              className={`${bouton} border border-bordure text-texte-doux`}
            >
              Annuler
            </button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 border-t border-bordure pt-3">
      {etat && (
        <div className="mb-3">
          <Retour etat={etat} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setModeEdition(true)}
          className={`${bouton} border border-bordure text-texte-doux hover:text-texte`}
        >
          Modifier
        </button>

        {bande.statut === 'active' ? (
          confirmeCloture ? (
            <form action={actionCloture} className="flex items-center gap-2">
              <input type="hidden" name="bandeId" value={bande.id} />
              <input
                type="date"
                name="dateCloture"
                defaultValue={aujourdhui}
                required
                className="rounded-lg border border-bordure bg-fond px-2 py-1 text-xs"
              />
              <button type="submit" disabled={clotureEnCours} className={`${bouton} bg-alerte text-white`}>
                {clotureEnCours ? 'Clôture…' : 'Confirmer'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmeCloture(false)}
                className={`${bouton} border border-bordure text-texte-doux`}
              >
                Annuler
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmeCloture(true)}
              className={`${bouton} border border-bordure text-texte-doux hover:text-alerte`}
            >
              Clôturer
            </button>
          )
        ) : (
          <form action={actionReouv}>
            <input type="hidden" name="bandeId" value={bande.id} />
            <button type="submit" disabled={reouvEnCours} className={`${bouton} border border-bordure text-texte-doux`}>
              {reouvEnCours ? 'Réouverture…' : 'Rouvrir'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export { Selection };
