'use client';

import { useMemo, useState } from 'react';
import type { PointProduction } from '@/lib/queries/bande';
import { formaterDateCourte, formaterNombre } from '@/lib/format';
import { SEUIL_ALERTE_PONTE } from '@/lib/domain/constants';

type Periode = 'jour' | 'semaine' | 'mois';

interface PointTrace {
  etiquette: string;
  /** `null` = aucune donnée saisie. La courbe s'interrompt, elle ne descend pas à 0. */
  taux: number | null;
  oeufs: number;
  enMonteePonte: boolean;
  enAlerte: boolean;
}

const L = 800; // largeur du viewBox
const H = 280; // hauteur du viewBox
const MARGE = { haut: 16, droite: 12, bas: 32, gauche: 40 };

export function CourbePonte({ points }: { points: PointProduction[] }) {
  const [periode, setPeriode] = useState<Periode>('jour');
  const [survol, setSurvol] = useState<number | null>(null);

  const trace = useMemo(() => agreger(points, periode), [points, periode]);

  if (trace.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-texte-doux">
        Aucune donnée de ponte pour le moment.
      </p>
    );
  }

  const largeurUtile = L - MARGE.gauche - MARGE.droite;
  const hauteurUtile = H - MARGE.haut - MARGE.bas;

  const x = (i: number) =>
    MARGE.gauche + (trace.length === 1 ? largeurUtile / 2 : (i * largeurUtile) / (trace.length - 1));
  const y = (taux: number) => MARGE.haut + hauteurUtile * (1 - Math.min(taux, 100) / 100);

  // Segments continus : un jour sans saisie coupe la courbe. Relier les deux
  // côtés donnerait une chute à zéro purement imaginaire.
  const segments: { i: number; p: PointTrace }[][] = [];
  let courant: { i: number; p: PointTrace }[] = [];
  trace.forEach((p, i) => {
    if (p.taux === null) {
      if (courant.length > 0) segments.push(courant);
      courant = [];
    } else {
      courant.push({ i, p });
    }
  });
  if (courant.length > 0) segments.push(courant);

  const cheminLigne = (seg: { i: number; p: PointTrace }[]) =>
    seg.map(({ i, p }, k) => `${k === 0 ? 'M' : 'L'} ${x(i)} ${y(p.taux!)}`).join(' ');

  const cheminAire = (seg: { i: number; p: PointTrace }[]) =>
    `M ${x(seg[0].i)} ${MARGE.haut + hauteurUtile} ` +
    seg.map(({ i, p }) => `L ${x(i)} ${y(p.taux!)}`).join(' ') +
    ` L ${x(seg[seg.length - 1].i)} ${MARGE.haut + hauteurUtile} Z`;

  // Étendue de la montée en ponte, pour la griser
  const derniereMontee = trace.reduce((acc, p, i) => (p.enMonteePonte ? i : acc), -1);

  const pas = Math.max(1, Math.ceil(trace.length / 8));
  const actif = survol !== null ? trace[survol] : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-texte-doux">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-accent" />
            Taux de ponte
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-4 border-t-2 border-dashed border-succes" />
            Seuil {SEUIL_ALERTE_PONTE * 100} %
          </span>
          {derniereMontee >= 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-4 rounded-sm bg-surface-2" />
              Montée en ponte
            </span>
          )}
          {trace.some((p) => p.taux === null) && (
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-4 border-t-2 border-dashed border-alerte" />
              Sans saisie
            </span>
          )}
        </div>

        <div
          role="group"
          aria-label="Période d’affichage"
          className="flex rounded-lg border border-bordure bg-surface-2 p-0.5"
        >
          {(['jour', 'semaine', 'mois'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setPeriode(p); setSurvol(null); }}
              aria-pressed={periode === p}
              className={`rounded-md px-3 py-1 text-xs font-medium capitalize transition ${
                periode === p
                  ? 'bg-surface text-texte shadow-sm'
                  : 'text-texte-doux hover:text-texte'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <svg viewBox={`0 0 ${L} ${H}`} className="h-auto w-full" role="img"
             aria-label={`Courbe du taux de ponte par ${periode}`}>
          {/* Zone de montée en ponte */}
          {derniereMontee >= 0 && (
            <rect
              x={MARGE.gauche} y={MARGE.haut}
              width={x(derniereMontee) - MARGE.gauche} height={hauteurUtile}
              className="fill-surface-2"
            />
          )}

          {/* Grille horizontale */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={MARGE.gauche} x2={L - MARGE.droite} y1={y(v)} y2={y(v)}
                    className="stroke-bordure" strokeWidth={1} />
              <text x={MARGE.gauche - 8} y={y(v) + 4} textAnchor="end"
                    className="fill-texte-doux text-[11px]">{v}</text>
            </g>
          ))}

          {/* Seuil d'alerte */}
          <line
            x1={MARGE.gauche} x2={L - MARGE.droite}
            y1={y(SEUIL_ALERTE_PONTE * 100)} y2={y(SEUIL_ALERTE_PONTE * 100)}
            className="stroke-succes" strokeWidth={1.5} strokeDasharray="5 4"
          />

          {segments.map((seg, k) => (
            <g key={k}>
              {seg.length > 1 && <path d={cheminAire(seg)} className="fill-accent" opacity={0.1} />}
              <path d={cheminLigne(seg)} className="stroke-accent" strokeWidth={2}
                    fill="none" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}

          {/* Jours sans saisie : trait vertical plutôt qu'un point sur la courbe,
              puisqu'il n'y a précisément aucune valeur à y placer. */}
          {trace.map((p, i) =>
            p.taux === null ? (
              <line key={`vide-${i}`} x1={x(i)} x2={x(i)}
                    y1={MARGE.haut} y2={MARGE.haut + hauteurUtile}
                    className="stroke-alerte" strokeWidth={1.5} strokeDasharray="2 3" opacity={0.7} />
            ) : null,
          )}

          {/* Points en alerte situés sur la courbe */}
          {trace.map((p, i) =>
            p.enAlerte && p.taux !== null ? (
              <circle key={i} cx={x(i)} cy={y(p.taux)} r={4}
                      className="fill-alerte stroke-surface" strokeWidth={2} />
            ) : null,
          )}

          {/* Repère de survol */}
          {survol !== null && (
            <>
              <line x1={x(survol)} x2={x(survol)} y1={MARGE.haut} y2={MARGE.haut + hauteurUtile}
                    className="stroke-texte-doux" strokeWidth={1} strokeDasharray="3 3" />
              {trace[survol].taux !== null && (
                <circle cx={x(survol)} cy={y(trace[survol].taux)} r={5}
                        className="fill-accent stroke-surface" strokeWidth={2} />
              )}
            </>
          )}

          {/* Étiquettes de l'axe des abscisses */}
          {trace.map((p, i) =>
            i % pas === 0 || i === trace.length - 1 ? (
              <text key={i} x={x(i)} y={H - 10} textAnchor="middle"
                    className="fill-texte-doux text-[11px]">{p.etiquette}</text>
            ) : null,
          )}

          {/* Zones de survol, au-dessus de tout le reste */}
          {trace.map((_, i) => (
            <rect
              key={i}
              x={x(i) - largeurUtile / Math.max(trace.length - 1, 1) / 2}
              y={MARGE.haut}
              width={largeurUtile / Math.max(trace.length - 1, 1)}
              height={hauteurUtile}
              fill="transparent"
              onMouseEnter={() => setSurvol(i)}
              onMouseLeave={() => setSurvol(null)}
            />
          ))}
        </svg>

        {actif && (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-bordure bg-surface px-3 py-2 text-xs shadow-lg">
            <div className="font-medium">{actif.etiquette}</div>
            {actif.taux === null ? (
              <div className="text-alerte">Aucune récolte saisie</div>
            ) : (
              <div className="chiffres text-texte-doux">
                {formaterNombre(actif.oeufs)} œufs · {actif.taux.toFixed(1)} %
              </div>
            )}
            {actif.enMonteePonte && (
              <div className="mt-0.5 text-texte-doux">Montée en ponte</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Agrège la série journalière selon la période demandée. */
function agreger(points: PointProduction[], periode: Periode): PointTrace[] {
  if (periode === 'jour') {
    return points.map((p) => ({
      etiquette: formaterDateCourte(p.jour),
      // Aucune saisie ⇒ pas de valeur. Un 0 signifierait « les poules n'ont
      // rien pondu », ce qui n'est pas ce que la donnée dit.
      taux: p.nbSaisies === 0 ? null : (p.tauxPonte ?? 0),
      oeufs: p.oeufs,
      enMonteePonte: p.enMonteePonte,
      enAlerte: p.alerteAbsence || p.alerteBaisse,
    }));
  }

  const groupes = new Map<string, PointProduction[]>();
  for (const p of points) {
    // Semaine = lundi de la semaine ; mois = premier jour du mois.
    const cle = periode === 'mois' ? p.jour.slice(0, 7) : lundiDeLaSemaine(p.jour);
    const g = groupes.get(cle) ?? [];
    g.push(p);
    groupes.set(cle, g);
  }

  return [...groupes.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([cle, jours]) => {
      // Seuls les jours effectivement saisis entrent dans la moyenne : inclure
      // les jours manquants ferait mécaniquement chuter le taux de la période.
      const saisis = jours.filter((p) => p.nbSaisies > 0);
      const oeufs = saisis.reduce((s, p) => s + p.oeufs, 0);
      const effectifCumule = saisis.reduce((s, p) => s + p.effectif, 0);
      return {
        // Moyenne pondérée : la moyenne des taux quotidiens fausserait le
        // résultat quand l'effectif varie au cours de la période.
        etiquette:
          periode === 'mois'
            ? formaterDateCourte(`${cle}-01`).replace(/^\d+ /, '')
            : formaterDateCourte(cle),
        taux: effectifCumule > 0 ? (oeufs / effectifCumule) * 100 : null,
        oeufs,
        enMonteePonte: jours.every((p) => p.enMonteePonte),
        enAlerte: jours.some((p) => p.alerteAbsence || p.alerteBaisse),
      };
    });
}

function lundiDeLaSemaine(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const decalage = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCDate(d.getUTCDate() - decalage);
  return d.toISOString().slice(0, 10);
}
