/**
 * Vérifie que chaque route répond correctement, avec et sans session.
 *
 * On forge un cookie de session signé plutôt que de piloter le formulaire :
 * la connexion passe par une Server Action, dont le protocole (en-tête
 * Next-Action, encodage propriétaire) n'est pas un contrat public. Le test
 * porterait alors sur ce protocole plutôt que sur nos routes.
 */
import { neon } from '@neondatabase/serverless';
import { SignJWT } from 'jose';

const BASE = 'http://localhost:3000';
const sql = neon(process.env.DATABASE_URL);

let ok = 0;
let ko = 0;
const verifier = (nom, condition, detail = '') => {
  console.log(`  ${condition ? '✔' : '✘'} ${nom}${condition ? '' : ` — ${detail}`}`);
  if (condition) ok++;
  else ko++;
};

async function cookiePour(email) {
  const [u] = await sql`
    SELECT id, ferme_id, email, nom_complet, role FROM users WHERE email = ${email}
  `;
  if (!u) throw new Error(`Utilisateur ${email} introuvable`);

  const jeton = await new SignJWT({
    userId: u.id, fermeId: u.ferme_id, email: u.email, nom: u.nom_complet, role: u.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));

  return `session=${jeton}`;
}

const get = (chemin, cookie) =>
  fetch(BASE + chemin, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });

const ROUTES = ['/', '/saisie', '/historique', '/bandes', '/utilisateurs'];

console.log('\n[Accès anonyme : tout doit rediriger vers la connexion]');
for (const r of ROUTES) {
  const rep = await get(r);
  const versConnexion = rep.status === 307 && (rep.headers.get('location') ?? '').includes('/connexion');
  verifier(`${r} → redirection`, versConnexion, `statut ${rep.status}`);
}
const connexion = await get('/connexion');
verifier('/connexion accessible sans session', connexion.status === 200, `statut ${connexion.status}`);
const corpsConnexion = connexion.status === 200 ? await connexion.text() : '';
verifier('/connexion propose de créer un compte',
  corpsConnexion.includes('/inscription'),
  'aucun lien vers l’inscription — un nouveau visiteur reste bloqué');

const inscription = await get('/inscription');
verifier('/inscription accessible sans session', inscription.status === 200,
  `statut ${inscription.status}`);
const corpsInscription = inscription.status === 200 ? await inscription.text() : '';
verifier('/inscription demande ferme, nom, e-mail et mot de passe',
  ['nomFerme', 'nomComplet', 'email', 'motDePasse', 'confirmation']
    .every((c) => corpsInscription.includes(c)),
  'un champ manque');

console.log('\n[Propriétaire : accès complet]');
const cookieProprio = await cookiePour('mariam.dembele@modenamali.com');
for (const r of ROUTES) {
  const rep = await get(r, cookieProprio);
  const corps = rep.status === 200 ? await rep.text() : '';
  verifier(`${r} → 200`, rep.status === 200, `statut ${rep.status}`);
  if (corps) {
    verifier(`${r} sans trace d'erreur`, !/Application error|Internal Server Error/i.test(corps));
  }
}

console.log('\n[Lecture seule : consultation oui, saisie non]');
const cookieLecture = await cookiePour('lecture@modenamali.com');

const tdb = await get('/', cookieLecture);
verifier('tableau de bord accessible', tdb.status === 200, `statut ${tdb.status}`);

const saisie = await get('/saisie', cookieLecture);
const corpsSaisie = await saisie.text();
verifier('page de saisie : message de refus',
  corpsSaisie.includes('lecture seule') || corpsSaisie.includes('ne permet pas'),
  'le refus n’est pas affiché');
verifier('page de saisie : aucun formulaire rendu',
  !corpsSaisie.includes('Enregistrer la récolte'),
  'un formulaire de saisie est présent !');

const histo = await get('/historique', cookieLecture);
const corpsHisto = await histo.text();
verifier('historique : aucun bouton de suppression',
  !corpsHisto.includes('Supprimer'),
  'un bouton de suppression est présent !');

const bandesLecture = await get('/bandes', cookieLecture);
const corpsBandes = await bandesLecture.text();
verifier('bandes : aucun bouton de création',
  !corpsBandes.includes('Nouvelle bande'),
  'le bouton de création est présent !');

const utilLecture = await get('/utilisateurs', cookieLecture);
const corpsUtil = await utilLecture.text();
verifier('utilisateurs : changement de mot de passe accessible',
  corpsUtil.includes('Changer mon mot de passe'));
verifier('utilisateurs : liste des comptes masquée',
  !corpsUtil.includes('Nouveau compte'),
  'la gestion des comptes est visible !');

console.log('\n[Visiteur déjà connecté]');
for (const r of ['/connexion', '/inscription']) {
  const rep = await get(r, cookieProprio);
  verifier(`${r} → renvoyé vers l’application`, rep.status === 307, `statut ${rep.status}`);
}

console.log('\n[Session invalide]');
const faux = await get('/', 'session=jeton.completement.invalide');
verifier('jeton forgé rejeté', faux.status === 307 || faux.status === 200);
if (faux.status === 200) {
  const c = await faux.text();
  verifier('  … et aucune donnée exposée', c.includes('connexion') || c.includes('Connexion'));
}

console.log(`\n${ok} vérifications réussies, ${ko} échouées`);
if (ko > 0) process.exitCode = 1;
