'use client';

import { useActionState, useState } from 'react';
import {
  enregistrerDepense,
  enregistrerMouvement,
  enregistrerRecolte,
  enregistrerSortieOeufs,
  type Retour as TypeRetour,
} from '@/lib/actions/saisie';
import { BoutonEnvoyer, Champ, QuantiteOeufs, Retour, Selection, Texte } from './champs';

type Onglet = 'recolte' | 'sortie_oeufs' | 'mouvement' | 'depense';

const ONGLETS: [Onglet, string][] = [
  ['recolte', 'Récolte'],
  ['sortie_oeufs', 'Sortie d’œufs'],
  ['mouvement', 'Sortie de poules'],
  ['depense', 'Dépense'],
];

export function Formulaires({
  bandeId,
  aujourdhui,
  stockDisponible,
  effectifActuel,
}: {
  bandeId: string;
  aujourdhui: string;
  stockDisponible: number;
  effectifActuel: number;
}) {
  const [onglet, setOnglet] = useState<Onglet>('recolte');

  return (
    <div className="rounded-xl border border-bordure bg-surface">
      <nav
        className="flex overflow-x-auto border-b border-bordure"
        role="tablist"
        aria-label="Type de saisie"
      >
        {ONGLETS.map(([cle, libelle]) => (
          <button
            key={cle}
            role="tab"
            aria-selected={onglet === cle}
            onClick={() => setOnglet(cle)}
            className={`shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition ${
              onglet === cle
                ? 'border-accent text-accent'
                : 'border-transparent text-texte-doux hover:text-texte'
            }`}
          >
            {libelle}
          </button>
        ))}
      </nav>

      <div className="p-5">
        {onglet === 'recolte' && <FormRecolte bandeId={bandeId} aujourdhui={aujourdhui} />}
        {onglet === 'sortie_oeufs' && (
          <FormSortieOeufs bandeId={bandeId} aujourdhui={aujourdhui} stock={stockDisponible} />
        )}
        {onglet === 'mouvement' && (
          <FormMouvement bandeId={bandeId} aujourdhui={aujourdhui} effectif={effectifActuel} />
        )}
        {onglet === 'depense' && <FormDepense bandeId={bandeId} aujourdhui={aujourdhui} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FormRecolte({ bandeId, aujourdhui }: { bandeId: string; aujourdhui: string }) {
  const [etat, action, enCours] = useActionState<TypeRetour | null, FormData>(
    enregistrerRecolte,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="bandeId" value={bandeId} />
      <Retour etat={etat} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Date">
          <Texte type="date" name="dateRecolte" defaultValue={aujourdhui} max={aujourdhui} required />
        </Champ>
        <Champ label="Créneau" aide="Plusieurs ramassages par jour sont possibles.">
          <Selection
            name="creneau"
            defaultValue="matin"
            options={[['matin', 'Matin'], ['midi', 'Midi'], ['soir', 'Soir']]}
          />
        </Champ>
      </div>

      <QuantiteOeufs />

      <Champ label="Œufs cassés au ramassage" aide="Ils n’entrent jamais en stock.">
        <Texte type="number" name="oeufsCasses" min="0" step="1" defaultValue="0" />
      </Champ>

      <Champ label="Notes (facultatif)">
        <Texte type="text" name="notes" maxLength={500} />
      </Champ>

      <BoutonEnvoyer enCours={enCours}>Enregistrer la récolte</BoutonEnvoyer>
    </form>
  );
}

// ---------------------------------------------------------------------------

function FormSortieOeufs({
  bandeId,
  aujourdhui,
  stock,
}: {
  bandeId: string;
  aujourdhui: string;
  stock: number;
}) {
  const [etat, action, enCours] = useActionState<TypeRetour | null, FormData>(
    enregistrerSortieOeufs,
    null,
  );
  const [type, setType] = useState('vente');

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="bandeId" value={bandeId} />
      <Retour etat={etat} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Date">
          <Texte type="date" name="dateSortie" defaultValue={aujourdhui} max={aujourdhui} required />
        </Champ>
        <Champ label="Motif">
          <Selection
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              ['vente', 'Vente'],
              ['consommation_perso', 'Consommation personnelle'],
              ['don', 'Don'],
              ['casse', 'Casse'],
              ['perte', 'Perte'],
            ]}
          />
        </Champ>
      </div>

      {/* Le stock est passé au champ : le dépassement s'affiche AVANT l'envoi,
          même si le trigger en base reste l'autorité qui refuse réellement. */}
      <QuantiteOeufs uniteParDefaut="alveole" stockDisponible={stock} />

      {type === 'vente' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Prix unitaire (F)" aide="Dans l’unité choisie ci-dessus.">
            <Texte type="number" name="prixUnitaire" min="0" step="1" required />
          </Champ>
          <Champ label="Client (facultatif)">
            <Texte type="text" name="client" maxLength={200} />
          </Champ>
        </div>
      )}

      <BoutonEnvoyer enCours={enCours}>Enregistrer la sortie</BoutonEnvoyer>
    </form>
  );
}

// ---------------------------------------------------------------------------

function FormMouvement({
  bandeId,
  aujourdhui,
  effectif,
}: {
  bandeId: string;
  aujourdhui: string;
  effectif: number;
}) {
  const [etat, action, enCours] = useActionState<TypeRetour | null, FormData>(
    enregistrerMouvement,
    null,
  );
  const [type, setType] = useState('mortalite');
  const estVente = type === 'vente_poule' || type === 'vente_reforme';

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="bandeId" value={bandeId} />
      <Retour etat={etat} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Date">
          <Texte type="date" name="dateMouvement" defaultValue={aujourdhui} max={aujourdhui} required />
        </Champ>
        <Champ label="Motif">
          <Selection
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={[
              ['mortalite', 'Mortalité'],
              ['vente_poule', 'Vente de poules'],
              ['vente_reforme', 'Vente en réforme'],
              ['consommation_perso', 'Consommation personnelle'],
              ['sortie_diverse', 'Sortie diverse'],
            ]}
          />
        </Champ>
      </div>

      <Champ label="Nombre de poules" aide={`Effectif actuel : ${effectif} poules.`}>
        <Texte type="number" name="quantite" min="1" max={effectif} step="1" required />
      </Champ>

      {estVente && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Montant total (F)">
            <Texte type="number" name="montantTotal" min="0" step="1" required />
          </Champ>
          <Champ label="Acheteur (facultatif)">
            <Texte type="text" name="tiers" maxLength={200} />
          </Champ>
        </div>
      )}

      <Champ label={type === 'mortalite' ? 'Cause (facultatif)' : 'Motif (facultatif)'}>
        <Texte type="text" name="motif" maxLength={500} />
      </Champ>

      <BoutonEnvoyer enCours={enCours}>Enregistrer la sortie</BoutonEnvoyer>
    </form>
  );
}

// ---------------------------------------------------------------------------

function FormDepense({ bandeId, aujourdhui }: { bandeId: string; aujourdhui: string }) {
  const [etat, action, enCours] = useActionState<TypeRetour | null, FormData>(
    enregistrerDepense,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="bandeId" value={bandeId} />
      <Retour etat={etat} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Champ label="Date">
          <Texte type="date" name="dateDepense" defaultValue={aujourdhui} max={aujourdhui} required />
        </Champ>
        <Champ label="Catégorie">
          <Selection
            name="categorie"
            defaultValue="autre"
            options={[
              ['equipement', 'Équipement'],
              ['main_oeuvre', 'Main-d’œuvre'],
              ['energie', 'Énergie'],
              ['eau', 'Eau'],
              ['transport', 'Transport'],
              ['litiere', 'Litière'],
              ['reparation', 'Réparation'],
              ['loyer', 'Loyer'],
              ['autre', 'Autre'],
            ]}
          />
        </Champ>
      </div>

      <Champ label="Libellé">
        <Texte type="text" name="libelle" maxLength={200} required />
      </Champ>

      <Champ label="Montant (F)">
        <Texte type="number" name="montant" min="1" step="1" required />
      </Champ>

      <BoutonEnvoyer enCours={enCours}>Enregistrer la dépense</BoutonEnvoyer>
    </form>
  );
}
