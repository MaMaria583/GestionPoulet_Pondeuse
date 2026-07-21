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
 *
 * COROLLAIRE, et il est vital : puisque ce fichier ne sait pas si un cookie
 * est valide, il ne doit JAMAIS renvoyer quelqu'un HORS de `/connexion`. Un
 * jeton expiré ou mal signé produirait sinon une boucle infinie — le proxy
 * renvoie vers `/`, la page constate que la session est invalide et renvoie
 * vers `/connexion`, indéfiniment (ERR_TOO_MANY_REDIRECTS). Comme un jeton
 * expire au bout de 8 h, tout utilisateur revenant le lendemain tomberait
 * dedans. La redirection « déjà connecté » vit donc dans la page de connexion,
 * seule capable de vérifier réellement la session.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Seules pages accessibles sans session : se connecter, ou créer un compte.
  const PUBLIQUES = ['/connexion', '/inscription'];
  const estPublique = PUBLIQUES.includes(pathname);
  const aCookie = request.cookies.has('session');

  if (!estPublique && !aCookie) {
    const url = request.nextUrl.clone();
    url.pathname = '/connexion';
    // Mémorise la destination pour y revenir après connexion.
    if (pathname !== '/') url.searchParams.set('suite', pathname + search);
    return NextResponse.redirect(url);
  }

  // Pas de redirection depuis les pages publiques : voir le corollaire ci-dessus.
  return NextResponse.next();
}

export const config = {
  // Exclut les ressources statiques et les images : les faire transiter par
  // le proxy n'apporte rien et ralentit chaque chargement de page.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
