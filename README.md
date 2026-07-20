# Gestion Poulet Pondeuse

Application de gestion avicole — module « poules pondeuses ».
Suivi par **bande** (lot de poules introduites simultanément) : ponte, effectif,
dépenses, alertes et rentabilité.

Stack : Next.js 16 · React 19 · TypeScript · Tailwind 4 · Drizzle · PostgreSQL (Neon)

---

## Démarrage

```bash
npm install
cp .env.example .env.local   # puis renseigner DATABASE_URL et AUTH_SECRET
npm run db:push              # applique le schéma à la base
npm run db:seed              # jeu de démonstration + comptes de test
npm run dev
```

Comptes créés par `db:seed` — **à supprimer avant toute mise en production** :

| Compte | Rôle | Mot de passe |
|---|---|---|
| `mariam.dembele@modenamali.com` | Propriétaire | `demo-pondeuse-2026` |
| `lecture@modenamali.com` | Lecture seule | `demo-pondeuse-2026` |

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
| Récolte déjà vendue non retirable | — | trigger `check_retrait_recolte` |
| Tarifs sans chevauchement | — | contrainte `EXCLUDE` |

Le trigger `check_retrait_recolte` ferme une dissymétrie que la suppression a
rendue atteignable : le contrôle de stock ne surveillait que les *sorties*.
Récolter 400 œufs, les vendre, puis supprimer la récolte donnait un stock de
−400 sans qu'aucune contrainte ne s'y oppose.

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

## Authentification

### Inscription

`/inscription` crée une **exploitation et son compte propriétaire** en une fois.
C'est le seul point d'entrée pour un visiteur sans compte ; les collaborateurs
d'une ferme existante sont ensuite ajoutés depuis `/utilisateurs` par son
propriétaire — sinon n'importe qui pourrait s'ajouter à une exploitation
qui n'est pas la sienne.

Les deux insertions passent par **une seule instruction SQL** (CTE modifiante).
Le driver HTTP de Neon est sans état : il ne porte pas de transaction sur
plusieurs requêtes. En deux instructions, un e-mail déjà pris ferait échouer la
seconde et laisserait une exploitation orpheline, sans propriétaire et
invisible. `db:verify` teste explicitement ce cas.

### Session

Session par JWT signé (HS256) dans un cookie `httpOnly`, `sameSite=lax`, durée 8 h.
Mots de passe hachés avec **scrypt** (`node:crypto`), paramètres OWASP 2024,
sel aléatoire par compte et comparaison à temps constant.

Pas de dépendance native : Argon2id est le premier choix OWASP, mais ses
implémentations Node sont des modules natifs dont la compilation casse
régulièrement en déploiement serverless. scrypt est le second choix, également
memory-hard, et livré avec Node.

**Le contrôle d'accès repose sur les pages et les actions, pas sur `proxy.ts`.**
Le proxy ne teste que la *présence* du cookie, pour éviter un aller-retour
inutile. La vraie vérification — signature, compte toujours actif, rôle — a
lieu dans `exigerUtilisateur()` et `exigerSaisie()`, appelées au début de
chaque page protégée et de chaque action de saisie.

| Rôle | Lecture | Saisie | Suppression | Utilisateurs |
|---|:-:|:-:|:-:|:-:|
| `proprietaire` | ✓ | ✓ | ✓ | ✓ |
| `gestionnaire` | ✓ | ✓ | ✓ | — |
| `saisie` | ✓ | ✓ | — | — |
| `lecture` | ✓ | — | — | — |

Chaque action vérifie aussi que la bande visée appartient à la ferme de
l'utilisateur : l'identifiant vient d'un champ de formulaire, donc du client.

### Suppressions

Supprimer une saisie modifie le stock, l'effectif ou la comptabilité. Chaque
suppression archive la ligne complète (JSONB) dans `journal_suppressions`,
avec son auteur.

Pourquoi une suppression réelle plutôt que logique (`deleted_at`) : le stock et
l'effectif sont calculés par des vues et des triggers qui agrègent **toutes**
les lignes. Une suppression logique obligerait à filtrer dans chaque vue et
chaque trigger — un seul oubli et le stock devient faux, silencieusement.
La table reste donc propre et la trace vit à côté.

Le nom de table transite par le formulaire : il est validé contre une liste
blanche de requêtes littérales. Un identifiant SQL ne peut pas être un
paramètre, donc l'interpoler ouvrirait une injection.

---

## Tests

```bash
npm test            # 60 tests unitaires (domaine + hachage), aucune base requise
npm run db:verify   # 33 vérifications des règles, en transaction annulée
npm run test:routes # 29 vérifications des routes et permissions (serveur démarré)
npm run typecheck
```

---

## Structure

```
docs/schema.sql        source de vérité du schéma
drizzle/               types générés — ne pas éditer
scripts/               outillage base de données et tests d'intégration
src/lib/domain/        règles métier pures, testées
src/lib/auth/          hachage, session, rôles
src/lib/actions/       Server Actions (saisie, bandes, utilisateurs, suppressions)
src/lib/queries/       lectures pour l'affichage
src/db/                client Drizzle
src/proxy.ts           redirection des visiteurs non connectés
src/app/               pages
```

| Route | Contenu | Accès |
|---|---|---|
| `/` | Tableau de bord | tous |
| `/saisie` | Récolte, sorties, dépense | `saisie` et plus |
| `/historique` | Journal unifié, suppression | tous ; suppression dès `gestionnaire` |
| `/bandes` | Liste, création, clôture | tous ; gestion dès `gestionnaire` |
| `/utilisateurs` | Mon mot de passe ; comptes | tous ; comptes réservés au `proprietaire` |
| `/connexion` | Authentification | public |
| `/inscription` | Créer une exploitation + son propriétaire | public |
