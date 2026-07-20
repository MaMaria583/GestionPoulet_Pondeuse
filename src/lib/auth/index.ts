import { sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { db } from '@/db';
import { verifierMotDePasse } from './password';
import { creerSession, detruireSession, lireSession, type Session } from './session';
import { peutSaisir, type role_utilisateur } from './roles';

export type { Session };
export { detruireSession, lireSession };

/**
 * Tente une connexion.
 *
 * Le message d'erreur est IDENTIQUE que l'email soit inconnu, le mot de passe
 * faux ou le compte désactivé. Distinguer les cas permettrait d'énumérer les
 * comptes existants.
 */
const ECHEC = 'Adresse e-mail ou mot de passe incorrect.';

export async function connecter(
  email: string,
  motDePasse: string,
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const { rows } = await db.execute(sql`
    SELECT id, ferme_id, email, nom_complet, password_hash, role, actif
    FROM users
    WHERE lower(email) = lower(${email})
    LIMIT 1
  `);

  const u = rows[0];

  if (!u) {
    // Vérification factice : sans elle, une réponse instantanée trahirait
    // qu'aucun compte ne porte cette adresse, alors qu'un compte existant
    // coûte ~100 ms de scrypt.
    await verifierMotDePasse(motDePasse, 'scrypt$65536$8$1$AAAAAAAAAAAAAAAA$AAAA');
    return { ok: false, erreur: ECHEC };
  }

  const valide = await verifierMotDePasse(motDePasse, String(u.password_hash));
  if (!valide || u.actif !== true) return { ok: false, erreur: ECHEC };

  await creerSession({
    userId: String(u.id),
    fermeId: String(u.ferme_id),
    email: String(u.email),
    nom: String(u.nom_complet),
    role: u.role as role_utilisateur,
  });

  await db.execute(sql`UPDATE users SET derniere_connexion = now() WHERE id = ${u.id}`);
  return { ok: true };
}

/**
 * Session courante, revalidée en base.
 *
 * Le JWT porte déjà l'identité, mais on revérifie que le compte est toujours
 * actif : sans cela, un utilisateur désactivé garderait l'accès jusqu'à
 * l'expiration de son jeton, soit jusqu'à 8 heures.
 */
export async function utilisateurCourant(): Promise<Session | null> {
  const session = await lireSession();
  if (!session) return null;

  const { rows } = await db.execute(sql`
    SELECT actif, role, ferme_id FROM users WHERE id = ${session.userId} LIMIT 1
  `);
  const u = rows[0];
  if (!u || u.actif !== true) return null;

  // Le rôle peut avoir changé depuis l'émission du jeton : la base fait foi.
  return {
    ...session,
    role: u.role as role_utilisateur,
    fermeId: String(u.ferme_id),
  };
}

/** À utiliser dans toute page protégée. Redirige vers la connexion si absent. */
export async function exigerUtilisateur(): Promise<Session> {
  const session = await utilisateurCourant();
  if (!session) redirect('/connexion');
  return session;
}

/** À utiliser dans toute action de saisie. Lève si le rôle est insuffisant. */
export async function exigerSaisie(): Promise<Session> {
  const session = await exigerUtilisateur();
  if (!peutSaisir(session.role)) {
    throw new Error('Votre rôle ne vous permet pas d’enregistrer de saisie.');
  }
  return session;
}

/**
 * Vérifie qu'une bande appartient bien à la ferme de l'utilisateur.
 *
 * Indispensable : l'identifiant de bande vient du formulaire, donc du client.
 * Sans ce contrôle, modifier le champ caché suffirait à écrire dans les
 * données d'une autre exploitation.
 */
export async function exigerBandeDeLaFerme(bandeId: string, fermeId: string): Promise<void> {
  const { rows } = await db.execute(sql`
    SELECT 1 FROM bandes WHERE id = ${bandeId} AND ferme_id = ${fermeId} LIMIT 1
  `);
  if (rows.length === 0) {
    throw new Error('Bande introuvable dans votre exploitation.');
  }
}
