'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export interface Lien {
  href: string;
  libelle: string;
  icone: ReactNode;
}

/**
 * Liste de liens avec état actif.
 *
 * Seul morceau client de la barre latérale : `usePathname` impose le rendu
 * navigateur. Le reste du rail — marque, bloc utilisateur, déconnexion —
 * demeure serveur, pour ne pas envoyer au client la session ni l'action de
 * déconnexion.
 */
export function LiensRail({
  liens,
  orientation = 'verticale',
}: {
  liens: Lien[];
  orientation?: 'verticale' | 'horizontale';
}) {
  const chemin = usePathname();

  // `/` correspondrait à toutes les pages en préfixe : on l'exige exact.
  const estActif = (href: string) =>
    href === '/' ? chemin === '/' : chemin.startsWith(href);

  if (orientation === 'horizontale') {
    return (
      <nav className="flex gap-1 overflow-x-auto" aria-label="Navigation principale">
        {liens.map((l) => {
          const actif = estActif(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={actif ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                actif
                  ? 'bg-accent text-[#14161e]'
                  : 'text-rail-encre hover:bg-rail-2 hover:text-rail-encre-fort'
              }`}
            >
              <span className="shrink-0">{l.icone}</span>
              {l.libelle}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-1" aria-label="Navigation principale">
      {liens.map((l) => {
        const actif = estActif(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={actif ? 'page' : undefined}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              actif
                ? 'bg-accent text-[#14161e] shadow-sm'
                : 'text-rail-encre hover:bg-rail-2 hover:text-rail-encre-fort'
            }`}
          >
            <span className="shrink-0">{l.icone}</span>
            <span className="truncate">{l.libelle}</span>
          </Link>
        );
      })}
    </nav>
  );
}
