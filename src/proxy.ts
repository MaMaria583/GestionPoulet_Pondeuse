import { NextResponse, type NextRequest } from 'next/server';

/**
 * Barrière d'accès (ex-`middleware`, renommé `proxy` en Next.js 16).
 *
 * On ne vérifie ICI que la PRÉSENCE du cookie, pas sa validité : le proxy
 * s'exécute avant chaque requête, y valider une signature et interroger la
 * base coûterait cher sur toutes les navigations.
 *
 * La vraie vérification — signature du jeton, compte toujours actif, rôle —
 * a lieu dans `exigerUtilisateur()`, côté page. Ce proxy n'est qu'un
 * raccourci d'expérience utilisateur : il évite d'afficher une page vide
 * avant redirection. Il ne constitue PAS la protection.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const estPublique = pathname === '/connexion';
  const aCookie = request.cookies.has('session');

  if (!estPublique && !aCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    // Mémorise la destination pour y revenir après connexion.
    if (pathname !== '/') url.searchParams.set('suite', pathname + search);
    return NextResponse.redirect(url);
  }

  if (estPublique && aCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Exclut les ressources statiques et les images : les faire transiter par
  // le proxy n'apporte rien et ralentit chaque chargement de page.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
