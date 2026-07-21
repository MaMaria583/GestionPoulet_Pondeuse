import type { ReactNode } from 'react';
import type { DetailBande, PointProduction } from '@/lib/queries/bande';
import { formaterFCFACompact, formaterNombre } from '@/lib/format';
import { oeufsEnAlveoles } from '@/lib/domain/oeufs';
import { Etiquette } from './ui';

/**
 * Cartes de synthèse.
 *
 * Chaque carte porte une teinte, mais JAMAIS seule : elle vient toujours avec
 * une icône et un libellé écrit. Le couple vert/rouge « bénéfice / perte » est
 * précisément le cas que la vision deutéranope ne distingue pas — l'étiquette
 * en toutes lettres est ce qui rend la carte lisible malgré tout.
 */

type Ton = 'neutre' | 'succes' | 'alerte' | 'info' | 'accent';

const TEINTES: Record<Ton, { fond: string; encre: string; puce: string }> = {
  neutre: { fond: 'bg-surface', encre: 'text-texte', puce: 'bg-surface-2 text-texte-doux' },
  succes: { fond: 'bg-succes-doux', encre: 'text-succes', puce: 'bg-surface text-succes' },
  alerte: { fond: 'bg-alerte-doux', encre: 'text-alerte', puce: 'bg-surface text-alerte' },
  info: { fond: 'bg-info-doux', encre: 'text-info', puce: 'bg-surface text-info' },
  accent: {
    fond: 'bg-accent-doux',
    encre: 'text-accent-encre',
    puce: 'bg-surface text-accent-encre',
  },
};

const ico = 'h-[18px] w-[18px]';

const IconeEffectif = (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path
      d="M12 4a4 4 0 0 1 4 4v3l2 4h-4a2 2 0 1 1-4 0H6l2-4V8a4 4 0 0 1 4-4Z"
      strokeLinejoin="round"
    />
  </svg>
);

const IconeOeuf = (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 3c3 0 6 5 6 9a6 6 0 0 1-12 0c0-4 3-9 6-9Z" strokeLinejoin="round" />
  </svg>
);

const IconePonte = (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 17l5-5 4 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14 8h5v5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconeResultat = (
  <svg className={ico} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path
      d="M12 2v20M17 6.5C17 4.6 14.8 3.5 12 3.5S7 4.6 7 6.5s2.2 2.8 5 3.3 5 1.4 5 3.3-2.2 3-5 3-5-1.1-5-3"
      strokeLinecap="round"
    />
  </svg>
);

function CarteKPI({
  libelle,
  valeur,
  unite,
  detail,
  badge,
  icone,
  ton = 'neutre',
}: {
  libelle: string;
  valeur: string;
  unite?: string;
  detail?: ReactNode;
  badge?: ReactNode;
  icone: ReactNode;
  ton?: Ton;
}) {
  const t = TEINTES[ton];
  return (
    <div className={`rounded-2xl border border-bordure p-4 sm:p-5 ${t.fond}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.puce}`}>
          {icone}
        </span>
        {badge}
      </div>

      <div className="chiffres flex items-baseline gap-1.5">
        <span className={`text-2xl font-bold tracking-tight sm:text-[1.75rem] ${t.encre}`}>
          {valeur}
        </span>
        {unite && <span className="text-sm font-medium text-texte-doux">{unite}</span>}
      </div>

      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-texte-doux">
        {libelle}
      </p>
      {detail && <p className="mt-1.5 text-xs text-texte-doux">{detail}</p>}
    </div>
  );
}

export function CartesKPI({
  bande,
  dernierJour,
}: {
  bande: DetailBande;
  dernierJour: PointProduction | null;
}) {
  const { alveoles, oeufsRestants } = oeufsEnAlveoles(bande.stock.actuel);
  const resultatPositif = bande.finances.resultat >= 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <CarteKPI
        ton="neutre"
        icone={IconeEffectif}
        libelle="Effectif actuel"
        valeur={formaterNombre(bande.effectif.actuel)}
        unite="poules"
        detail={`sur ${formaterNombre(bande.effectifInitial)} introduites`}
        badge={
          <Etiquette ton={bande.effectif.tauxMortalite > 5 ? 'alerte' : 'neutre'}>
            {bande.effectif.tauxMortalite.toFixed(1)} % mort.
          </Etiquette>
        }
      />

      <CarteKPI
        ton="accent"
        icone={IconeOeuf}
        libelle="Stock d’œufs"
        valeur={formaterNombre(bande.stock.actuel)}
        unite="œufs"
        detail={
          alveoles > 0
            ? `${alveoles} alvéole${alveoles > 1 ? 's' : ''}${oeufsRestants ? ` + ${oeufsRestants}` : ''}`
            : 'moins d’une alvéole'
        }
      />

      <CarteKPI
        ton="info"
        icone={IconePonte}
        libelle="Taux de ponte"
        valeur={dernierJour?.tauxPonte != null ? dernierJour.tauxPonte.toFixed(1) : '—'}
        unite="%"
        detail={
          dernierJour
            ? `${formaterNombre(dernierJour.oeufs)} œufs le dernier jour`
            : 'ponte non commencée'
        }
        badge={
          dernierJour?.enMonteePonte ? (
            <Etiquette ton="info">montée</Etiquette>
          ) : dernierJour?.alerteBaisse ? (
            <Etiquette ton="avertissement">bas</Etiquette>
          ) : undefined
        }
      />

      <CarteKPI
        ton={resultatPositif ? 'succes' : 'alerte'}
        icone={IconeResultat}
        libelle="Résultat"
        valeur={formaterFCFACompact(bande.finances.resultat)}
        detail={
          `${formaterFCFACompact(bande.finances.totalRecettes)} recettes − ` +
          `${formaterFCFACompact(bande.finances.totalDepenses)} dépenses`
        }
        badge={
          <Etiquette ton={resultatPositif ? 'succes' : 'alerte'}>
            {resultatPositif ? 'bénéfice' : 'perte'}
          </Etiquette>
        }
      />
    </div>
  );
}
