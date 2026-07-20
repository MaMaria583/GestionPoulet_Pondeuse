import { FormulaireInscription } from '@/components/FormulaireInscription';

export const metadata = { title: 'Créer un compte · Gestion Poulet Pondeuse' };

export default function PageInscription() {
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
