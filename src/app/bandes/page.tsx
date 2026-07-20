import { exigerUtilisateur } from '@/lib/auth';
import { peutGererBandes } from '@/lib/auth/roles';
import { chargerBande, listerBandes } from '@/lib/queries/bande';
import { Navigation } from '@/components/Navigation';
import { ActionsBande, FormulaireCreationBande } from '@/components/FormulairesBandes';
import { Etiquette } from '@/components/ui';
import { formaterAge, formaterDate, formaterFCFA, formaterNombre } from '@/lib/format';
import { differenceJours } from '@/lib/domain/dates';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bandes · Gestion Poulet Pondeuse' };

export default async function PageBandes() {
  const session = await exigerUtilisateur();
  const bandes = await listerBandes();
  const gestion = peutGererBandes(session.role);
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const details = await Promise.all(bandes.map((b) => chargerBande(b.id)));

  return (
    <>
      <Navigation nom={session.nom} role={session.role} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-10">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Bandes</h1>
            <p className="mt-1 text-sm text-texte-doux">
              {bandes.filter((b) => b.statut === 'active').length} active(s) ·{' '}
              {bandes.filter((b) => b.statut === 'cloturee').length} clôturée(s)
            </p>
          </div>
          {gestion && <FormulaireCreationBande aujourdhui={aujourdhui} />}
        </header>

        {!gestion && (
          <p className="mb-4 rounded-lg bg-surface-2 px-4 py-3 text-sm text-texte-doux">
            Votre rôle permet de consulter les bandes, pas de les modifier.
          </p>
        )}

        <div className="space-y-3">
          {details.map((d, i) => {
            const b = bandes[i];
            if (!d) return null;
            const fin = b.statut === 'cloturee' ? b.dateIntroduction : aujourdhui;
            const age = differenceJours(b.dateIntroduction, fin);

            return (
              <section key={b.id} className="rounded-xl border border-bordure bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2.5">
                      <h2 className="font-semibold tracking-tight">{b.code}</h2>
                      <Etiquette ton={b.statut === 'active' ? 'succes' : 'neutre'}>
                        {b.statut === 'active' ? 'Active' : 'Clôturée'}
                      </Etiquette>
                      {!b.dateDebutPonte && (
                        <Etiquette ton="info">ponte non démarrée</Etiquette>
                      )}
                    </div>
                    <p className="text-sm text-texte-doux">
                      {b.nom}
                      {b.souche && ` · ${b.souche}`} · introduite le{' '}
                      {formaterDate(b.dateIntroduction)}
                      {b.statut === 'active' && ` · ${formaterAge(age)}`}
                    </p>
                  </div>

                  <dl className="chiffres flex gap-6 text-sm">
                    <div>
                      <dt className="text-xs text-texte-doux">Effectif</dt>
                      <dd className="font-semibold">
                        {formaterNombre(d.effectif.actuel)}
                        <span className="text-xs font-normal text-texte-doux">
                          {' '}/ {formaterNombre(b.effectifInitial)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-texte-doux">Stock œufs</dt>
                      <dd className="font-semibold">{formaterNombre(d.stock.actuel)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-texte-doux">Résultat</dt>
                      <dd
                        className={`font-semibold ${
                          d.finances.resultat >= 0 ? 'text-succes' : 'text-alerte'
                        }`}
                      >
                        {formaterFCFA(d.finances.resultat)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {gestion && <ActionsBande bande={b} aujourdhui={aujourdhui} />}
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
