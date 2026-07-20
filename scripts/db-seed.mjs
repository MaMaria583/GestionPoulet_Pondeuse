/**
 * Jeu de démonstration : une bande de 500 pondeuses suivie sur 6 mois.
 *
 * Les données sont DÉTERMINISTES (générateur pseudo-aléatoire à graine fixe) :
 * deux exécutions produisent exactement la même base, sinon un tableau de bord
 * qui change à chaque rechargement devient impossible à relire.
 *
 * La courbe de ponte suit une montée en production réaliste (~3 semaines pour
 * atteindre le pic), avec volontairement :
 *   - deux journées sans saisie  → déclenche l'alerte « pas de récolte »
 *   - un épisode de contre-performance → déclenche l'alerte « baisse » à 80 %
 */
import { Pool } from '@neondatabase/serverless';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * Reproduit le format de src/lib/auth/password.ts.
 * Dupliqué ici volontairement : ce script est en .mjs et tourne hors du
 * bundle Next, il ne peut pas importer un module TypeScript.
 */
async function hacher(motDePasse) {
  const sel = randomBytes(16);
  const cle = await scryptAsync(motDePasse.normalize('NFKC'), sel, 64, {
    N: 65_536, r: 8, p: 1, maxmem: 144 * 1024 * 1024,
  });
  return ['scrypt', 65_536, 8, 1, sel.toString('base64url'), cle.toString('base64url')].join('$');
}

// Mot de passe de DÉMONSTRATION uniquement. À changer avant toute mise en
// production : il est en clair dans un fichier versionné.
const MOT_DE_PASSE_DEMO = 'demo-pondeuse-2026';

const AUJOURDHUI = '2026-07-20';
const DATE_INTRO = '2026-01-15';
const DEBUT_PONTE = '2026-05-21';
const EFFECTIF_INITIAL = 500;

// --- Générateur pseudo-aléatoire à graine fixe (LCG) ---
let graine = 42;
const alea = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648);
const entre = (min, max) => min + alea() * (max - min);

// --- Dates ---
const jourSuivant = (d, n = 1) => {
  const [a, m, j] = d.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
};
const ecart = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const jours = [];
for (let d = DEBUT_PONTE; d <= AUJOURDHUI; d = jourSuivant(d)) jours.push(d);

/** Taux de ponte attendu : montée sur ~21 jours, plateau à ~92 %, léger déclin. */
function tauxAttendu(jourDePonte) {
  const montee = Math.min(1, jourDePonte / 21);
  return 0.25 + (0.92 - 0.25) * montee * montee;
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query('BEGIN');

  const { rows: [ferme] } = await client.query(
    `INSERT INTO fermes (nom, localisation, telephone)
     VALUES ('Ferme Avicole de Kati', 'Kati, Koulikoro', '+223 00 00 00 00') RETURNING id`,
  );

  await client.query(
    `INSERT INTO users (ferme_id, email, nom_complet, password_hash, role)
     VALUES ($1, 'mariam.dembele@modenamali.com', 'Mariam Dembélé', $2, 'proprietaire')`,
    [ferme.id, await hacher(MOT_DE_PASSE_DEMO)],
  );

  // Second compte, pour vérifier que le rôle « lecture » bloque bien la saisie.
  await client.query(
    `INSERT INTO users (ferme_id, email, nom_complet, password_hash, role)
     VALUES ($1, 'lecture@modenamali.com', 'Compte lecture seule', $2, 'lecture')`,
    [ferme.id, await hacher(MOT_DE_PASSE_DEMO)],
  );

  // --- Tarifs de référence, historisés ---
  await client.query(
    `INSERT INTO tarifs_reference (ferme_id, type_article, unite, libelle, prix, date_debut, date_fin) VALUES
       ($1,'oeuf','alveole','Alvéole de 30 œufs', 2800, '2026-05-01', '2026-07-01'),
       ($1,'oeuf','alveole','Alvéole de 30 œufs', 3100, '2026-07-01', NULL),
       ($1,'poule_reforme','tete','Poule de réforme', 3500, '2026-01-01', NULL),
       ($1,'poule_vive','tete','Poule prête à pondre', 5000, '2026-01-01', NULL)`,
    [ferme.id],
  );

  const { rows: [bande] } = await client.query(
    `INSERT INTO bandes (ferme_id, code, nom, date_introduction, effectif_initial,
                         date_debut_ponte, souche, notes)
     VALUES ($1, 'B-2026-01', 'Première bande 2026', $2, $3, $4, 'ISA Brown',
             'Bande pilote — poulailler nord')
     RETURNING id`,
    [ferme.id, DATE_INTRO, EFFECTIF_INITIAL, DEBUT_PONTE],
  );

  // --- Mortalités réparties sur tout le cycle ---
  const mortalites = [
    ['2026-01-22', 4, 'Stress de transport'],
    ['2026-02-11', 3, 'Coccidiose suspectée'],
    ['2026-03-05', 2, 'Cause indéterminée'],
    ['2026-04-18', 5, 'Coup de chaleur'],
    ['2026-05-30', 2, 'Cause indéterminée'],
    ['2026-06-14', 3, 'Picage'],
    ['2026-07-02', 2, 'Cause indéterminée'],
  ];
  for (const [date, q, motif] of mortalites) {
    await client.query(
      `INSERT INTO mouvements_effectif (bande_id, date_mouvement, type, quantite, motif)
       VALUES ($1, $2, 'mortalite', $3, $4)`,
      [bande.id, date, q, motif],
    );
  }

  // --- Une vente de poules à un autre aviculteur ---
  await client.query(
    `INSERT INTO mouvements_effectif (bande_id, date_mouvement, type, quantite,
                                      prix_unitaire, montant_total, tiers)
     VALUES ($1, '2026-06-20', 'vente_poule', 30, 5000, 150000, 'Coopérative de Kati')`,
    [bande.id],
  );

  // --- Consommation personnelle ---
  await client.query(
    `INSERT INTO mouvements_effectif (bande_id, date_mouvement, type, quantite, motif)
     VALUES ($1, '2026-07-05', 'consommation_perso', 4, 'Fête familiale')`,
    [bande.id],
  );

  // --- Récoltes quotidiennes ---
  const SANS_SAISIE = new Set(['2026-07-11', '2026-07-17']); // → alerte « pas de récolte »
  const CONTRE_PERF = new Set(['2026-06-25', '2026-06-26', '2026-06-27']); // → alerte « baisse »

  let stock = 0;
  const recoltes = [];

  for (const jour of jours) {
    if (SANS_SAISIE.has(jour)) continue;

    const { rows: [e] } = await client.query(
      `SELECT fn_effectif_a_date($1, $2) AS n`, [bande.id, jour],
    );
    const effectif = Number(e.n);

    let taux = tauxAttendu(ecart(DEBUT_PONTE, jour));
    if (CONTRE_PERF.has(jour)) taux *= 0.72; // épisode de contre-performance
    taux *= entre(0.96, 1.04); // bruit quotidien

    const total = Math.max(0, Math.round(effectif * Math.min(taux, 0.98)));
    const casses = alea() < 0.35 ? Math.round(entre(1, 5)) : 0;

    // Réparti sur deux ramassages, comme au poulailler
    const matin = Math.round(total * entre(0.55, 0.68));
    const soir = total - matin;

    await client.query(
      `INSERT INTO recoltes_oeufs (bande_id, date_recolte, creneau, nombre_oeufs, oeufs_casses, unite_saisie, quantite_saisie)
       VALUES ($1,$2,'matin',$3,$4,'oeuf',$5)`,
      [bande.id, jour, matin, casses, matin],
    );
    if (soir > 0) {
      await client.query(
        `INSERT INTO recoltes_oeufs (bande_id, date_recolte, creneau, nombre_oeufs, oeufs_casses, unite_saisie, quantite_saisie)
         VALUES ($1,$2,'soir',$3,0,'oeuf',$4)`,
        [bande.id, jour, soir, soir],
      );
    }

    stock += total - casses;
    recoltes.push(jour);
  }

  // --- Ventes d'œufs tous les 3 jours, par alvéoles entières ---
  for (let i = 2; i < recoltes.length; i += 3) {
    const jour = recoltes[i];
    const alveolesDispo = Math.floor(stock / 30);
    if (alveolesDispo < 3) continue;

    // On garde une petite réserve : vendre tout le stock chaque fois serait irréaliste
    const alveoles = Math.max(1, Math.floor(alveolesDispo * entre(0.7, 0.9)));
    const oeufs = alveoles * 30;
    const prixAlveole = jour < '2026-07-01' ? 2800 : 3100;

    await client.query(
      `INSERT INTO sorties_oeufs (bande_id, date_sortie, type, nombre_oeufs, unite_saisie,
                                  quantite_saisie, prix_unitaire, montant_total, client)
       VALUES ($1,$2,'vente',$3,'alveole',$4,$5,$6,$7)`,
      [bande.id, jour, oeufs, alveoles, prixAlveole, alveoles * prixAlveole,
       ['Marché de Kati', 'Boutique Diarra', 'Restaurant Le Baobab'][i % 3]],
    );
    stock -= oeufs;
  }

  // --- Consommation personnelle d'œufs ---
  for (const jour of ['2026-06-08', '2026-07-06']) {
    if (stock >= 60) {
      await client.query(
        `INSERT INTO sorties_oeufs (bande_id, date_sortie, type, nombre_oeufs, unite_saisie, quantite_saisie)
         VALUES ($1,$2,'consommation_perso',60,'alveole',2)`,
        [bande.id, jour],
      );
      stock -= 60;
    }
  }

  // --- Alimentation : hebdomadaire, aliment adapté à l'âge ---
  let semaine = 0;
  for (let d = DATE_INTRO; d <= AUJOURDHUI; d = jourSuivant(d, 7)) {
    const age = ecart(DATE_INTRO, d);
    const type = age < 42 ? 'demarrage' : age < 119 ? 'croissance' : 'ponte';
    const prixKg = type === 'demarrage' ? 420 : type === 'croissance' ? 380 : 350;
    // Consommation journalière RÉELLE d'une pondeuse, en kg :
    // ~30 g en démarrage, ~70 g en croissance, ~115 g en ponte.
    // (Se tromper d'un facteur 10 ici fausse toute l'analyse de rentabilité,
    //  l'aliment représentant l'essentiel des charges d'un élevage.)
    const kgParPoule = type === 'demarrage' ? 0.030 : type === 'croissance' ? 0.070 : 0.115;

    const { rows: [e] } = await client.query(`SELECT fn_effectif_a_date($1,$2) AS n`, [bande.id, d]);
    const kg = Math.round(Number(e.n) * kgParPoule * 7);

    await client.query(
      `INSERT INTO alimentations (bande_id, date_conso, type_aliment, libelle, quantite_kg,
                                  prix_unitaire_kg, montant_total, fournisseur)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'Provende du Sahel')`,
      [bande.id, d, type, `Aliment ${type} — semaine ${++semaine}`, kg, prixKg, kg * prixKg],
    );
  }

  // --- Prophylaxie ---
  const interventions = [
    ['2026-01-16', 'vaccin', 'Vaccin Newcastle (HB1)', 'eau de boisson', 12000, 'realise', '2026-01-16'],
    ['2026-01-30', 'vaccin', 'Vaccin Gumboro', 'eau de boisson', 15000, 'realise', '2026-01-30'],
    ['2026-02-20', 'deparasitage', 'Déparasitage interne', 'Lévamisole', 8000, 'realise', '2026-02-21'],
    ['2026-03-15', 'vaccin', 'Rappel Newcastle', 'eau de boisson', 12000, 'realise', '2026-03-15'],
    ['2026-04-10', 'vitamine', 'Complexe vitaminé pré-ponte', 'AD3E', 9500, 'realise', '2026-04-10'],
    ['2026-05-18', 'desinfection', 'Désinfection du poulailler', 'Virkon S', 18000, 'realise', '2026-05-18'],
    ['2026-06-25', 'traitement', 'Traitement anti-picage', 'Anti-stress', 11000, 'realise', '2026-06-26'],
    ['2026-07-25', 'vaccin', 'Rappel Newcastle', 'eau de boisson', 12000, 'planifie', null],
    ['2026-08-10', 'deparasitage', 'Déparasitage trimestriel', 'Lévamisole', 8000, 'planifie', null],
  ];
  for (const [prevue, type, libelle, produit, cout, statut, realisee] of interventions) {
    await client.query(
      `INSERT INTO interventions_sante (bande_id, date_prevue, type, libelle, produit, cout, statut, date_realisee)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [bande.id, prevue, type, libelle, produit, cout, statut, realisee],
    );
  }

  // --- Autres dépenses ---
  const depenses = [
    ['2026-01-15', 'equipement', 'Mangeoires et abreuvoirs', 85000, bande.id],
    ['2026-01-15', 'litiere', 'Copeaux de bois — installation', 25000, bande.id],
    ['2026-02-01', 'main_oeuvre', 'Gardien — février', 50000, bande.id],
    ['2026-03-01', 'main_oeuvre', 'Gardien — mars', 50000, bande.id],
    ['2026-04-01', 'main_oeuvre', 'Gardien — avril', 50000, bande.id],
    ['2026-04-22', 'reparation', 'Réparation du toit', 35000, bande.id],
    ['2026-05-01', 'main_oeuvre', 'Gardien — mai', 50000, bande.id],
    ['2026-05-15', 'equipement', 'Pondoirs supplémentaires', 60000, bande.id],
    ['2026-06-01', 'main_oeuvre', 'Gardien — juin', 50000, bande.id],
    ['2026-06-10', 'litiere', 'Renouvellement litière', 20000, bande.id],
    ['2026-07-01', 'main_oeuvre', 'Gardien — juillet', 50000, bande.id],
    ['2026-07-01', 'energie', 'Électricité — trimestre', 45000, null],
    ['2026-07-08', 'transport', 'Livraison marché', 15000, bande.id],
  ];
  for (const [date, cat, libelle, montant, bId] of depenses) {
    await client.query(
      `INSERT INTO depenses (ferme_id, bande_id, date_depense, categorie, libelle, montant)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [ferme.id, bId, date, cat, libelle, montant],
    );
  }

  await client.query('COMMIT');

  const { rows: [r] } = await client.query(
    `SELECT (SELECT effectif_actuel FROM v_bande_effectif WHERE bande_id=$1) AS effectif,
            (SELECT stock_actuel   FROM v_bande_stock_oeufs WHERE bande_id=$1) AS stock,
            (SELECT count(*) FROM recoltes_oeufs WHERE bande_id=$1) AS nb_recoltes,
            (SELECT count(*) FROM v_production_journaliere
              WHERE bande_id=$1 AND (alerte_absence_recolte OR alerte_baisse_production)) AS nb_alertes`,
    [bande.id],
  );

  console.log('✔ Jeu de démonstration créé');
  console.log(`  Ferme     : Ferme Avicole de Kati`);
  console.log(`  Bande     : B-2026-01 — ${EFFECTIF_INITIAL} poules introduites le ${DATE_INTRO}`);
  console.log(`  Effectif  : ${r.effectif} poules`);
  console.log(`  Stock     : ${r.stock} œufs (${Math.floor(r.stock / 30)} alvéoles)`);
  console.log(`  Récoltes  : ${r.nb_recoltes} saisies`);
  console.log(`  Alertes   : ${r.nb_alertes} jours en alerte`);
  console.log('');
  console.log('  Comptes de démonstration :');
  console.log(`    mariam.dembele@modenamali.com  (propriétaire)  ${MOT_DE_PASSE_DEMO}`);
  console.log(`    lecture@modenamali.com         (lecture seule) ${MOT_DE_PASSE_DEMO}`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('✘', err.message);
  if (err.detail) console.error('  détail :', err.detail);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
