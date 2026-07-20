-- =============================================================
-- Module « Gestion des poules pondeuses »
-- Cible : PostgreSQL 16 (Neon)
-- Devise : XOF (FCFA) — montants en NUMERIC(12,2)
-- Unité pivot des œufs : L'ŒUF (l'alvéole n'est qu'une unité de saisie)
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "btree_gist";  -- contrainte anti-chevauchement des tarifs

-- -------------------------------------------------------------
-- 0. Types énumérés
-- -------------------------------------------------------------
CREATE TYPE statut_bande        AS ENUM ('active', 'cloturee');
CREATE TYPE unite_saisie        AS ENUM ('oeuf', 'alveole');
CREATE TYPE creneau_recolte     AS ENUM ('matin', 'midi', 'soir');

-- Toute sortie de POULE, quelle qu'en soit la cause
CREATE TYPE type_mouvement_effectif AS ENUM (
  'mortalite',
  'vente_poule',        -- transfert à un autre aviculteur
  'vente_reforme',      -- fin de cycle, pour consommation
  'consommation_perso',
  'sortie_diverse'      -- vol, don, perte
);

-- Toute sortie d'ŒUF
CREATE TYPE type_sortie_oeuf AS ENUM (
  'vente',
  'consommation_perso',
  'casse',
  'don',
  'perte'
);

CREATE TYPE type_aliment AS ENUM ('demarrage', 'croissance', 'ponte', 'complement', 'autre');

CREATE TYPE type_intervention AS ENUM ('vaccin', 'traitement', 'vitamine', 'deparasitage', 'desinfection', 'autre');
CREATE TYPE statut_intervention AS ENUM ('planifie', 'realise', 'annule');

CREATE TYPE categorie_depense AS ENUM (
  'equipement', 'main_oeuvre', 'energie', 'eau', 'transport',
  'litiere', 'reparation', 'loyer', 'autre'
);

-- Rôles applicatifs, du plus au moins privilégié
CREATE TYPE role_utilisateur AS ENUM (
  'proprietaire',   -- tout, y compris gestion des utilisateurs
  'gestionnaire',   -- tout sauf gestion des utilisateurs
  'saisie',         -- saisie quotidienne uniquement (pas de suppression)
  'lecture'         -- consultation seule
);

-- Articles pouvant faire l'objet d'un tarif de référence
CREATE TYPE type_article_tarif AS ENUM ('oeuf', 'poule_vive', 'poule_reforme');
CREATE TYPE unite_tarif        AS ENUM ('oeuf', 'alveole', 'tete');

-- -------------------------------------------------------------
-- 1. MULTI-EXPLOITATION : ferme (tenant) + utilisateurs
-- -------------------------------------------------------------
CREATE TABLE fermes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom          TEXT NOT NULL,
  localisation TEXT,
  devise       CHAR(3) NOT NULL DEFAULT 'XOF',
  telephone    TEXT,
  actif        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferme_id           UUID NOT NULL REFERENCES fermes(id) ON DELETE CASCADE,
  email              TEXT NOT NULL,
  nom_complet        TEXT NOT NULL,
  -- Hash Argon2id. JAMAIS de mot de passe en clair, JAMAIS de MD5/SHA1.
  password_hash      TEXT NOT NULL,
  role               role_utilisateur NOT NULL DEFAULT 'saisie',
  actif              BOOLEAN NOT NULL DEFAULT TRUE,
  derniere_connexion TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_email_format CHECK (email LIKE '%_@_%._%')
);

-- Unicité globale et INSENSIBLE À LA CASSE : « Mariam@x.ml » et « mariam@x.ml »
-- sont le même compte. On indexe lower(email) plutôt que d'utiliser le type
-- CITEXT, que drizzle-kit ne sait pas introspecter (il génère `unknown`).
-- L'application doit normaliser en minuscules avant insertion.
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE INDEX idx_users_ferme ON users (ferme_id) WHERE actif;

-- -------------------------------------------------------------
-- 2. TARIFS DE RÉFÉRENCE (historisés)
--    Le prix appliqué reste TOUJOURS copié sur la transaction :
--    modifier un tarif ne doit jamais réécrire l'historique comptable.
-- -------------------------------------------------------------
CREATE TABLE tarifs_reference (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferme_id      UUID NOT NULL REFERENCES fermes(id) ON DELETE CASCADE,
  type_article  type_article_tarif NOT NULL,
  unite         unite_tarif NOT NULL,
  libelle       TEXT,
  prix          NUMERIC(12,2) NOT NULL CHECK (prix >= 0),
  date_debut    DATE NOT NULL,
  date_fin      DATE,                       -- NULL = tarif toujours en vigueur
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_periode_tarif CHECK (date_fin IS NULL OR date_fin > date_debut),

  -- L'unité doit être cohérente avec l'article vendu
  CONSTRAINT chk_unite_coherente CHECK (
    (type_article = 'oeuf'  AND unite IN ('oeuf', 'alveole')) OR
    (type_article <> 'oeuf' AND unite = 'tete')
  ),

  -- Deux tarifs du même article/unité ne peuvent pas se chevaucher dans le temps
  -- => la recherche « prix en vigueur au JJ/MM/AAAA » renvoie toujours 0 ou 1 ligne.
  CONSTRAINT tarifs_sans_chevauchement EXCLUDE USING gist (
    ferme_id     WITH =,
    type_article WITH =,
    unite        WITH =,
    daterange(date_debut, date_fin, '[)') WITH &&
  )
);

CREATE INDEX idx_tarifs_lookup ON tarifs_reference (ferme_id, type_article, unite, date_debut DESC);

-- Prix de référence en vigueur à une date donnée (NULL si aucun tarif défini)
CREATE OR REPLACE FUNCTION fn_tarif_a_date(
  p_ferme_id UUID,
  p_article  type_article_tarif,
  p_unite    unite_tarif,
  p_date     DATE
) RETURNS NUMERIC(12,2)
LANGUAGE sql STABLE AS $$
  SELECT t.prix
  FROM tarifs_reference t
  WHERE t.ferme_id = p_ferme_id
    AND t.type_article = p_article
    AND t.unite = p_unite
    AND daterange(t.date_debut, t.date_fin, '[)') @> p_date
  LIMIT 1;
$$;

-- -------------------------------------------------------------
-- 3. Entité centrale : la BANDE
-- -------------------------------------------------------------
CREATE TABLE bandes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ferme_id           UUID NOT NULL REFERENCES fermes(id) ON DELETE CASCADE,
  code               TEXT NOT NULL,                  -- ex. « B-2026-01 »
  nom                TEXT,
  date_introduction  DATE NOT NULL,
  effectif_initial   INTEGER NOT NULL CHECK (effectif_initial > 0),
  date_debut_ponte   DATE,                           -- saisie, ou déduite de la 1re récolte
  statut             statut_bande NOT NULL DEFAULT 'active',
  date_cloture       DATE,
  souche             TEXT,                           -- ISA Brown, Lohmann...
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Le code n'est unique QUE dans la ferme : deux exploitations
  -- peuvent chacune avoir une bande « B-2026-01 ».
  CONSTRAINT bandes_code_unique UNIQUE (ferme_id, code),
  CONSTRAINT chk_ponte_apres_intro
    CHECK (date_debut_ponte IS NULL OR date_debut_ponte >= date_introduction),
  CONSTRAINT chk_cloture_coherente
    CHECK ((statut = 'cloturee') = (date_cloture IS NOT NULL))
);

CREATE INDEX idx_bandes_ferme   ON bandes (ferme_id);
CREATE INDEX idx_bandes_actives ON bandes (ferme_id) WHERE statut = 'active';

-- -------------------------------------------------------------
-- 4. Mouvements d'EFFECTIF (table unique polymorphe)
--    -> permet la réconciliation en UNE seule agrégation
-- -------------------------------------------------------------
CREATE TABLE mouvements_effectif (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bande_id        UUID NOT NULL REFERENCES bandes(id) ON DELETE CASCADE,
  date_mouvement  DATE NOT NULL,
  type            type_mouvement_effectif NOT NULL,
  quantite        INTEGER NOT NULL CHECK (quantite > 0),
  prix_unitaire   NUMERIC(12,2) CHECK (prix_unitaire >= 0),
  montant_total   NUMERIC(12,2) CHECK (montant_total >= 0),
  tiers           TEXT,        -- acheteur / destinataire
  motif           TEXT,        -- cause de mortalité, etc.
  notes           TEXT,
  -- Tarif de référence appliqué : purement informatif (traçabilité).
  -- Le montant réel reste porté par montant_total ci-dessus.
  tarif_id        UUID REFERENCES tarifs_reference(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Une mortalité n'a pas de recette ; une vente en a une.
  CONSTRAINT chk_montant_si_vente CHECK (
    CASE WHEN type IN ('vente_poule','vente_reforme')
         THEN montant_total IS NOT NULL
         ELSE TRUE END
  )
);

CREATE INDEX idx_mvt_effectif_bande_date ON mouvements_effectif (bande_id, date_mouvement);
CREATE INDEX idx_mvt_effectif_type       ON mouvements_effectif (bande_id, type);

-- -------------------------------------------------------------
-- 3. RÉCOLTE des œufs
--    nombre_oeufs = source de vérité ; la saisie est conservée pour l'audit
-- -------------------------------------------------------------
CREATE TABLE recoltes_oeufs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bande_id        UUID NOT NULL REFERENCES bandes(id) ON DELETE CASCADE,
  date_recolte    DATE NOT NULL,
  creneau         creneau_recolte NOT NULL DEFAULT 'matin',
  nombre_oeufs    INTEGER NOT NULL CHECK (nombre_oeufs >= 0),
  oeufs_casses    INTEGER NOT NULL DEFAULT 0 CHECK (oeufs_casses >= 0),
  unite_saisie    unite_saisie NOT NULL DEFAULT 'oeuf',
  quantite_saisie NUMERIC(10,2) NOT NULL,   -- ce que l'utilisateur a réellement tapé
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Empêche la double saisie du même créneau, tout en autorisant
  -- plusieurs ramassages par jour (matin / midi / soir).
  CONSTRAINT recolte_unique_par_creneau UNIQUE (bande_id, date_recolte, creneau),
  CONSTRAINT chk_casses_inferieurs CHECK (oeufs_casses <= nombre_oeufs)
);

CREATE INDEX idx_recoltes_bande_date ON recoltes_oeufs (bande_id, date_recolte DESC);

-- -------------------------------------------------------------
-- 4. SORTIES d'œufs (ventes, conso, casse, don)
-- -------------------------------------------------------------
CREATE TABLE sorties_oeufs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bande_id         UUID NOT NULL REFERENCES bandes(id) ON DELETE CASCADE,
  date_sortie      DATE NOT NULL,
  type             type_sortie_oeuf NOT NULL,
  nombre_oeufs     INTEGER NOT NULL CHECK (nombre_oeufs > 0),
  unite_saisie     unite_saisie NOT NULL DEFAULT 'alveole',
  quantite_saisie  NUMERIC(10,2) NOT NULL,
  prix_unitaire    NUMERIC(12,2) CHECK (prix_unitaire >= 0),  -- exprimé dans l'unité de saisie
  montant_total    NUMERIC(12,2) CHECK (montant_total >= 0),
  client           TEXT,
  notes            TEXT,
  tarif_id         UUID REFERENCES tarifs_reference(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_montant_si_vente_oeuf CHECK (
    CASE WHEN type = 'vente' THEN montant_total IS NOT NULL ELSE TRUE END
  )
);

CREATE INDEX idx_sorties_bande_date ON sorties_oeufs (bande_id, date_sortie DESC);
CREATE INDEX idx_sorties_type       ON sorties_oeufs (bande_id, type);

-- -------------------------------------------------------------
-- 5. ALIMENTATION
-- -------------------------------------------------------------
CREATE TABLE alimentations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bande_id        UUID NOT NULL REFERENCES bandes(id) ON DELETE CASCADE,
  date_conso      DATE NOT NULL,
  type_aliment    type_aliment NOT NULL,
  libelle         TEXT,
  quantite_kg     NUMERIC(10,2) NOT NULL CHECK (quantite_kg > 0),
  prix_unitaire_kg NUMERIC(12,2) CHECK (prix_unitaire_kg >= 0),
  montant_total   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (montant_total >= 0),
  fournisseur     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_alim_bande_date ON alimentations (bande_id, date_conso DESC);

-- -------------------------------------------------------------
-- 6. SANTÉ / PROPHYLAXIE
--    Un modèle réutilisable + les interventions réelles de chaque bande
-- -------------------------------------------------------------
CREATE TABLE modeles_prophylaxie (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL = modèle système, partagé par toutes les fermes (livré avec l'app).
  -- Renseigné = programme personnalisé propre à une exploitation.
  ferme_id      UUID REFERENCES fermes(id) ON DELETE CASCADE,
  nom           TEXT NOT NULL,            -- « Programme standard pondeuse »
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unicité du nom par ferme, et parmi les modèles système
CREATE UNIQUE INDEX idx_modele_nom_ferme  ON modeles_prophylaxie (ferme_id, nom)
  WHERE ferme_id IS NOT NULL;
CREATE UNIQUE INDEX idx_modele_nom_system ON modeles_prophylaxie (nom)
  WHERE ferme_id IS NULL;

CREATE TABLE modeles_prophylaxie_lignes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modele_id      UUID NOT NULL REFERENCES modeles_prophylaxie(id) ON DELETE CASCADE,
  age_jours      INTEGER NOT NULL CHECK (age_jours >= 0),  -- J+n après introduction
  type           type_intervention NOT NULL,
  libelle        TEXT NOT NULL,
  produit        TEXT,
  dosage         TEXT,
  voie           TEXT                                       -- eau de boisson, oculaire...
);

CREATE INDEX idx_modele_lignes ON modeles_prophylaxie_lignes (modele_id, age_jours);

CREATE TABLE interventions_sante (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bande_id       UUID NOT NULL REFERENCES bandes(id) ON DELETE CASCADE,
  date_prevue    DATE NOT NULL,
  date_realisee  DATE,
  type           type_intervention NOT NULL,
  libelle        TEXT NOT NULL,
  produit        TEXT,
  dosage         TEXT,
  cout           NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cout >= 0),
  statut         statut_intervention NOT NULL DEFAULT 'planifie',
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_realise_a_une_date
    CHECK ((statut = 'realise') = (date_realisee IS NOT NULL))
);

CREATE INDEX idx_interv_bande_date ON interventions_sante (bande_id, date_prevue);
CREATE INDEX idx_interv_a_venir    ON interventions_sante (date_prevue)
  WHERE statut = 'planifie';

-- -------------------------------------------------------------
-- 7. AUTRES DÉPENSES
-- -------------------------------------------------------------
CREATE TABLE depenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ferme_id est OBLIGATOIRE : une charge générale (loyer, énergie…) n'est
  -- rattachée à aucune bande, mais doit rester rattachée à une exploitation.
  ferme_id     UUID NOT NULL REFERENCES fermes(id) ON DELETE CASCADE,
  bande_id     UUID REFERENCES bandes(id) ON DELETE CASCADE,  -- NULL = charge générale
  date_depense DATE NOT NULL,
  categorie    categorie_depense NOT NULL,
  libelle      TEXT NOT NULL,
  montant      NUMERIC(12,2) NOT NULL CHECK (montant >= 0),
  notes        TEXT,
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_depenses_bande_date ON depenses (bande_id, date_depense DESC);
CREATE INDEX idx_depenses_ferme_date ON depenses (ferme_id, date_depense DESC);

-- Garde-fou : si une dépense cite une bande, celle-ci doit appartenir à la
-- même ferme (une clé étrangère seule ne peut pas exprimer cette règle).
CREATE OR REPLACE FUNCTION trg_depense_meme_ferme()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bande_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM bandes b
                     WHERE b.id = NEW.bande_id AND b.ferme_id = NEW.ferme_id) THEN
    RAISE EXCEPTION 'La bande % n''appartient pas à la ferme %',
      NEW.bande_id, NEW.ferme_id USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_depense_ferme
  BEFORE INSERT OR UPDATE ON depenses
  FOR EACH ROW EXECUTE FUNCTION trg_depense_meme_ferme();

-- =============================================================
-- 8. LOGIQUE MÉTIER EN BASE (garde-fou ultime)
-- =============================================================

-- 8.1 Effectif théorique d'une bande à une date donnée
CREATE OR REPLACE FUNCTION fn_effectif_a_date(p_bande_id UUID, p_date DATE)
RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT b.effectif_initial - COALESCE((
      SELECT SUM(m.quantite)
      FROM mouvements_effectif m
      WHERE m.bande_id = b.id
        AND m.date_mouvement <= p_date
  ), 0)::INTEGER
  FROM bandes b
  WHERE b.id = p_bande_id;
$$;

-- 8.2 Stock d'œufs disponible à une date donnée
CREATE OR REPLACE FUNCTION fn_stock_oeufs_a_date(p_bande_id UUID, p_date DATE)
RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT COALESCE((
      SELECT SUM(r.nombre_oeufs - r.oeufs_casses)
      FROM recoltes_oeufs r
      WHERE r.bande_id = p_bande_id AND r.date_recolte <= p_date
  ), 0)::INTEGER
  - COALESCE((
      SELECT SUM(s.nombre_oeufs)
      FROM sorties_oeufs s
      WHERE s.bande_id = p_bande_id AND s.date_sortie <= p_date
  ), 0)::INTEGER;
$$;

-- 8.3 GARDE-FOU : interdiction de sortir plus d'œufs que le stock
--     (verrou sur la bande => sûr même en accès concurrent)
CREATE OR REPLACE FUNCTION trg_verifier_stock_oeufs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_stock INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.bande_id::text, 0));

  SELECT COALESCE(SUM(r.nombre_oeufs - r.oeufs_casses), 0)
       - COALESCE((SELECT SUM(s.nombre_oeufs) FROM sorties_oeufs s
                   WHERE s.bande_id = NEW.bande_id
                     AND (TG_OP = 'INSERT' OR s.id <> NEW.id)), 0)
    INTO v_stock
  FROM recoltes_oeufs r
  WHERE r.bande_id = NEW.bande_id;

  IF NEW.nombre_oeufs > v_stock THEN
    RAISE EXCEPTION
      'Stock insuffisant : % œufs demandés, % disponibles (bande %)',
      NEW.nombre_oeufs, v_stock, NEW.bande_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_stock_oeufs
  BEFORE INSERT OR UPDATE ON sorties_oeufs
  FOR EACH ROW EXECUTE FUNCTION trg_verifier_stock_oeufs();

-- 8.4 GARDE-FOU : l'effectif ne peut pas devenir négatif
CREATE OR REPLACE FUNCTION trg_verifier_effectif()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_restant INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.bande_id::text, 1));

  SELECT b.effectif_initial
       - COALESCE((SELECT SUM(m.quantite) FROM mouvements_effectif m
                   WHERE m.bande_id = NEW.bande_id
                     AND (TG_OP = 'INSERT' OR m.id <> NEW.id)), 0)
    INTO v_restant
  FROM bandes b WHERE b.id = NEW.bande_id;

  IF NEW.quantite > v_restant THEN
    RAISE EXCEPTION
      'Effectif insuffisant : % poules demandées, % restantes (bande %)',
      NEW.quantite, v_restant, NEW.bande_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER check_effectif
  BEFORE INSERT OR UPDATE ON mouvements_effectif
  FOR EACH ROW EXECUTE FUNCTION trg_verifier_effectif();

-- =============================================================
-- 9. VUES D'ANALYSE
-- =============================================================

-- 9.1 Réconciliation de l'effectif (formule du cahier des charges)
CREATE OR REPLACE VIEW v_bande_effectif AS
SELECT
  b.id AS bande_id,
  b.ferme_id,
  b.code,
  b.effectif_initial,
  COALESCE(SUM(m.quantite) FILTER (WHERE m.type = 'mortalite'), 0)::INT          AS total_mortalites,
  COALESCE(SUM(m.quantite) FILTER (WHERE m.type = 'vente_poule'), 0)::INT        AS total_ventes_poules,
  COALESCE(SUM(m.quantite) FILTER (WHERE m.type = 'vente_reforme'), 0)::INT      AS total_reformes,
  COALESCE(SUM(m.quantite) FILTER (WHERE m.type = 'consommation_perso'), 0)::INT AS total_conso_perso,
  COALESCE(SUM(m.quantite) FILTER (WHERE m.type = 'sortie_diverse'), 0)::INT     AS total_sorties_diverses,
  (b.effectif_initial - COALESCE(SUM(m.quantite), 0))::INT                       AS effectif_actuel,
  ROUND(
    100.0 * COALESCE(SUM(m.quantite) FILTER (WHERE m.type = 'mortalite'), 0)
    / NULLIF(b.effectif_initial, 0), 2
  ) AS taux_mortalite_pct
FROM bandes b
LEFT JOIN mouvements_effectif m ON m.bande_id = b.id
GROUP BY b.id;

-- 9.2 Stock d'œufs courant
CREATE OR REPLACE VIEW v_bande_stock_oeufs AS
SELECT
  b.id AS bande_id,
  b.ferme_id,
  COALESCE(r.total_recolte, 0)::INT AS total_recolte,
  COALESCE(r.total_casse, 0)::INT   AS total_casse_recolte,
  COALESCE(s.total_sorti, 0)::INT   AS total_sorti,
  COALESCE(s.total_vendu, 0)::INT   AS total_vendu,
  (COALESCE(r.total_recolte, 0) - COALESCE(r.total_casse, 0)
   - COALESCE(s.total_sorti, 0))::INT AS stock_actuel
FROM bandes b
LEFT JOIN (
  SELECT bande_id,
         SUM(nombre_oeufs) AS total_recolte,
         SUM(oeufs_casses) AS total_casse
  FROM recoltes_oeufs GROUP BY bande_id
) r ON r.bande_id = b.id
LEFT JOIN (
  SELECT bande_id,
         SUM(nombre_oeufs) AS total_sorti,
         SUM(nombre_oeufs) FILTER (WHERE type = 'vente') AS total_vendu
  FROM sorties_oeufs GROUP BY bande_id
) s ON s.bande_id = b.id;

-- 9.3 Production journalière + détection de la baisse de performance (< 80 %)
--     Génère une ligne PAR JOUR depuis le début de ponte, même sans récolte
--     => les deux alertes sont DÉRIVÉES, donc elles disparaissent d'elles-mêmes
--        dès que la saisie est faite. Aucun job de nettoyage nécessaire.
CREATE OR REPLACE VIEW v_production_journaliere AS
WITH jours AS (
  SELECT b.id AS bande_id,
         b.ferme_id,
         b.date_debut_ponte,
         d::DATE AS jour
  FROM bandes b
  CROSS JOIN LATERAL generate_series(
      b.date_debut_ponte,
      LEAST(COALESCE(b.date_cloture, CURRENT_DATE), CURRENT_DATE),
      INTERVAL '1 day'
  ) d
  WHERE b.date_debut_ponte IS NOT NULL
),
prod AS (
  SELECT j.bande_id,
         j.ferme_id,
         j.jour,
         j.date_debut_ponte,
         COALESCE(SUM(r.nombre_oeufs), 0)::INT AS oeufs_recoltes,
         COUNT(r.id)                           AS nb_saisies,
         fn_effectif_a_date(j.bande_id, j.jour) AS effectif_jour
  FROM jours j
  LEFT JOIN recoltes_oeufs r
         ON r.bande_id = j.bande_id AND r.date_recolte = j.jour
  GROUP BY j.bande_id, j.ferme_id, j.jour, j.date_debut_ponte
)
SELECT
  bande_id,
  ferme_id,
  jour,
  oeufs_recoltes,
  -- Exposé pour que l'interface distingue « 0 œuf récolté » (donnée saisie,
  -- production réellement nulle) de « aucune saisie » (donnée absente).
  -- Tracer une absence de donnée comme un zéro simulerait un effondrement.
  nb_saisies,
  effectif_jour,
  ROUND(oeufs_recoltes::NUMERIC / NULLIF(effectif_jour, 0) * 100, 2) AS taux_ponte_pct,
  -- Alerte « pas de récolte » : active 7 jours après le début de ponte
  (nb_saisies = 0 AND jour >= date_debut_ponte + 7)                  AS alerte_absence_recolte,
  -- Alerte « baisse de performance » : < 80 % de l'effectif réel.
  -- Suspendue pendant les 28 premiers jours (montée en ponte) : une bande
  -- démarre vers 25 % et met 3 à 4 semaines à atteindre son pic. Sans ce
  -- délai, l'alerte serait allumée en permanence pendant un mois et
  -- masquerait les vraies chutes. Doit rester aligné sur
  -- DELAI_PIC_PONTE_JOURS (src/lib/domain/constants.ts).
  (nb_saisies > 0
   AND jour >= date_debut_ponte + 28
   AND effectif_jour > 0
   AND oeufs_recoltes < effectif_jour * 0.80)                        AS alerte_baisse_production,
  -- Exposé pour que l'interface puisse signaler « montée en ponte »
  -- au lieu de laisser croire à une sous-performance.
  (jour < date_debut_ponte + 28)                                     AS en_montee_ponte
FROM prod;

-- 9.4 Synthèse financière par bande
CREATE OR REPLACE VIEW v_bande_finances AS
SELECT
  b.id AS bande_id,
  b.ferme_id,
  -- RECETTES
  COALESCE((SELECT SUM(montant_total) FROM sorties_oeufs
            WHERE bande_id = b.id AND type = 'vente'), 0)                AS recettes_oeufs,
  COALESCE((SELECT SUM(montant_total) FROM mouvements_effectif
            WHERE bande_id = b.id AND type IN ('vente_poule','vente_reforme')), 0)
                                                                        AS recettes_poules,
  -- DÉPENSES
  COALESCE((SELECT SUM(montant_total) FROM alimentations
            WHERE bande_id = b.id), 0)                                  AS cout_alimentation,
  COALESCE((SELECT SUM(cout) FROM interventions_sante
            WHERE bande_id = b.id AND statut = 'realise'), 0)           AS cout_sante,
  COALESCE((SELECT SUM(montant) FROM depenses
            WHERE bande_id = b.id), 0)                                  AS cout_divers
FROM bandes b;

-- =============================================================
-- 10. Trigger utilitaire : updated_at
-- =============================================================
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bandes_updated_at
  BEFORE UPDATE ON bandes
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER fermes_updated_at
  BEFORE UPDATE ON fermes
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TRIGGER tarifs_updated_at
  BEFORE UPDATE ON tarifs_reference
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
