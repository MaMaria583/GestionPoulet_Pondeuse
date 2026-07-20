import { exigerUtilisateur } from '@/lib/auth';
import { peutGererUtilisateurs } from '@/lib/auth/roles';
import { listerUtilisateurs } from '@/lib/queries/historique';
import { Navigation } from '@/components/Navigation';
import {
  ChangementMotDePasse,
  CreationUtilisateur,
  LigneUtilisateur,
} from '@/components/GestionUtilisateurs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Utilisateurs · Gestion Poulet Pondeuse' };

export default async function PageUtilisateurs() {
  const session = await exigerUtilisateur();
  const gestion = peutGererUtilisateurs(session.role);

  // Tout le monde accède à cette page pour changer SON mot de passe.
  // Seul le propriétaire y voit la liste des comptes.
  const utilisateurs = gestion ? await listerUtilisateurs(session.fermeId) : [];

  return (
    <>
      <Navigation nom={session.nom} role={session.role} />
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-10">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Mon compte</h1>
          <p className="mt-1 text-sm text-texte-doux">{session.email}</p>
        </header>

        <div className="space-y-4">
          <ChangementMotDePasse />

          {gestion && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <h2 className="text-sm font-semibold">
                  Comptes de l’exploitation ({utilisateurs.length})
                </h2>
                <CreationUtilisateur />
              </div>

              <div className="overflow-hidden rounded-xl border border-bordure bg-surface">
                <ul className="divide-y divide-bordure">
                  {utilisateurs.map((u) => (
                    <LigneUtilisateur
                      key={u.id}
                      utilisateur={u}
                      estMoi={u.id === session.userId}
                    />
                  ))}
                </ul>
              </div>

              <p className="text-xs text-texte-doux">
                Vous ne pouvez ni modifier votre propre rôle ni désactiver votre compte :
                l’exploitation se retrouverait sans propriétaire, donc sans personne
                pour rétablir les droits.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
