import type { ReactNode } from 'react';

export function Carte({
  titre,
  action,
  children,
  className = '',
}: {
  titre?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-bordure bg-surface p-5 ${className}`}>
      {titre && (
        <header className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight">{titre}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Etiquette({
  ton = 'neutre',
  children,
}: {
  ton?: 'neutre' | 'succes' | 'alerte' | 'avertissement' | 'info' | 'accent';
  children: ReactNode;
}) {
  const tons = {
    neutre: 'bg-surface-2 text-texte-doux',
    succes: 'bg-succes-doux text-succes',
    alerte: 'bg-alerte-doux text-alerte',
    avertissement: 'bg-avertissement-doux text-avertissement',
    info: 'bg-info-doux text-info',
    accent: 'bg-accent-doux text-accent',
  } as const;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tons[ton]}`}>
      {children}
    </span>
  );
}

/**
 * Ligne d'un tableau de répartition, avec barre de proportion.
 * La barre rend les écarts lisibles d'un coup d'œil, là où une colonne de
 * nombres oblige à comparer mentalement.
 */
export function LigneRepartition({
  libelle,
  valeur,
  proportion,
  ton = 'accent',
}: {
  libelle: string;
  valeur: string;
  proportion: number;
  ton?: 'accent' | 'alerte' | 'succes';
}) {
  const couleurs = { accent: 'bg-accent', alerte: 'bg-alerte', succes: 'bg-succes' } as const;
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-texte-doux">{libelle}</span>
        <span className="chiffres font-medium">{valeur}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${couleurs[ton]}`}
          style={{ width: `${Math.max(proportion * 100, 1.5)}%` }}
        />
      </div>
    </div>
  );
}
