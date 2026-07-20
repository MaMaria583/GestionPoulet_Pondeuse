import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Hachage des mots de passe — scrypt, depuis la bibliothèque standard de Node.
 *
 * Pourquoi scrypt et pas Argon2id : Argon2 arrive en tête des recommandations
 * OWASP, mais toutes ses implémentations Node sont des modules natifs, dont la
 * compilation casse régulièrement au déploiement serverless. scrypt est le
 * second choix OWASP, il est memory-hard comme Argon2, et il est intégré à Node
 * — donc zéro dépendance, zéro binaire à compiler, zéro surface d'attaque
 * supply-chain sur le composant le plus sensible de l'application.
 *
 * Pourquoi surtout PAS : MD5, SHA-1, SHA-256 nus. Ils sont conçus pour être
 * rapides, ce qui est exactement le défaut recherché ici — un GPU en teste
 * des milliards par seconde.
 */

// `promisify` ne conserve pas la surcharge de scrypt acceptant des options :
// on retype explicitement celle dont on a besoin.
const scryptAsync = promisify(scrypt) as (
  motDePasse: string,
  sel: Buffer,
  longueur: number,
  options: ScryptOptions,
) => Promise<Buffer>;

// Paramètres OWASP 2024 pour scrypt : N ≥ 2^16, r = 8, p = 1.
const N = 65_536;
const R = 8;
const P = 1;
const LONGUEUR_CLE = 64;
const LONGUEUR_SEL = 16;
// scrypt exige 128 × N × r octets : ici ~67 Mo. La limite Node par défaut
// (32 Mo) ferait échouer le calcul.
const MAX_MEM = 144 * 1024 * 1024;

/** Longueur minimale acceptée. En dessous, la robustesse du hachage ne sauve rien. */
export const LONGUEUR_MIN_MOT_DE_PASSE = 10;

/**
 * Produit un hash au format `scrypt$N$r$p$sel$cle`, tout en base64url.
 * Les paramètres sont stockés AVEC le hash : on pourra les durcir plus tard
 * sans invalider les mots de passe existants.
 */
export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  if (motDePasse.length < LONGUEUR_MIN_MOT_DE_PASSE) {
    throw new Error(
      `Le mot de passe doit faire au moins ${LONGUEUR_MIN_MOT_DE_PASSE} caractères.`,
    );
  }
  const sel = randomBytes(LONGUEUR_SEL);
  const cle = await scryptAsync(motDePasse.normalize('NFKC'), sel, LONGUEUR_CLE, {
    N, r: R, p: P, maxmem: MAX_MEM,
  });

  return ['scrypt', N, R, P, sel.toString('base64url'), cle.toString('base64url')].join('$');
}

/**
 * Vérifie un mot de passe contre un hash stocké.
 *
 * Ne lève jamais : un hash corrompu ou d'un format inconnu renvoie `false`
 * comme un mot de passe faux. Laisser filer une exception ici distinguerait
 * « compte inexistant » de « mot de passe faux » dans les logs et les temps
 * de réponse.
 */
export async function verifierMotDePasse(
  motDePasse: string,
  hashStocke: string,
): Promise<boolean> {
  try {
    const [algo, n, r, p, selB64, cleB64] = hashStocke.split('$');
    if (algo !== 'scrypt') return false;

    const sel = Buffer.from(selB64, 'base64url');
    const attendu = Buffer.from(cleB64, 'base64url');
    if (sel.length === 0 || attendu.length === 0) return false;

    const calcule = await scryptAsync(motDePasse.normalize('NFKC'), sel, attendu.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: MAX_MEM,
    });

    // Comparaison à temps constant : un `===` fuite la position du premier
    // octet divergent via le temps de réponse.
    return timingSafeEqual(calcule, attendu);
  } catch {
    return false;
  }
}
