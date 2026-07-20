/**
 * Vérifie que les règles métier sont réellement appliquées PAR LA BASE.
 *
 * Tout se déroule dans une transaction annulée à la fin : la base reste vide.
 * L'objectif n'est pas de vérifier que le SQL s'exécute (db-push le fait),
 * mais que les triggers et contraintes REFUSENT bien ce qu'ils doivent refuser.
 */
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

let reussis = 0;
let echoues = 0;

function verifier(nom, condition, detail = '') {
  if (condition) {
    console.log(`  ✔ ${nom}`);
    reussis++;
  } else {
    console.log(`  ✘ ${nom}${detail ? ` — ${detail}` : ''}`);
    echoues++;
  }
}

/** Attend que la requête échoue. Renvoie le message d'erreur, ou null si elle a réussi. */
async function doitEchouer(sql, params = []) {
  await client.query('SAVEPOINT sp');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT sp');
    return null; // n'aurait pas dû passer
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT sp');
    return err.message;
  }
}

try {
  await client.query('BEGIN');

  // ---------- Inventaire de l'objet créé ----------
  console.log('\n[Structure]');
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1`,
  );
  const { rows: vues } = await client.query(
    `SELECT table_name FROM information_schema.views WHERE table_schema='public' ORDER BY 1`,
  );
  const { rows: fonctions } = await client.query(
    `SELECT routine_name FROM information_schema.routines
     WHERE routine_schema='public' AND routine_name LIKE 'fn_%' ORDER BY 1`,
  );
  // 13 = fermes, users, tarifs_reference, bandes, mouvements_effectif, recoltes_oeufs,
  //      sorties_oeufs, alimentations, modeles_prophylaxie, modeles_prophylaxie_lignes,
  //      interventions_sante, depenses, journal_suppressions
  verifier(`${tables.length} tables créées`, tables.length === 13, tables.map(t=>t.table_name).join(', '));
  verifier(`${vues.length} vues créées`, vues.length === 4, vues.map(v=>v.table_name).join(', '));
  verifier(`${fonctions.length} fonctions métier`, fonctions.length === 3, fonctions.map(f=>f.routine_name).join(', '));

  // ---------- Jeu d'essai ----------
  const { rows: [ferme] } = await client.query(
    `INSERT INTO fermes (nom, localisation) VALUES ('Ferme Test', 'Bamako') RETURNING id`,
  );
  const { rows: [bande] } = await client.query(
    `INSERT INTO bandes (ferme_id, code, nom, date_introduction, effectif_initial, date_debut_ponte)
     VALUES ($1, 'B-TEST-01', 'Bande de test', '2026-01-01', 500, '2026-05-01') RETURNING id`,
    [ferme.id],
  );

  // ---------- Comptes utilisateurs ----------
  console.log('\n[Règle : unicité des emails, insensible à la casse]');
  await client.query(
    `INSERT INTO users (ferme_id, email, nom_complet, password_hash, role)
     VALUES ($1, 'mariam@example.ml', 'Mariam D.', '$argon2id$factice', 'proprietaire')`,
    [ferme.id],
  );
  const errCasse = await doitEchouer(
    `INSERT INTO users (ferme_id, email, nom_complet, password_hash)
     VALUES ($1, 'MARIAM@Example.ML', 'Doublon', '$argon2id$factice')`, [ferme.id],
  );
  verifier('même email en majuscules REFUSÉ', errCasse !== null, errCasse ?? 'doublon accepté !');

  const errMail = await doitEchouer(
    `INSERT INTO users (ferme_id, email, nom_complet, password_hash)
     VALUES ($1, 'pas-un-email', 'Test', '$argon2id$factice')`, [ferme.id],
  );
  verifier('email malformé REFUSÉ', errMail !== null, errMail ?? 'accepté !');

  // ---------- Contrôle de stock d'œufs ----------
  console.log('\n[Règle : interdiction de vendre plus que le stock]');
  await client.query(
    `INSERT INTO recoltes_oeufs (bande_id, date_recolte, creneau, nombre_oeufs, quantite_saisie, unite_saisie)
     VALUES ($1, '2026-05-10', 'matin', 400, 400, 'oeuf')`, [bande.id],
  );

  const { rows: [s1] } = await client.query(
    `SELECT stock_actuel FROM v_bande_stock_oeufs WHERE bande_id = $1`, [bande.id],
  );
  verifier('stock = 400 après récolte', Number(s1.stock_actuel) === 400, `obtenu ${s1.stock_actuel}`);

  const errVente = await doitEchouer(
    `INSERT INTO sorties_oeufs (bande_id, date_sortie, type, nombre_oeufs, quantite_saisie, unite_saisie, montant_total)
     VALUES ($1, '2026-05-11', 'vente', 401, 401, 'oeuf', 40100)`, [bande.id],
  );
  verifier('vente de 401 œufs sur 400 REFUSÉE', errVente !== null && /Stock insuffisant/.test(errVente),
    errVente ?? 'la vente est passée !');

  await client.query(
    `INSERT INTO sorties_oeufs (bande_id, date_sortie, type, nombre_oeufs, quantite_saisie, unite_saisie, montant_total)
     VALUES ($1, '2026-05-11', 'vente', 400, 400, 'oeuf', 40000)`, [bande.id],
  );
  const { rows: [s2] } = await client.query(
    `SELECT stock_actuel FROM v_bande_stock_oeufs WHERE bande_id = $1`, [bande.id],
  );
  verifier('vente de la totalité (400) ACCEPTÉE, stock à 0', Number(s2.stock_actuel) === 0, `obtenu ${s2.stock_actuel}`);

  // ---------- Suppression d'une récolte déjà vendue ----------
  console.log('\n[Règle : une récolte déjà vendue ne peut pas être retirée]');
  const { rows: [rec] } = await client.query(
    `SELECT id FROM recoltes_oeufs WHERE bande_id = $1 AND date_recolte = '2026-05-10'`,
    [bande.id],
  );
  const errSuppr = await doitEchouer(`DELETE FROM recoltes_oeufs WHERE id = $1`, [rec.id]);
  verifier('suppression de la récolte entièrement vendue REFUSÉE',
    errSuppr !== null && /déjà sortis du stock/.test(errSuppr),
    errSuppr ?? 'suppression acceptée — le stock serait négatif !');

  const errBaisse = await doitEchouer(
    `UPDATE recoltes_oeufs SET nombre_oeufs = 100 WHERE id = $1`, [rec.id],
  );
  verifier('révision à la baisse sous le stock sorti REFUSÉE',
    errBaisse !== null, errBaisse ?? 'modification acceptée !');

  // Une hausse reste évidemment possible
  await client.query(`UPDATE recoltes_oeufs SET nombre_oeufs = 500 WHERE id = $1`, [rec.id]);
  const { rows: [s3] } = await client.query(
    `SELECT stock_actuel FROM v_bande_stock_oeufs WHERE bande_id = $1`, [bande.id],
  );
  verifier('révision à la hausse acceptée, stock à 100', Number(s3.stock_actuel) === 100,
    `obtenu ${s3.stock_actuel}`);
  await client.query(`UPDATE recoltes_oeufs SET nombre_oeufs = 400 WHERE id = $1`, [rec.id]);

  // ---------- Contrôle de l'effectif ----------
  console.log('\n[Règle : l’effectif ne peut pas devenir négatif]');
  await client.query(
    `INSERT INTO mouvements_effectif (bande_id, date_mouvement, type, quantite)
     VALUES ($1, '2026-02-01', 'mortalite', 20)`, [bande.id],
  );
  const { rows: [e1] } = await client.query(
    `SELECT effectif_actuel, taux_mortalite_pct FROM v_bande_effectif WHERE bande_id = $1`, [bande.id],
  );
  verifier('effectif = 480 après 20 mortalités', Number(e1.effectif_actuel) === 480, `obtenu ${e1.effectif_actuel}`);
  verifier('taux de mortalité = 4 %', Number(e1.taux_mortalite_pct) === 4, `obtenu ${e1.taux_mortalite_pct}`);

  const errSortie = await doitEchouer(
    `INSERT INTO mouvements_effectif (bande_id, date_mouvement, type, quantite, montant_total)
     VALUES ($1, '2026-06-01', 'vente_poule', 481, 481000)`, [bande.id],
  );
  verifier('vente de 481 poules sur 480 REFUSÉE', errSortie !== null && /Effectif insuffisant/.test(errSortie),
    errSortie ?? 'la vente est passée !');

  // ---------- Tarifs : non-chevauchement ----------
  console.log('\n[Règle : deux tarifs ne peuvent pas se chevaucher]');
  await client.query(
    `INSERT INTO tarifs_reference (ferme_id, type_article, unite, prix, date_debut, date_fin)
     VALUES ($1, 'oeuf', 'alveole', 3000, '2026-01-01', '2026-07-01')`, [ferme.id],
  );
  const errTarif = await doitEchouer(
    `INSERT INTO tarifs_reference (ferme_id, type_article, unite, prix, date_debut, date_fin)
     VALUES ($1, 'oeuf', 'alveole', 3500, '2026-06-01', NULL)`, [ferme.id],
  );
  verifier('tarif chevauchant REFUSÉ', errTarif !== null, errTarif ?? 'le tarif est passé !');

  await client.query(
    `INSERT INTO tarifs_reference (ferme_id, type_article, unite, prix, date_debut, date_fin)
     VALUES ($1, 'oeuf', 'alveole', 3500, '2026-07-01', NULL)`, [ferme.id],
  );
  const { rows: [t1] } = await client.query(
    `SELECT fn_tarif_a_date($1,'oeuf','alveole','2026-03-15') AS p1,
            fn_tarif_a_date($1,'oeuf','alveole','2026-08-15') AS p2`, [ferme.id],
  );
  verifier('tarif au 15/03 = 3000', Number(t1.p1) === 3000, `obtenu ${t1.p1}`);
  verifier('tarif au 15/08 = 3500', Number(t1.p2) === 3500, `obtenu ${t1.p2}`);

  const errUnite = await doitEchouer(
    `INSERT INTO tarifs_reference (ferme_id, type_article, unite, prix, date_debut)
     VALUES ($1, 'poule_reforme', 'alveole', 2500, '2026-01-01')`, [ferme.id],
  );
  verifier('poule tarifée « à l’alvéole » REFUSÉE', errUnite !== null, errUnite ?? 'accepté !');

  // ---------- Alertes dérivées ----------
  console.log('\n[Règle : alertes automatiques]');
  const { rows: [a1] } = await client.query(
    `SELECT alerte_absence_recolte, alerte_baisse_production
     FROM v_production_journaliere WHERE bande_id = $1 AND jour = '2026-05-07'`, [bande.id],
  );
  verifier('J+6 sans récolte : pas encore d’alerte', a1 && a1.alerte_absence_recolte === false);

  const { rows: [a2] } = await client.query(
    `SELECT alerte_absence_recolte FROM v_production_journaliere
     WHERE bande_id = $1 AND jour = '2026-05-08'`, [bande.id],
  );
  verifier('J+7 sans récolte : alerte déclenchée', a2 && a2.alerte_absence_recolte === true);

  const { rows: [a3] } = await client.query(
    `SELECT oeufs_recoltes, effectif_jour, taux_ponte_pct, alerte_absence_recolte, alerte_baisse_production
     FROM v_production_journaliere WHERE bande_id = $1 AND jour = '2026-05-10'`, [bande.id],
  );
  verifier('jour avec récolte : pas d’alerte d’absence', a3.alerte_absence_recolte === false);
  verifier('400 œufs / 480 poules = 83,33 % → pas d’alerte de baisse',
    a3.alerte_baisse_production === false, `taux ${a3.taux_ponte_pct} %`);

  // Récolte faible PENDANT la montée en ponte (J+11) : aucune alerte.
  // Être sous 80 % y est normal — alerter noierait les vraies chutes.
  await client.query(
    `INSERT INTO recoltes_oeufs (bande_id, date_recolte, creneau, nombre_oeufs, quantite_saisie, unite_saisie)
     VALUES ($1, '2026-05-12', 'matin', 300, 10, 'alveole')`, [bande.id],
  );
  const { rows: [a4] } = await client.query(
    `SELECT taux_ponte_pct, en_montee_ponte, alerte_baisse_production
     FROM v_production_journaliere WHERE bande_id = $1 AND jour = '2026-05-12'`, [bande.id],
  );
  verifier('62,5 % pendant la montée en ponte : PAS d’alerte',
    a4.en_montee_ponte === true && a4.alerte_baisse_production === false,
    `taux ${a4.taux_ponte_pct} %, montée ${a4.en_montee_ponte}`);

  // Même taux, mais APRÈS le pic (J+34) : l'alerte doit cette fois se déclencher.
  await client.query(
    `INSERT INTO recoltes_oeufs (bande_id, date_recolte, creneau, nombre_oeufs, quantite_saisie, unite_saisie)
     VALUES ($1, '2026-06-04', 'matin', 300, 10, 'alveole')`, [bande.id],
  );
  const { rows: [a5] } = await client.query(
    `SELECT taux_ponte_pct, en_montee_ponte, alerte_baisse_production
     FROM v_production_journaliere WHERE bande_id = $1 AND jour = '2026-06-04'`, [bande.id],
  );
  verifier('62,5 % après le pic de ponte : alerte de baisse',
    a5.en_montee_ponte === false && a5.alerte_baisse_production === true,
    `taux ${a5.taux_ponte_pct} %, montée ${a5.en_montee_ponte}`);

  // nb_saisies doit distinguer « 0 œuf » de « aucune saisie »
  const { rows: [a6] } = await client.query(
    `SELECT nb_saisies FROM v_production_journaliere
     WHERE bande_id = $1 AND jour = '2026-05-09'`, [bande.id],
  );
  verifier('jour sans saisie : nb_saisies = 0', Number(a6.nb_saisies) === 0, `obtenu ${a6.nb_saisies}`);

  // ---------- Journal des suppressions ----------
  console.log('\n[Règle : toute suppression laisse une trace]');
  const { rows: [dep] } = await client.query(
    `INSERT INTO depenses (ferme_id, bande_id, date_depense, categorie, libelle, montant)
     VALUES ($1, $2, '2026-03-01', 'transport', 'Livraison test', 12000) RETURNING id`,
    [ferme.id, bande.id],
  );

  // Reproduit ce que fait l'action serveur : relire, supprimer, archiver.
  const { rows: [avant] } = await client.query(
    `SELECT to_jsonb(d) AS contenu FROM depenses d WHERE d.id = $1`, [dep.id],
  );
  await client.query(`DELETE FROM depenses WHERE id = $1`, [dep.id]);
  await client.query(
    `INSERT INTO journal_suppressions (ferme_id, table_source, ligne_id, contenu, supprime_par)
     VALUES ($1, 'depenses', $2, $3::jsonb, NULL)`,
    [ferme.id, dep.id, JSON.stringify(avant.contenu)],
  );

  const { rows: [trace] } = await client.query(
    `SELECT table_source, contenu->>'libelle' AS libelle, contenu->>'montant' AS montant
     FROM journal_suppressions WHERE ligne_id = $1`, [dep.id],
  );
  verifier('la ligne supprimée est archivée intégralement',
    trace && trace.table_source === 'depenses' && trace.libelle === 'Livraison test'
      && Number(trace.montant) === 12000,
    JSON.stringify(trace));

  const { rows: partie } = await client.query(`SELECT 1 FROM depenses WHERE id = $1`, [dep.id]);
  verifier('la ligne a bien disparu de la table', partie.length === 0);

  // ---------- Cloisonnement entre fermes ----------
  console.log('\n[Règle : cloisonnement des exploitations]');
  const { rows: [ferme2] } = await client.query(
    `INSERT INTO fermes (nom) VALUES ('Autre Ferme') RETURNING id`,
  );
  await client.query(
    `INSERT INTO bandes (ferme_id, code, date_introduction, effectif_initial)
     VALUES ($1, 'B-TEST-01', '2026-01-01', 200)`, [ferme2.id],
  );
  verifier('même code de bande réutilisable dans une autre ferme', true);

  const errDep = await doitEchouer(
    `INSERT INTO depenses (ferme_id, bande_id, date_depense, categorie, libelle, montant)
     VALUES ($1, $2, '2026-03-01', 'transport', 'Test', 5000)`, [ferme2.id, bande.id],
  );
  verifier('dépense citant la bande d’une AUTRE ferme REFUSÉE',
    errDep !== null && /n'appartient pas/.test(errDep), errDep ?? 'accepté !');

  await client.query('ROLLBACK');
  console.log('\n(transaction annulée — la base est restée vide)');
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\nErreur inattendue :', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

console.log(`\n${reussis} vérifications réussies, ${echoues} échouées`);
if (echoues > 0) process.exitCode = 1;
