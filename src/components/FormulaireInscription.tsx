'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { inscrire } from '@/lib/actions/inscription';
import type { Retour as TypeRetour } from '@/lib/actions/saisie';
import { Champ, Retour, Texte } from './saisie/champs';

export function FormulaireInscription() {
  const [etat, action, enCours] = useActionState<TypeRetour | null, FormData>(inscrire, null);
  const router = useRouter();

  useEffect(() => {
    // La session est posée par l'action ; on rafraîchit pour que le proxy
    // et les pages voient le nouveau cookie.
    if (etat?.ok) {
      router.replace('/bandes');
      router.refresh();
    }
  }, [etat, router]);

  return (
    <form action={action} className="rounded-xl border border-bordure bg-surface p-6">
      <div className="space-y-4">
        {etat && !etat.ok && <Retour etat={etat} />}

        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-texte-doux">
            Votre exploitation
          </legend>
          <Champ label="Nom de l’exploitation">
            <Texte type="text" name="nomFerme" required maxLength={200} placeholder="Ferme Avicole de Kati" />
          </Champ>
          <Champ label="Localisation (facultatif)">
            <Texte type="text" name="localisation" maxLength={200} placeholder="Kati, Koulikoro" />
          </Champ>
        </fieldset>

        <fieldset className="space-y-4 border-t border-bordure pt-4">
          <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-texte-doux">
            Votre compte
          </legend>
          <Champ label="Nom complet">
            <Texte type="text" name="nomComplet" required maxLength={200} autoComplete="name" />
          </Champ>
          <Champ label="Adresse e-mail">
            <Texte type="email" name="email" required maxLength={200} autoComplete="username" />
          </Champ>
          <Champ label="Mot de passe" aide="10 caractères minimum.">
            <Texte
              type="password"
              name="motDePasse"
              required
              minLength={10}
              autoComplete="new-password"
            />
          </Champ>
          <Champ label="Confirmer le mot de passe">
            <Texte type="password" name="confirmation" required autoComplete="new-password" />
          </Champ>
        </fieldset>

        <button
          type="submit"
          disabled={enCours || etat?.ok}
          className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[#14161e] transition hover:opacity-90 disabled:opacity-50"
        >
          {enCours ? 'Création…' : etat?.ok ? 'Redirection…' : 'Créer mon exploitation'}
        </button>

        <p className="text-center text-sm text-texte-doux">
          Déjà un compte ?{' '}
          <Link href="/connexion" className="font-medium text-accent-encre hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </form>
  );
}
