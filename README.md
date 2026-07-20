# Gestion Poulet Pondeuse

Application de gestion avicole — module « poules pondeuses ».
Suivi par **bande** (lot de poules introduites simultanément) : ponte, effectif,
dépenses, alertes et rentabilité.

Stack : Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle · PostgreSQL (Neon)

---

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseigner DATABASE_URL
npm run db:push              # applique le schéma à la base
npm run dev
```

> **Ne jamais committer `.env.local`.** Les secrets ne vivent que là et dans les
> variables d'environnement de l'hébergeur — jamais dans un fichier `.txt`,
> un ticket ou un message.

---

## Le schéma est écrit en SQL, pas en TypeScript

La source de vérité est **[`docs/schema.sql`](docs/schema.sql)**. Le fichier
`drizzle/schema.ts` en est *dérivé* par introspection.

Ce sens est délibéré : le schéma contient des triggers, des vues et une
contrainte `EXCLUDE USING gist` que Drizzle ne sait pas exprimer. Générer le SQL
depuis TypeScript ferait disparaître ces garde-fous sans le moindre avertissement.

```
docs/schema.sql  ──db:push──▶  Neon  ──db:pull──▶  drizzle/schema.ts
   (écrit à la main)                                  (généré, ne pas éditer)
```

| Commande | Effet |
|---|---|
| `npm run db:push` | Applique `docs/schema.sql` à la base |
| `npm run db:reset` | Vide le schéma et le réapplique (refuse si des données existent) |
| `npm run db:seed` | Charge un jeu de démonstration (1 bande, 6 mois de suivi) |
| `npm run db:verify` | Vérifie que les règles métier sont appliquées par la base |
| `npm run db:pull` | Régénère les types Drizzle depuis la base |
| `npm run db:studio` | Explorateur de données |

Après toute modification de `docs/schema.sql` : `db:reset` → `db:verify` → `db:pull`.

---

## Règles métier

Elles sont appliquées **deux fois**, volontairement.

| Règle | Application (UX immédiate) | Base (autorité) |
|---|---|---|
| 1 alvéole = 30 œufs | `src/lib/domain/oeufs.ts` | œufs stockés en entier |
| Vente ≤ stock disponible | `src/lib/domain/stock.ts` | trigger `check_stock_oeufs` |
| Sortie ≤ effectif présent | `src/lib/domain/effectif.ts` | trigger `check_effectif` |
| Tarifs sans chevauchement | — | contrainte `EXCLUDE` |

La validation applicative donne un retour instantané dans le formulaire. Le
trigger, lui, ne peut pas être contourné par un import, un script ou deux
saisies concurrentes. L'un ne remplace pas l'autre.

### Effectif

```
Effectif actuel = Effectif initial
                  − Mortalités − Ventes de poules − Ventes en réforme
                  − Consommations personnelles − Sorties diverses
```

### Alertes — dérivées, jamais stockées

Recalculées à chaque lecture par `v_production_journaliere` et
`src/lib/domain/alertes.ts`. Elles disparaissent donc d'elles-mêmes dès que la
donnée manquante est saisie, sans job de nettoyage.

- **Pas de récolte** — aucune saisie, à partir de J+7 après le début de ponte.
- **Baisse de production** — moins de 80 % de l'effectif **réel du jour**
  (pas de l'effectif initial : sinon l'alerte se déclencherait à tort de plus
  en plus souvent à mesure que la bande vieillit), et **seulement après les
  28 premiers jours de ponte**.

> **Pourquoi ce délai de 28 jours ?** Une bande qui démarre pond autour de 25 %
> et met 3 à 4 semaines à atteindre son pic. Sans ce délai, la règle des 80 %
> alerte tous les jours pendant un mois : l'utilisatrice apprend à ignorer la
> cloche et rate les vraies chutes. Sur le jeu de démonstration, le délai fait
> passer le nombre d'alertes de **24 à 5** — les 5 anomalies réelles.
> Valeur ajustable via `DELAI_PIC_PONTE_JOURS` (à répercuter dans la vue SQL).

### Distinguer « zéro » de « pas de donnée »

Un jour sans saisie n'est pas un jour à production nulle. Cette distinction est
tenue partout : la courbe s'interrompt au lieu de plonger à zéro, les moyennes
hebdomadaires excluent ces jours, et les deux alertes ne se cumulent jamais sur
la même journée.

---

## Tests

```bash
npm test          # 52 tests unitaires du domaine (aucune base requise)
npm run db:verify # 24 vérifications contre la vraie base, en transaction annulée
npm run typecheck
```

---

## Structure

```
docs/schema.sql        source de vérité du schéma
drizzle/               types générés — ne pas éditer
scripts/               outillage base de données
src/lib/domain/        règles métier pures, testées
src/db/                client Drizzle
src/app/               interface Next.js
```
