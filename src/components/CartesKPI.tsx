import type { ReactNode } from 'react';
import type { DetailBande, PointProduction } from '@/lib/queries/bande';
import { formaterFCFACompact, formaterNombre } from '@/lib/format';
import { oeufsEnAlveoles } from '@/lib/domain/oeufs';
import { Etiquette } from './ui';

function CarteKPI({
  libelle,
  valeur,
  unite,
  detail,
  badge,
}: {
  libelle: string;
  valeur: string;
  unite?: string;
  detail?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-bordure bg-surface p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-texte-doux">
          {libelle}
        </span>
        {badge}
      </div>
      <div className="chiffres flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight">{valeur}</span>
        {unite && <span className="text-sm text-texte-doux">{unite}</span>}
      </div>
      {detail && <div className="mt-1.5 text-xs text-texte-doux">{detail}</div>}
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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <CarteKPI
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
