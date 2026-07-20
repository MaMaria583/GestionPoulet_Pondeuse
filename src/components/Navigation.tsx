import Link from 'next/link';
import { deconnecter } from '@/lib/actions/saisie';
import { LIBELLES_ROLE, type role_utilisateur } from '@/lib/auth/roles';

export function Navigation({
  nom,
  role,
}: {
  nom: string;
  role: role_utilisateur;
}) {
  return (
    <header className="border-b border-bordure bg-surface">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <nav className="flex items-center gap-1 overflow-x-auto" aria-label="Navigation principale">
          {[
            ['/', 'Tableau de bord'],
            ['/saisie', 'Saisie'],
            ['/historique', 'Historique'],
            ['/bandes', 'Bandes'],
          ].map(([href, libelle]) => (
            <Link
              key={href}
              href={href}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-texte-doux transition hover:bg-surface-2 hover:text-texte"
            >
              {libelle}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/utilisateurs" className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight hover:underline">{nom}</p>
            <p className="text-xs text-texte-doux">{LIBELLES_ROLE[role]}</p>
          </Link>
          <form action={deconnecter}>
            <button
              type="submit"
              className="rounded-lg border border-bordure px-3 py-1.5 text-xs font-medium text-texte-doux transition hover:bg-surface-2 hover:text-texte"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
