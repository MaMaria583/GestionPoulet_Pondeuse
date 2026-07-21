'use client';

import { useId, useState, type ReactNode } from 'react';
import { OEUFS_PAR_ALVEOLE } from '@/lib/domain/constants';
import { formaterNombre } from '@/lib/format';

const baseChamp =
  'w-full rounded-lg border border-bordure bg-fond px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-50';

export function Champ({
  label,
  aide,
  children,
}: {
  label: string;
  aide?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {aide && <span className="mt-1 block text-xs text-texte-doux">{aide}</span>}
    </label>
  );
}

export function Texte(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={baseChamp} />;
}

export function Selection({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { options: [string, string][] }) {
  return (
    <select {...props} className={baseChamp}>
      {options.map(([valeur, libelle]) => (
        <option key={valeur} value={valeur}>
          {libelle}
        </option>
      ))}
    </select>
  );
}

/**
 * Saisie d'une quantité d'œufs, en œufs ou en alvéoles.
 *
 * La conversion s'affiche EN DIRECT sous le champ. C'est le point où une
 * erreur coûte le plus cher : taper « 12 » en pensant alvéoles alors que
 * l'unité est « œufs » fait entrer 12 œufs au lieu de 360, et l'écart se
 * propage ensuite dans le stock, les ventes et la rentabilité. Voir la
 * conversion s'écrire supprime l'ambiguïté avant validation.
 */
export function QuantiteOeufs({
  nomQuantite = 'quantite',
  nomUnite = 'unite',
  uniteParDefaut = 'oeuf',
  stockDisponible,
}: {
  nomQuantite?: string;
  nomUnite?: string;
  uniteParDefaut?: 'oeuf' | 'alveole';
  stockDisponible?: number;
}) {
  const id = useId();
  const [quantite, setQuantite] = useState('');
  const [unite, setUnite] = useState<'oeuf' | 'alveole'>(uniteParDefaut);

  const valeur = Number(quantite);
  const valide = quantite !== '' && Number.isFinite(valeur) && valeur >= 0;
  const oeufs = valide ? valeur * (unite === 'alveole' ? OEUFS_PAR_ALVEOLE : 1) : null;
  const entier = oeufs !== null && Number.isInteger(oeufs);
  const depasse = stockDisponible != null && oeufs !== null && oeufs > stockDisponible;

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium">Quantité</span>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          name={nomQuantite}
          min="0"
          step={unite === 'alveole' ? '0.5' : '1'}
          required
          value={quantite}
          onChange={(e) => setQuantite(e.target.value)}
          className={baseChamp}
          aria-describedby={`${id}-aide`}
        />
        <select
          name={nomUnite}
          value={unite}
          onChange={(e) => setUnite(e.target.value as 'oeuf' | 'alveole')}
          className="rounded-lg border border-bordure bg-fond px-3 py-2 text-sm outline-none focus:border-accent"
          aria-label="Unité de saisie"
        >
          <option value="oeuf">œufs</option>
          <option value="alveole">alvéoles</option>
        </select>
      </div>

      <p id={`${id}-aide`} className="mt-1.5 text-xs" aria-live="polite">
        {oeufs === null ? (
          <span className="text-texte-doux">1 alvéole = {OEUFS_PAR_ALVEOLE} œufs</span>
        ) : !entier ? (
          <span className="text-alerte">
            {quantite} alvéoles = {oeufs} œufs, ce qui n’est pas un nombre entier. Saisissez en œufs.
          </span>
        ) : depasse ? (
          <span className="text-alerte">
            = {formaterNombre(oeufs)} œufs — dépasse le stock disponible (
            {formaterNombre(stockDisponible)}).
          </span>
        ) : (
          <span className="text-texte-doux">
            = <strong className="text-texte">{formaterNombre(oeufs)} œufs</strong>
            {stockDisponible != null &&
              ` · restera ${formaterNombre(stockDisponible - oeufs)} en stock`}
          </span>
        )}
      </p>
    </div>
  );
}

export function BoutonEnvoyer({ enCours, children }: { enCours: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={enCours}
      className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[#14161e] transition hover:opacity-90 disabled:opacity-50"
    >
      {enCours ? 'Enregistrement…' : children}
    </button>
  );
}

export function Retour({ etat }: { etat: { ok: boolean; message?: string; erreur?: string } | null }) {
  if (!etat) return null;
  return (
    <p
      role="status"
      className={`rounded-lg px-3 py-2 text-sm ${
        etat.ok ? 'bg-succes-doux text-succes' : 'bg-alerte-doux text-alerte'
      }`}
    >
      {etat.ok ? etat.message : etat.erreur}
    </p>
  );
}
