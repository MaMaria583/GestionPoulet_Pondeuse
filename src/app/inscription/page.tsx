import { redirect } from 'next/navigation';
import { FormulaireInscription } from '@/components/FormulaireInscription';
import { utilisateurCourant } from '@/lib/auth';

export const metadata = { title: 'Créer un compte · Gestion Poulet Pondeuse' };

export default async function PageInscription() {
  // Même raison que sur la page de connexion : seule une session vérifiée
  // justifie de renvoyer vers l'accueil. Le proxy, lui, laisse toujours
  // passer les pages publiques.
  if (await utilisateurCourant()) redirect('/');

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Créer votre exploitation</h1>
          <p className="mt-1 text-sm text-texte-doux">
            Vous en serez le propriétaire. Vous pourrez ensuite ajouter vos collaborateurs.
          </p>
        </header>

        <FormulaireInscription />
      </div>
    </main>
  );
}
