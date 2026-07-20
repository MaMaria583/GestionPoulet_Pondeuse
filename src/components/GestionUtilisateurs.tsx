'use client';

import { useActionState, useState } from 'react';
import {
  basculerActivation,
  changerMonMotDePasse,
  changerRole,
  creerUtilisateur,
  type Retour as TypeRetour,
} from '@/lib/actions/utilisateurs';
import { Champ, Retour, Selection, Texte } from './saisie/champs';
import { Etiquette } from './ui';
import { LIBELLES_ROLE, type role_utilisateur } from '@/lib/auth/roles';
import type { Utilisateur } from '@/lib/queries/historique';

const ROLES: [string, string][] = [
  ['lecture', LIBELLES_ROLE.lecture],
  ['saisie', LIBELLES_ROLE.saisie],
  ['gestionnaire', LIBELLES_ROLE.gestionnaire],
  ['proprietaire', LIBELLES_ROLE.proprietaire],
];

const ptit = 'rounded-lg px-2.5 py-1 text-xs font-medium transition disabled:opacity-50';

export function CreationUtilisateur() {
  const [etat, action, enCours] = useActionState<TypeRetour | null, FormData>(
    creerUtilisateur,
    null,
  );
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <button
        onClick={() => setOuvert(true)}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
      >
        Nouveau compte
      </button>
    );
  }

  return (
    <form action={action} className="w-full rounded-xl border border-bordure bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold">Nouveau compte</h2>
      <div className="space-y-4">
        <Retour etat={etat} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Nom complet">
            <Texte type="text" name="nomComplet" required maxLength={200} />
          </Champ>
          <Champ label="Adresse e-mail">
            <Texte type="email" name="email" required maxLength={200} />
          </Champ>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Rôle">
            <Selection name="role" defaultValue="saisie" options={ROLES} />
          </Champ>
          <Champ
            label="Mot de passe initial"
            aide="10 caractères minimum. À communiquer hors de l’application."
          >
            <Texte type="text" name="motDePasse" required minLength={10} autoComplete="off" />
          </Champ>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={enCours}
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {enCours ? 'Création…' : 'Créer le compte'}
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

export function LigneUtilisateur({
  utilisateur,
  estMoi,
}: {
  utilisateur: Utilisateur;
  estMoi: boolean;
}) {
  const [etatRole, actionRole, roleEnCours] = useActionState<TypeRetour | null, FormData>(
    changerRole,
    null,
  );
  const [etatActif, actionActif, actifEnCours] = useActionState<TypeRetour | null, FormData>(
    basculerActivation,
    null,
  );
  const etat = etatRole ?? etatActif;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            {utilisateur.nomComplet}
            {estMoi && <Etiquette ton="accent">vous</Etiquette>}
            {!utilisateur.actif && <Etiquette ton="alerte">désactivé</Etiquette>}
          </p>
          <p className="truncate text-xs text-texte-doux">{utilisateur.email}</p>
        </div>

        <div className="flex items-center gap-2">
          <form action={actionRole} className="flex items-center gap-1.5">
            <input type="hidden" name="userId" value={utilisateur.id} />
            <select
              name="role"
              defaultValue={utilisateur.role}
              disabled={estMoi}
              className="rounded-lg border border-bordure bg-fond px-2 py-1 text-xs disabled:opacity-50"
              aria-label={`Rôle de ${utilisateur.nomComplet}`}
            >
              {ROLES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={estMoi || roleEnCours}
              className={`${ptit} border border-bordure text-texte-doux hover:text-texte`}
            >
              Appliquer
            </button>
          </form>

          <form action={actionActif}>
            <input type="hidden" name="userId" value={utilisateur.id} />
            <button
              type="submit"
              disabled={estMoi || actifEnCours}
              className={`${ptit} border border-bordure ${
                utilisateur.actif ? 'text-texte-doux hover:text-alerte' : 'text-succes'
              }`}
            >
              {utilisateur.actif ? 'Désactiver' : 'Réactiver'}
            </button>
          </form>
        </div>
      </div>

      {etat && (
        <div className="mt-2">
          <Retour etat={etat} />
        </div>
      )}
    </li>
  );
}

export function ChangementMotDePasse() {
  const [etat, action, enCours] = useActionState<TypeRetour | null, FormData>(
    changerMonMotDePasse,
    null,
  );

  return (
    <form action={action} className="rounded-xl border border-bordure bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold">Changer mon mot de passe</h2>
      <div className="space-y-4">
        <Retour etat={etat} />

        <Champ label="Mot de passe actuel">
          <Texte type="password" name="ancien" required autoComplete="current-password" />
        </Champ>

        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Nouveau mot de passe" aide="10 caractères minimum.">
            <Texte type="password" name="nouveau" required minLength={10} autoComplete="new-password" />
          </Champ>
          <Champ label="Confirmation">
            <Texte type="password" name="confirmation" required autoComplete="new-password" />
          </Champ>
        </div>

        <button
          type="submit"
          disabled={enCours}
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {enCours ? 'Modification…' : 'Modifier'}
        </button>
      </div>
    </form>
  );
}

export type { role_utilisateur };
