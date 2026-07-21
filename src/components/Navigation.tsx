import Link from 'next/link';
import { deconnecter } from '@/lib/actions/saisie';
import { LIBELLES_ROLE, peutGererUtilisateurs, type role_utilisateur } from '@/lib/auth/roles';
import { LiensRail, type Lien } from './LiensRail';

/**
 * Barre latérale de navigation.
 *
 * Elle est en `position: fixed` et ne pousse pas le contenu : le décalage du
 * `main` se fait en CSS via l'attribut `data-rail` (voir globals.css). Ce choix
 * évite d'ajouter une classe de décalage dans chacune des cinq pages.
 *
 * Sous 1024 px le rail cède la place à un bandeau horizontal : 16 rem fixes
 * mangeraient la moitié d'un écran de téléphone, alors que la saisie
 * quotidienne se fait justement au poulailler, sur mobile.
 */

const ico = 'h-[18px] w-[18px]';

const IconeTableau = (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

const IconeSaisie = (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 20h9" strokeLinecap="round" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
  </svg>
);

const IconeHistorique = (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconeBandes = (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="m12 3 9 5-9 5-9-5 9-5Z" strokeLinejoin="round" />
    <path d="m3 13 9 5 9-5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconeUtilisateurs = (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" strokeLinecap="round" />
    <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 14.4a5.5 5.5 0 0 1 3 5.6" strokeLinecap="round" />
  </svg>
);

const PRINCIPAUX: Lien[] = [
  { href: '/', libelle: 'Tableau de bord', icone: IconeTableau },
  { href: '/saisie', libelle: 'Saisie du jour', icone: IconeSaisie },
  { href: '/historique', libelle: 'Historique', icone: IconeHistorique },
  { href: '/bandes', libelle: 'Mes bandes', icone: IconeBandes },
];

const GESTION: Lien[] = [
  { href: '/utilisateurs', libelle: 'Utilisateurs', icone: IconeUtilisateurs },
];

function Marque() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-lg"
        aria-hidden="true"
      >
        🐔
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-rail-encre-fort">
          Poulet Pondeuse
        </span>
        <span className="block truncate text-xs text-rail-encre">Suivi des bandes</span>
      </span>
    </Link>
  );
}

function Titre({ children }: { children: string }) {
  return (
    <p className="px-3 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-rail-encre">
      {children}
    </p>
  );
}

function BoutonDeconnexion({ compact = false }: { compact?: boolean }) {
  return (
    <form action={deconnecter}>
      <button
        type="submit"
        className={`flex items-center gap-3 rounded-xl text-sm font-medium text-rail-encre transition hover:bg-rail-2 hover:text-rail-encre-fort ${
          compact ? 'px-3 py-2' : 'w-full px-3 py-2.5'
        }`}
      >
        <svg
          className={ico}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
          <path d="m16 17 5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Déconnexion
      </button>
    </form>
  );
}

export function Navigation({ nom, role }: { nom: string; role: role_utilisateur }) {
  // Le lien n'est affiché qu'aux rôles qui peuvent réellement ouvrir la page :
  // le proposer à tous conduirait l'utilisateur droit à un refus.
  const gestion = peutGererUtilisateurs(role) ? GESTION : [];

  return (
    <>
      {/* ---------- Rail fixe, à partir de 1024 px ---------- */}
      <aside
        data-rail
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-rail-bordure bg-rail px-3 py-5 lg:flex"
      >
        <div className="px-2">
          <Marque />
        </div>

        <div className="mt-6 flex-1 overflow-y-auto">
          <Titre>Principal</Titre>
          <LiensRail liens={PRINCIPAUX} />

          {gestion.length > 0 && (
            <>
              <Titre>Gestion</Titre>
              <LiensRail liens={gestion} />
            </>
          )}
        </div>

        <div className="mt-4 border-t border-rail-bordure pt-4">
          <Link
            href="/utilisateurs"
            className="mb-1 flex items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-rail-2"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rail-2 text-sm font-semibold text-rail-encre-fort"
              aria-hidden="true"
            >
              {nom.trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-rail-encre-fort">{nom}</span>
              <span className="block truncate text-xs text-rail-encre">{LIBELLES_ROLE[role]}</span>
            </span>
          </Link>
          <BoutonDeconnexion />
        </div>
      </aside>

      {/* ---------- Bandeau horizontal, sous 1024 px ---------- */}
      <header className="sticky top-0 z-30 border-b border-rail-bordure bg-rail lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Marque />
          <BoutonDeconnexion compact />
        </div>
        <div className="px-2 pb-2">
          <LiensRail liens={[...PRINCIPAUX, ...gestion]} orientation="horizontale" />
        </div>
      </header>
    </>
  );
}
