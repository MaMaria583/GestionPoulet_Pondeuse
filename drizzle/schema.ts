import { pgTable, index, foreignKey, check, uuid, text, numeric, date, timestamp, char, boolean, uniqueIndex, unique, integer, pgView, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const categorieDepense = pgEnum("categorie_depense", ['equipement', 'main_oeuvre', 'energie', 'eau', 'transport', 'litiere', 'reparation', 'loyer', 'autre'])
export const creneauRecolte = pgEnum("creneau_recolte", ['matin', 'midi', 'soir'])
export const roleUtilisateur = pgEnum("role_utilisateur", ['proprietaire', 'gestionnaire', 'saisie', 'lecture'])
export const statutBande = pgEnum("statut_bande", ['active', 'cloturee'])
export const statutIntervention = pgEnum("statut_intervention", ['planifie', 'realise', 'annule'])
export const typeAliment = pgEnum("type_aliment", ['demarrage', 'croissance', 'ponte', 'complement', 'autre'])
export const typeArticleTarif = pgEnum("type_article_tarif", ['oeuf', 'poule_vive', 'poule_reforme'])
export const typeIntervention = pgEnum("type_intervention", ['vaccin', 'traitement', 'vitamine', 'deparasitage', 'desinfection', 'autre'])
export const typeMouvementEffectif = pgEnum("type_mouvement_effectif", ['mortalite', 'vente_poule', 'vente_reforme', 'consommation_perso', 'sortie_diverse'])
export const typeSortieOeuf = pgEnum("type_sortie_oeuf", ['vente', 'consommation_perso', 'casse', 'don', 'perte'])
export const uniteSaisie = pgEnum("unite_saisie", ['oeuf', 'alveole'])
export const uniteTarif = pgEnum("unite_tarif", ['oeuf', 'alveole', 'tete'])


export const tarifsReference = pgTable("tarifs_reference", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fermeId: uuid("ferme_id").notNull(),
	typeArticle: typeArticleTarif("type_article").notNull(),
	unite: uniteTarif().notNull(),
	libelle: text(),
	prix: numeric({ precision: 12, scale:  2 }).notNull(),
	dateDebut: date("date_debut").notNull(),
	dateFin: date("date_fin"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_tarifs_lookup").using("btree", table.fermeId.asc().nullsLast().op("uuid_ops"), table.typeArticle.asc().nullsLast().op("date_ops"), table.unite.asc().nullsLast().op("date_ops"), table.dateDebut.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.fermeId],
			foreignColumns: [fermes.id],
			name: "tarifs_reference_ferme_id_fkey"
		}).onDelete("cascade"),
	check("chk_periode_tarif", sql`(date_fin IS NULL) OR (date_fin > date_debut)`),
	check("chk_unite_coherente", sql`((type_article = 'oeuf'::type_article_tarif) AND (unite = ANY (ARRAY['oeuf'::unite_tarif, 'alveole'::unite_tarif]))) OR ((type_article <> 'oeuf'::type_article_tarif) AND (unite = 'tete'::unite_tarif))`),
	check("tarifs_reference_prix_check", sql`prix >= (0)::numeric`),
]);

export const fermes = pgTable("fermes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	nom: text().notNull(),
	localisation: text(),
	devise: char({ length: 3 }).default('XOF').notNull(),
	telephone: text(),
	actif: boolean().default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fermeId: uuid("ferme_id").notNull(),
	email: text().notNull(),
	nomComplet: text("nom_complet").notNull(),
	passwordHash: text("password_hash").notNull(),
	role: roleUtilisateur().default('saisie').notNull(),
	actif: boolean().default(true).notNull(),
	derniereConnexion: timestamp("derniere_connexion", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_users_ferme").using("btree", table.fermeId.asc().nullsLast().op("uuid_ops")).where(sql`actif`),
	uniqueIndex("users_email_unique").using("btree", sql`lower(email)`),
	foreignKey({
			columns: [table.fermeId],
			foreignColumns: [fermes.id],
			name: "users_ferme_id_fkey"
		}).onDelete("cascade"),
	check("chk_email_format", sql`email ~~ '%_@_%._%'::text`),
]);

export const bandes = pgTable("bandes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fermeId: uuid("ferme_id").notNull(),
	code: text().notNull(),
	nom: text(),
	dateIntroduction: date("date_introduction").notNull(),
	effectifInitial: integer("effectif_initial").notNull(),
	dateDebutPonte: date("date_debut_ponte"),
	statut: statutBande().default('active').notNull(),
	dateCloture: date("date_cloture"),
	souche: text(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_bandes_actives").using("btree", table.fermeId.asc().nullsLast().op("uuid_ops")).where(sql`(statut = 'active'::statut_bande)`),
	index("idx_bandes_ferme").using("btree", table.fermeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.fermeId],
			foreignColumns: [fermes.id],
			name: "bandes_ferme_id_fkey"
		}).onDelete("cascade"),
	unique("bandes_code_unique").on(table.code, table.fermeId),
	check("bandes_effectif_initial_check", sql`effectif_initial > 0`),
	check("chk_cloture_coherente", sql`(statut = 'cloturee'::statut_bande) = (date_cloture IS NOT NULL)`),
	check("chk_ponte_apres_intro", sql`(date_debut_ponte IS NULL) OR (date_debut_ponte >= date_introduction)`),
]);

export const mouvementsEffectif = pgTable("mouvements_effectif", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bandeId: uuid("bande_id").notNull(),
	dateMouvement: date("date_mouvement").notNull(),
	type: typeMouvementEffectif().notNull(),
	quantite: integer().notNull(),
	prixUnitaire: numeric("prix_unitaire", { precision: 12, scale:  2 }),
	montantTotal: numeric("montant_total", { precision: 12, scale:  2 }),
	tiers: text(),
	motif: text(),
	notes: text(),
	tarifId: uuid("tarif_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_mvt_effectif_bande_date").using("btree", table.bandeId.asc().nullsLast().op("date_ops"), table.dateMouvement.asc().nullsLast().op("date_ops")),
	index("idx_mvt_effectif_type").using("btree", table.bandeId.asc().nullsLast().op("uuid_ops"), table.type.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.bandeId],
			foreignColumns: [bandes.id],
			name: "mouvements_effectif_bande_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "mouvements_effectif_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.tarifId],
			foreignColumns: [tarifsReference.id],
			name: "mouvements_effectif_tarif_id_fkey"
		}).onDelete("set null"),
	check("chk_montant_si_vente", sql`CHECK (
CASE
    WHEN (type = ANY (ARRAY['vente_poule'::type_mouvement_effectif, 'vente_reforme'::type_mouvement_effectif])) THEN (montant_total IS NOT NULL)
    ELSE true
END)`),
	check("mouvements_effectif_montant_total_check", sql`montant_total >= (0)::numeric`),
	check("mouvements_effectif_prix_unitaire_check", sql`prix_unitaire >= (0)::numeric`),
	check("mouvements_effectif_quantite_check", sql`quantite > 0`),
]);

export const recoltesOeufs = pgTable("recoltes_oeufs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bandeId: uuid("bande_id").notNull(),
	dateRecolte: date("date_recolte").notNull(),
	creneau: creneauRecolte().default('matin').notNull(),
	nombreOeufs: integer("nombre_oeufs").notNull(),
	oeufsCasses: integer("oeufs_casses").default(0).notNull(),
	uniteSaisie: uniteSaisie("unite_saisie").default('oeuf').notNull(),
	quantiteSaisie: numeric("quantite_saisie", { precision: 10, scale:  2 }).notNull(),
	notes: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_recoltes_bande_date").using("btree", table.bandeId.asc().nullsLast().op("uuid_ops"), table.dateRecolte.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.bandeId],
			foreignColumns: [bandes.id],
			name: "recoltes_oeufs_bande_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "recoltes_oeufs_created_by_fkey"
		}).onDelete("set null"),
	unique("recolte_unique_par_creneau").on(table.bandeId, table.creneau, table.dateRecolte),
	check("chk_casses_inferieurs", sql`oeufs_casses <= nombre_oeufs`),
	check("recoltes_oeufs_nombre_oeufs_check", sql`nombre_oeufs >= 0`),
	check("recoltes_oeufs_oeufs_casses_check", sql`oeufs_casses >= 0`),
]);

export const sortiesOeufs = pgTable("sorties_oeufs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bandeId: uuid("bande_id").notNull(),
	dateSortie: date("date_sortie").notNull(),
	type: typeSortieOeuf().notNull(),
	nombreOeufs: integer("nombre_oeufs").notNull(),
	uniteSaisie: uniteSaisie("unite_saisie").default('alveole').notNull(),
	quantiteSaisie: numeric("quantite_saisie", { precision: 10, scale:  2 }).notNull(),
	prixUnitaire: numeric("prix_unitaire", { precision: 12, scale:  2 }),
	montantTotal: numeric("montant_total", { precision: 12, scale:  2 }),
	client: text(),
	notes: text(),
	tarifId: uuid("tarif_id"),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_sorties_bande_date").using("btree", table.bandeId.asc().nullsLast().op("date_ops"), table.dateSortie.desc().nullsFirst().op("date_ops")),
	index("idx_sorties_type").using("btree", table.bandeId.asc().nullsLast().op("uuid_ops"), table.type.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.bandeId],
			foreignColumns: [bandes.id],
			name: "sorties_oeufs_bande_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "sorties_oeufs_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.tarifId],
			foreignColumns: [tarifsReference.id],
			name: "sorties_oeufs_tarif_id_fkey"
		}).onDelete("set null"),
	check("chk_montant_si_vente_oeuf", sql`CHECK (
CASE
    WHEN (type = 'vente'::type_sortie_oeuf) THEN (montant_total IS NOT NULL)
    ELSE true
END)`),
	check("sorties_oeufs_montant_total_check", sql`montant_total >= (0)::numeric`),
	check("sorties_oeufs_nombre_oeufs_check", sql`nombre_oeufs > 0`),
	check("sorties_oeufs_prix_unitaire_check", sql`prix_unitaire >= (0)::numeric`),
]);

export const alimentations = pgTable("alimentations", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bandeId: uuid("bande_id").notNull(),
	dateConso: date("date_conso").notNull(),
	typeAliment: typeAliment("type_aliment").notNull(),
	libelle: text(),
	quantiteKg: numeric("quantite_kg", { precision: 10, scale:  2 }).notNull(),
	prixUnitaireKg: numeric("prix_unitaire_kg", { precision: 12, scale:  2 }),
	montantTotal: numeric("montant_total", { precision: 12, scale:  2 }).default('0').notNull(),
	fournisseur: text(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_alim_bande_date").using("btree", table.bandeId.asc().nullsLast().op("date_ops"), table.dateConso.desc().nullsFirst().op("date_ops")),
	foreignKey({
			columns: [table.bandeId],
			foreignColumns: [bandes.id],
			name: "alimentations_bande_id_fkey"
		}).onDelete("cascade"),
	check("alimentations_montant_total_check", sql`montant_total >= (0)::numeric`),
	check("alimentations_prix_unitaire_kg_check", sql`prix_unitaire_kg >= (0)::numeric`),
	check("alimentations_quantite_kg_check", sql`quantite_kg > (0)::numeric`),
]);

export const modelesProphylaxie = pgTable("modeles_prophylaxie", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fermeId: uuid("ferme_id"),
	nom: text().notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("idx_modele_nom_ferme").using("btree", table.fermeId.asc().nullsLast().op("text_ops"), table.nom.asc().nullsLast().op("text_ops")).where(sql`(ferme_id IS NOT NULL)`),
	uniqueIndex("idx_modele_nom_system").using("btree", table.nom.asc().nullsLast().op("text_ops")).where(sql`(ferme_id IS NULL)`),
	foreignKey({
			columns: [table.fermeId],
			foreignColumns: [fermes.id],
			name: "modeles_prophylaxie_ferme_id_fkey"
		}).onDelete("cascade"),
]);

export const modelesProphylaxieLignes = pgTable("modeles_prophylaxie_lignes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	modeleId: uuid("modele_id").notNull(),
	ageJours: integer("age_jours").notNull(),
	type: typeIntervention().notNull(),
	libelle: text().notNull(),
	produit: text(),
	dosage: text(),
	voie: text(),
}, (table) => [
	index("idx_modele_lignes").using("btree", table.modeleId.asc().nullsLast().op("int4_ops"), table.ageJours.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.modeleId],
			foreignColumns: [modelesProphylaxie.id],
			name: "modeles_prophylaxie_lignes_modele_id_fkey"
		}).onDelete("cascade"),
	check("modeles_prophylaxie_lignes_age_jours_check", sql`age_jours >= 0`),
]);

export const interventionsSante = pgTable("interventions_sante", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	bandeId: uuid("bande_id").notNull(),
	datePrevue: date("date_prevue").notNull(),
	dateRealisee: date("date_realisee"),
	type: typeIntervention().notNull(),
	libelle: text().notNull(),
	produit: text(),
	dosage: text(),
	cout: numeric({ precision: 12, scale:  2 }).default('0').notNull(),
	statut: statutIntervention().default('planifie').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_interv_a_venir").using("btree", table.datePrevue.asc().nullsLast().op("date_ops")).where(sql`(statut = 'planifie'::statut_intervention)`),
	index("idx_interv_bande_date").using("btree", table.bandeId.asc().nullsLast().op("date_ops"), table.datePrevue.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.bandeId],
			foreignColumns: [bandes.id],
			name: "interventions_sante_bande_id_fkey"
		}).onDelete("cascade"),
	check("chk_realise_a_une_date", sql`(statut = 'realise'::statut_intervention) = (date_realisee IS NOT NULL)`),
	check("interventions_sante_cout_check", sql`cout >= (0)::numeric`),
]);

export const depenses = pgTable("depenses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	fermeId: uuid("ferme_id").notNull(),
	bandeId: uuid("bande_id"),
	dateDepense: date("date_depense").notNull(),
	categorie: categorieDepense().notNull(),
	libelle: text().notNull(),
	montant: numeric({ precision: 12, scale:  2 }).notNull(),
	notes: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_depenses_bande_date").using("btree", table.bandeId.asc().nullsLast().op("date_ops"), table.dateDepense.desc().nullsFirst().op("uuid_ops")),
	index("idx_depenses_ferme_date").using("btree", table.fermeId.asc().nullsLast().op("date_ops"), table.dateDepense.desc().nullsFirst().op("uuid_ops")),
	foreignKey({
			columns: [table.bandeId],
			foreignColumns: [bandes.id],
			name: "depenses_bande_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "depenses_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.fermeId],
			foreignColumns: [fermes.id],
			name: "depenses_ferme_id_fkey"
		}).onDelete("cascade"),
	check("depenses_montant_check", sql`montant >= (0)::numeric`),
]);
export const vBandeEffectif = pgView("v_bande_effectif", {	bandeId: uuid("bande_id"),
	fermeId: uuid("ferme_id"),
	code: text(),
	effectifInitial: integer("effectif_initial"),
	totalMortalites: integer("total_mortalites"),
	totalVentesPoules: integer("total_ventes_poules"),
	totalReformes: integer("total_reformes"),
	totalConsoPerso: integer("total_conso_perso"),
	totalSortiesDiverses: integer("total_sorties_diverses"),
	effectifActuel: integer("effectif_actuel"),
	tauxMortalitePct: numeric("taux_mortalite_pct"),
}).as(sql`SELECT b.id AS bande_id, b.ferme_id, b.code, b.effectif_initial, COALESCE(sum(m.quantite) FILTER (WHERE m.type = 'mortalite'::type_mouvement_effectif), 0::bigint)::integer AS total_mortalites, COALESCE(sum(m.quantite) FILTER (WHERE m.type = 'vente_poule'::type_mouvement_effectif), 0::bigint)::integer AS total_ventes_poules, COALESCE(sum(m.quantite) FILTER (WHERE m.type = 'vente_reforme'::type_mouvement_effectif), 0::bigint)::integer AS total_reformes, COALESCE(sum(m.quantite) FILTER (WHERE m.type = 'consommation_perso'::type_mouvement_effectif), 0::bigint)::integer AS total_conso_perso, COALESCE(sum(m.quantite) FILTER (WHERE m.type = 'sortie_diverse'::type_mouvement_effectif), 0::bigint)::integer AS total_sorties_diverses, (b.effectif_initial - COALESCE(sum(m.quantite), 0::bigint))::integer AS effectif_actuel, round(100.0 * COALESCE(sum(m.quantite) FILTER (WHERE m.type = 'mortalite'::type_mouvement_effectif), 0::bigint)::numeric / NULLIF(b.effectif_initial, 0)::numeric, 2) AS taux_mortalite_pct FROM bandes b LEFT JOIN mouvements_effectif m ON m.bande_id = b.id GROUP BY b.id`);

export const vBandeStockOeufs = pgView("v_bande_stock_oeufs", {	bandeId: uuid("bande_id"),
	fermeId: uuid("ferme_id"),
	totalRecolte: integer("total_recolte"),
	totalCasseRecolte: integer("total_casse_recolte"),
	totalSorti: integer("total_sorti"),
	totalVendu: integer("total_vendu"),
	stockActuel: integer("stock_actuel"),
}).as(sql`SELECT b.id AS bande_id, b.ferme_id, COALESCE(r.total_recolte, 0::bigint)::integer AS total_recolte, COALESCE(r.total_casse, 0::bigint)::integer AS total_casse_recolte, COALESCE(s.total_sorti, 0::bigint)::integer AS total_sorti, COALESCE(s.total_vendu, 0::bigint)::integer AS total_vendu, (COALESCE(r.total_recolte, 0::bigint) - COALESCE(r.total_casse, 0::bigint) - COALESCE(s.total_sorti, 0::bigint))::integer AS stock_actuel FROM bandes b LEFT JOIN ( SELECT recoltes_oeufs.bande_id, sum(recoltes_oeufs.nombre_oeufs) AS total_recolte, sum(recoltes_oeufs.oeufs_casses) AS total_casse FROM recoltes_oeufs GROUP BY recoltes_oeufs.bande_id) r ON r.bande_id = b.id LEFT JOIN ( SELECT sorties_oeufs.bande_id, sum(sorties_oeufs.nombre_oeufs) AS total_sorti, sum(sorties_oeufs.nombre_oeufs) FILTER (WHERE sorties_oeufs.type = 'vente'::type_sortie_oeuf) AS total_vendu FROM sorties_oeufs GROUP BY sorties_oeufs.bande_id) s ON s.bande_id = b.id`);

export const vProductionJournaliere = pgView("v_production_journaliere", {	bandeId: uuid("bande_id"),
	fermeId: uuid("ferme_id"),
	jour: date(),
	oeufsRecoltes: integer("oeufs_recoltes"),
	effectifJour: integer("effectif_jour"),
	tauxPontePct: numeric("taux_ponte_pct"),
	alerteAbsenceRecolte: boolean("alerte_absence_recolte"),
	alerteBaisseProduction: boolean("alerte_baisse_production"),
	enMonteePonte: boolean("en_montee_ponte"),
}).as(sql`WITH jours AS ( SELECT b.id AS bande_id, b.ferme_id, b.date_debut_ponte, d.d::date AS jour FROM bandes b CROSS JOIN LATERAL generate_series(b.date_debut_ponte::timestamp with time zone, LEAST(COALESCE(b.date_cloture, CURRENT_DATE), CURRENT_DATE)::timestamp with time zone, '1 day'::interval) d(d) WHERE b.date_debut_ponte IS NOT NULL ), prod AS ( SELECT j.bande_id, j.ferme_id, j.jour, j.date_debut_ponte, COALESCE(sum(r.nombre_oeufs), 0::bigint)::integer AS oeufs_recoltes, count(r.id) AS nb_saisies, fn_effectif_a_date(j.bande_id, j.jour) AS effectif_jour FROM jours j LEFT JOIN recoltes_oeufs r ON r.bande_id = j.bande_id AND r.date_recolte = j.jour GROUP BY j.bande_id, j.ferme_id, j.jour, j.date_debut_ponte ) SELECT bande_id, ferme_id, jour, oeufs_recoltes, effectif_jour, round(oeufs_recoltes::numeric / NULLIF(effectif_jour, 0)::numeric * 100::numeric, 2) AS taux_ponte_pct, nb_saisies = 0 AND jour >= (date_debut_ponte + 7) AS alerte_absence_recolte, nb_saisies > 0 AND jour >= (date_debut_ponte + 28) AND effectif_jour > 0 AND oeufs_recoltes::numeric < (effectif_jour::numeric * 0.80) AS alerte_baisse_production, jour < (date_debut_ponte + 28) AS en_montee_ponte FROM prod`);

export const vBandeFinances = pgView("v_bande_finances", {	bandeId: uuid("bande_id"),
	fermeId: uuid("ferme_id"),
	recettesOeufs: numeric("recettes_oeufs"),
	recettesPoules: numeric("recettes_poules"),
	coutAlimentation: numeric("cout_alimentation"),
	coutSante: numeric("cout_sante"),
	coutDivers: numeric("cout_divers"),
}).as(sql`SELECT id AS bande_id, ferme_id, COALESCE(( SELECT sum(sorties_oeufs.montant_total) AS sum FROM sorties_oeufs WHERE sorties_oeufs.bande_id = b.id AND sorties_oeufs.type = 'vente'::type_sortie_oeuf), 0::numeric) AS recettes_oeufs, COALESCE(( SELECT sum(mouvements_effectif.montant_total) AS sum FROM mouvements_effectif WHERE mouvements_effectif.bande_id = b.id AND (mouvements_effectif.type = ANY (ARRAY['vente_poule'::type_mouvement_effectif, 'vente_reforme'::type_mouvement_effectif]))), 0::numeric) AS recettes_poules, COALESCE(( SELECT sum(alimentations.montant_total) AS sum FROM alimentations WHERE alimentations.bande_id = b.id), 0::numeric) AS cout_alimentation, COALESCE(( SELECT sum(interventions_sante.cout) AS sum FROM interventions_sante WHERE interventions_sante.bande_id = b.id AND interventions_sante.statut = 'realise'::statut_intervention), 0::numeric) AS cout_sante, COALESCE(( SELECT sum(depenses.montant) AS sum FROM depenses WHERE depenses.bande_id = b.id), 0::numeric) AS cout_divers FROM bandes b`);