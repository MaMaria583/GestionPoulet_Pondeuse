import Link from 'next/link';
import { exigerUtilisateur } from '@/lib/auth';
import { peutSaisir } from '@/lib/auth/roles';
import { Navigation } from '@/components/Navigation';
import { chargerBande, listerBandes } from '@/lib/queries/bande';
import { Formulaires } from '@/components/saisie/Formulaires';
import { formaterNombre } from '@/lib/format';
import { oeufsEnAlveoles } from '@/lib/domain/oeufs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saisie · Gestion Poulet Pondeuse' };

export default async function PageSaisie() {
  const session = await exigerUtilisateur();

  if (!peutSaisir(session.role)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 text-center">
        <h1 className="text-lg font-semibold">Accès en lecture seule</h1>
        <p className="mt-2 text-sm text-texte-doux">
          Votre rôle ne permet pas d’enregistrer de saisie. Contactez le propriétaire
          de l’exploitation.
        </p>
      </main>
    );
  }

  const bandes = await listerBandes();
  const active = bandes.find((b) => b.statut === 'active') ?? bandes[0];

  if (!active) {
    return (
      <>
        <Navigation nom={session.nom} role={session.role} />
        <main className="mx-auto max-w-lg px-6 py-20 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Aucune bande active</h1>
          <p className="mt-2 text-sm text-texte-doux">
            Une saisie se rattache toujours à une bande. Créez-en une pour commencer
            à enregistrer récoltes, mortalités et ventes.
          </p>
          <Link
            href="/bandes"
            className="mt-6 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            Créer une bande
          </Link>
        </main>
      </>
    );
  }

  const bande = await chargerBande(active.id);
  if (!bande) return null;

  // La date « du jour » vient du serveur : se fier à l'horloge du navigateur
  // ferait dépendre la date de récolte du réglage du téléphone.
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const { alveoles, oeufsRestants } = oeufsEnAlveoles(bande.stock.actuel);

  return (
    <>
    <Navigation nom={session.nom} role={session.role} />
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Saisie quotidienne</h1>
        <p className="mt-1 text-sm text-texte-doux">
          Bande {bande.code}
          {bande.nom && ` · ${bande.nom}`}
        </p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-bordure bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-texte-doux">
            Effectif actuel
          </p>
          <p className="chiffres mt-1 text-xl font-semibold">
            {formaterNombre(bande.effectif.actuel)}{' '}
            <span className="text-sm font-normal text-texte-doux">poules</span>
          </p>
        </div>
        <div className="rounded-xl border border-bordure bg-surface p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-texte-doux">
            Stock d’œufs
          </p>
          <p className="chiffres mt-1 text-xl font-semibold">
            {formaterNombre(bande.stock.actuel)}{' '}
            <span className="text-sm font-normal text-texte-doux">
              œufs{alveoles > 0 && ` · ${alveoles} alv.${oeufsRestants ? ` + ${oeufsRestants}` : ''}`}
            </span>
          </p>
        </div>
      </div>

      <Formulaires
        bandeId={bande.id}
        aujourdhui={aujourdhui}
        stockDisponible={bande.stock.actuel}
        effectifActuel={bande.effectif.actuel}
      />
    </main>
    </>
  );
}
