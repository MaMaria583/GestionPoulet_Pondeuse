import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import type { role_utilisateur } from '@/lib/auth/roles';

/**
 * Session utilisateur : JWT signé (HS256), déposé dans un cookie httpOnly.
 *
 * Pas de table `sessions` : à cette échelle, un jeton signé évite une requête
 * base à chaque page. Contrepartie assumée — on ne peut pas révoquer un jeton
 * individuel avant son expiration. La durée est donc courte (8 h, une journée
 * de travail) et la désactivation d'un compte est revérifiée à chaque
 * chargement dans `utilisateurCourant()`.
 */

const NOM_COOKIE = 'session';
const DUREE_HEURES = 8;

export interface Session {
  userId: string;
  fermeId: string;
  email: string;
  nom: string;
  role: role_utilisateur;
}

function cle(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    // Échouer bruyamment : un secret absent ou trop court rendrait les
    // jetons forgeables, et le problème passerait autrement inaperçu.
    throw new Error(
      'AUTH_SECRET manquant ou trop court (32 caractères minimum). ' +
        'Générez-le avec : openssl rand -base64 32',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function creerSession(session: Session): Promise<void> {
  const jeton = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${DUREE_HEURES}h`)
    .sign(cle());

  const magasin = await cookies();
  magasin.set(NOM_COOKIE, jeton, {
    httpOnly: true,                                   // inaccessible au JavaScript de la page
    secure: process.env.NODE_ENV === 'production',    // HTTPS uniquement en production
    sameSite: 'lax',                                  // bloque l'envoi cross-site (CSRF)
    path: '/',
    maxAge: DUREE_HEURES * 3600,
  });
}

export async function lireSession(): Promise<Session | null> {
  const magasin = await cookies();
  const jeton = magasin.get(NOM_COOKIE)?.value;
  if (!jeton) return null;

  try {
    const { payload } = await jwtVerify(jeton, cle(), { algorithms: ['HS256'] });
    return {
      userId: String(payload.userId),
      fermeId: String(payload.fermeId),
      email: String(payload.email),
      nom: String(payload.nom),
      role: payload.role as role_utilisateur,
    };
  } catch {
    // Signature invalide, jeton expiré ou malformé : pas de session.
    return null;
  }
}

export async function detruireSession(): Promise<void> {
  const magasin = await cookies();
  magasin.delete(NOM_COOKIE);
}
