import { exigerUtilisateur } from '@/lib/auth';
import { peutSupprimer } from '@/lib/auth/roles';
import { listerBandes } from '@/lib/queries/bande';
import { chargerHistorique } from '@/lib/queries/historique';
import { Navigation } from '@/components/Navigation';
import { BoutonSuppression } from '@/components/BoutonSuppression';
import { Etiquette } from '@/components/ui';
import { formaterDate, formaterFCFA } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Historique · Gestion Poulet Pondeuse' };

const TONS = {
  'Récolte': 'succes',
  'Sortie d’œufs': 'accent',
  'Sortie de poules': 'alerte',
  'Dépense': 'avertissement',
  'Alimentation': 'info',
} as const;

export default async function PageHistorique() {
  const session = await exigerUtilisateur();
  const bandes = await listerBandes();
  const active = bandes.find((b) => b.statut === 'active') ?? bandes[0];

  if (!active) {
    return (
      <>
        <Navigation nom={session.nom} role={session.role} />
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          <h1 className="text-lg font-semibold">Aucune bande</h1>
        </main>
      </>
    );
  }

  const lignes = await chargerHistorique(active.id);
  const suppression = peutSupprimer(session.role);

  return (
    <>
      <Navigation nom={session.nom} role={session.role} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Historique des saisies</h1>
          <p className="mt-1 text-sm text-texte-doux">
            Bande {active.code} · {lignes.length} dernières entrées, toutes natures confondues
          </p>
        </header>

        {!suppression && (
          <p className="mb-4 rounded-lg bg-surface-2 px-4 py-3 text-sm text-texte-doux">
            Votre rôle permet de consulter l’historique, pas de supprimer des saisies.
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-bordure bg-surface">
          <ul className="divide-y divide-bordure">
            {lignes.map((l) => (
              <li key={`${l.table}-${l.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="shrink-0">
                  <Etiquette ton={TONS[l.categorie as keyof typeof TONS] ?? 'neutre'}>
                    {l.categorie}
                  </Etiquette>
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="capitalize">{l.libelle}</span>
                    {l.detail && <span className="text-texte-doux"> · {l.detail}</span>}
                  </p>
                  <p className="text-xs text-texte-doux">
                    {formaterDate(l.date)}
                    {l.auteur && ` · saisi par ${l.auteur}`}
                  </p>
                </div>

                {l.montant != null && l.montant > 0 && (
                  <span className="chiffres shrink-0 text-sm font-medium">
                    {formaterFCFA(l.montant)}
                  </span>
                )}

                {suppression && <BoutonSuppression ligne={l} />}
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
