import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connecter } from '@/lib/auth';

export const metadata = { title: 'Connexion · Gestion Poulet Pondeuse' };

export default async function PageConnexion(props: PageProps<'/connexion'>) {
  const params = await props.searchParams;
  const suite = typeof params.suite === 'string' ? params.suite : '/';
  const erreur = typeof params.erreur === 'string' ? params.erreur : null;

  async function actionConnexion(donnees: FormData) {
    'use server';

    const email = String(donnees.get('email') ?? '').trim();
    const motDePasse = String(donnees.get('motDePasse') ?? '');
    const destination = String(donnees.get('suite') ?? '/');

    if (!email || !motDePasse) {
      redirect('/connexion?erreur=' + encodeURIComponent('Renseignez les deux champs.'));
    }

    const r = await connecter(email, motDePasse);
    if (!r.ok) {
      redirect('/connexion?erreur=' + encodeURIComponent(r.erreur));
    }

    // Redirection interne uniquement : accepter une URL absolue transformerait
    // ce paramètre en redirection ouverte vers un site tiers.
    redirect(destination.startsWith('/') && !destination.startsWith('//') ? destination : '/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Gestion Poulet Pondeuse</h1>
          <p className="mt-1 text-sm text-texte-doux">Suivi des bandes de pondeuses</p>
        </header>

        <form
          action={actionConnexion}
          className="rounded-xl border border-bordure bg-surface p-6"
        >
          <input type="hidden" name="suite" value={suite} />

          {erreur && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-alerte-doux px-3 py-2 text-sm text-alerte"
            >
              {erreur}
            </p>
          )}

          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm font-medium">Adresse e-mail</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="username"
              autoFocus
              className="w-full rounded-lg border border-bordure bg-fond px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <label className="mb-5 block">
            <span className="mb-1.5 block text-sm font-medium">Mot de passe</span>
            <input
              type="password"
              name="motDePasse"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-bordure bg-fond px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <button
            type="submit"
            className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-[#14161e] transition hover:opacity-90"
          >
            Se connecter
          </button>

          <p className="mt-5 border-t border-bordure pt-4 text-center text-sm text-texte-doux">
            Pas encore de compte ?{' '}
            <Link href="/inscription" className="font-medium text-accent-encre hover:underline">
              Créer mon exploitation
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
