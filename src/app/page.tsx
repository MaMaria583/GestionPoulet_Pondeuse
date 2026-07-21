import {
  chargerBande,
  chargerProchainesInterventions,
  chargerProduction,
  chargerRepartitionDepenses,
  listerBandes,
} from '@/lib/queries/bande';
import { CartesKPI } from '@/components/CartesKPI';
import { BandeauAlertes } from '@/components/BandeauAlertes';
import { CourbePonte } from '@/components/CourbePonte';
import { Carte, Etiquette, LigneRepartition } from '@/components/ui';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { redirect } from 'next/navigation';
import { exigerUtilisateur } from '@/lib/auth';
import { accueilDuRole, peutVoirFinances } from '@/lib/auth/roles';
import { formaterAge, formaterDate, formaterFCFA, formaterNombre } from '@/lib/format';
import { differenceJours } from '@/lib/domain/dates';

// Données de suivi quotidien : jamais mises en cache, sinon une saisie
// n'apparaîtrait pas immédiatement et l'alerte semblerait persister.
export const dynamic = 'force-dynamic';

export default async function TableauDeBord() {
  const session = await exigerUtilisateur();

  // Un compte de saisie n'a rien à faire sur un tableau de bord d'analyse :
  // on l'envoie là où est son travail, le formulaire du jour.
  const accueil = accueilDuRole(session.role);
  if (accueil !== '/') redirect(accueil);

  const voitFinances = peutVoirFinances(session.role);
  const bandes = await listerBandes(session.fermeId);

  if (bandes.length === 0) {
    return (
      <>
        <Navigation nom={session.nom} role={session.role} />
        <main className="mx-auto max-w-lg px-6 py-20 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Bienvenue, {session.nom}</h1>
          <p className="mt-2 text-sm text-texte-doux">
            Votre exploitation est créée, mais elle ne contient encore aucune bande.
            Tout le suivi — ponte, effectif, dépenses — s’organise autour d’une bande,
            c’est-à-dire un lot de poules introduites le même jour.
          </p>
          <Link
            href="/bandes"
            className="mt-6 inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-[#14161e] transition hover:opacity-90"
          >
            Créer ma première bande
          </Link>
        </main>
      </>
    );
  }

  const bandeCourante = bandes.find((b) => b.statut === 'active') ?? bandes[0];
  const [bande, production, interventions, depenses] = await Promise.all([
    chargerBande(bandeCourante.id, session.fermeId),
    chargerProduction(bandeCourante.id),
    chargerProchainesInterventions(bandeCourante.id),
    chargerRepartitionDepenses(bandeCourante.id),
  ]);

  if (!bande) return null;

  const dernierJour = production.at(-1) ?? null;
  const aujourdhui = dernierJour?.jour ?? bande.dateIntroduction;
  const age = differenceJours(bande.dateIntroduction, aujourdhui);
  const maxDepense = Math.max(...depenses.map((d) => d.montant), 1);

  const sortiesEffectif = [
    { libelle: 'Mortalités', valeur: bande.effectif.mortalites, ton: 'alerte' as const },
    { libelle: 'Ventes de poules', valeur: bande.effectif.ventesPoules, ton: 'accent' as const },
    { libelle: 'Ventes en réforme', valeur: bande.effectif.reformes, ton: 'accent' as const },
    { libelle: 'Consommation perso.', valeur: bande.effectif.consoPerso, ton: 'accent' as const },
    { libelle: 'Sorties diverses', valeur: bande.effectif.sortiesDiverses, ton: 'accent' as const },
  ].filter((l) => l.valeur > 0);

  return (
    <>
    <Navigation nom={session.nom} role={session.role} />
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      {/* ---------- En-tête ---------- */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">{bande.code}</h1>
            <Etiquette ton={bande.statut === 'active' ? 'succes' : 'neutre'}>
              {bande.statut === 'active' ? 'Active' : 'Clôturée'}
            </Etiquette>
          </div>
          <p className="text-sm text-texte-doux">
            {bande.nom}
            {bande.souche && ` · ${bande.souche}`} · introduite le{' '}
            {formaterDate(bande.dateIntroduction)} · {formaterAge(age)}
            {bande.dateDebutPonte && ` · ponte depuis le ${formaterDate(bande.dateDebutPonte)}`}
          </p>
        </div>

        {bandes.length > 1 && (
          <nav className="flex gap-1.5" aria-label="Choix de la bande">
            {bandes.map((b) => (
              <span
                key={b.id}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  b.id === bande.id
                    ? 'border-accent bg-accent-doux text-accent-encre'
                    : 'border-bordure text-texte-doux'
                }`}
              >
                {b.code}
              </span>
            ))}
          </nav>
        )}
      </header>

      <div className="space-y-4">
        <CartesKPI bande={bande} dernierJour={dernierJour} voitFinances={voitFinances} />

        <BandeauAlertes points={production} />

        <Carte titre="Évolution de la production">
          <CourbePonte points={production} />
        </Carte>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* ---------- Réconciliation de l'effectif ---------- */}
          <Carte titre="Réconciliation de l’effectif">
            <div className="mb-3 flex items-baseline justify-between border-b border-bordure pb-3">
              <span className="text-sm text-texte-doux">Effectif initial</span>
              <span className="chiffres text-sm font-medium">
                {formaterNombre(bande.effectifInitial)}
              </span>
            </div>

            {sortiesEffectif.map((l) => (
              <LigneRepartition
                key={l.libelle}
                libelle={l.libelle}
                valeur={`− ${formaterNombre(l.valeur)}`}
                proportion={l.valeur / bande.effectifInitial}
                ton={l.ton}
              />
            ))}

            <div className="mt-3 flex items-baseline justify-between border-t border-bordure pt-3">
              <span className="text-sm font-medium">Effectif actuel</span>
              <span className="chiffres text-lg font-semibold">
                {formaterNombre(bande.effectif.actuel)}
              </span>
            </div>
          </Carte>

          {/* ---------- Mouvement des œufs ---------- */}
          <Carte titre="Mouvement des œufs">
            <div className="mb-3 flex items-baseline justify-between border-b border-bordure pb-3">
              <span className="text-sm text-texte-doux">Total récolté</span>
              <span className="chiffres text-sm font-medium">
                {formaterNombre(bande.stock.totalRecolte)}
              </span>
            </div>

            <LigneRepartition
              libelle="Cassés au ramassage"
              valeur={`− ${formaterNombre(bande.stock.totalCasse)}`}
              proportion={bande.stock.totalCasse / Math.max(bande.stock.totalRecolte, 1)}
              ton="alerte"
            />
            <LigneRepartition
              libelle="Vendus"
              valeur={`− ${formaterNombre(bande.stock.totalVendu)}`}
              proportion={bande.stock.totalVendu / Math.max(bande.stock.totalRecolte, 1)}
              ton="succes"
            />
            <LigneRepartition
              libelle="Autres sorties"
              valeur={`− ${formaterNombre(bande.stock.autresSorties)}`}
              proportion={bande.stock.autresSorties / Math.max(bande.stock.totalRecolte, 1)}
            />

            <div className="mt-3 flex items-baseline justify-between border-t border-bordure pt-3">
              <span className="text-sm font-medium">Stock disponible</span>
              <span className="chiffres text-lg font-semibold">
                {formaterNombre(bande.stock.actuel)}
              </span>
            </div>
          </Carte>

          {/* ---------- Prochaines interventions ---------- */}
          <Carte titre="Prochaines interventions">
            {interventions.length === 0 ? (
              <p className="py-6 text-center text-sm text-texte-doux">
                Aucune intervention planifiée.
              </p>
            ) : (
              <ul className="space-y-3">
                {interventions.map((i) => (
                  <li key={i.id} className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0">
                      <Etiquette ton="info">{i.type}</Etiquette>
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.libelle}</p>
                      <p className="text-xs text-texte-doux">
                        {formaterDate(i.datePrevue)}
                        {i.produit && ` · ${i.produit}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Carte>
        </div>

        {/* ---------- Synthèse financière ---------- */}
        {voitFinances && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Carte titre="Recettes et dépenses">
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-texte-doux">Ventes d’œufs</dt>
                <dd className="chiffres font-medium text-succes">
                  {formaterFCFA(bande.finances.recettesOeufs)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-texte-doux">Ventes de poules</dt>
                <dd className="chiffres font-medium text-succes">
                  {formaterFCFA(bande.finances.recettesPoules)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-bordure pt-2.5">
                <dt className="font-medium">Total recettes</dt>
                <dd className="chiffres font-semibold text-succes">
                  {formaterFCFA(bande.finances.totalRecettes)}
                </dd>
              </div>
              <div className="flex justify-between pt-1">
                <dt className="font-medium">Total dépenses</dt>
                <dd className="chiffres font-semibold text-alerte">
                  − {formaterFCFA(bande.finances.totalDepenses)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t-2 border-bordure pt-3">
                <dt className="font-semibold">Résultat net</dt>
                <dd
                  className={`chiffres text-xl font-bold ${
                    bande.finances.resultat >= 0 ? 'text-succes' : 'text-alerte'
                  }`}
                >
                  {formaterFCFA(bande.finances.resultat)}
                </dd>
              </div>
            </dl>
          </Carte>

          <Carte titre="Répartition des dépenses">
            {depenses.map((d) => (
              <LigneRepartition
                key={d.categorie}
                libelle={d.categorie}
                valeur={formaterFCFA(d.montant)}
                proportion={d.montant / maxDepense}
                ton="alerte"
              />
            ))}
          </Carte>
        </div>
        )}
      </div>
    </main>
    </>
  );
}
