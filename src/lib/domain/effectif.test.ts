import { describe, expect, it } from 'vitest';
import { calculerEffectif, verifierSortieEffectif } from './effectif';
import type { MouvementEffectif } from './types';

const mvt = (
  type: MouvementEffectif['type'],
  quantite: number,
  dateMouvement: string,
): MouvementEffectif => ({ type, quantite, dateMouvement });

describe('réconciliation de l’effectif', () => {
  it('applique la formule complète du cahier des charges', () => {
    const r = calculerEffectif(500, [
      mvt('mortalite', 12, '2026-01-10'),
      mvt('mortalite', 3, '2026-02-02'),
      mvt('vente_poule', 50, '2026-03-01'),
      mvt('vente_reforme', 100, '2026-06-15'),
      mvt('consommation_perso', 5, '2026-04-20'),
      mvt('sortie_diverse', 2, '2026-05-05'),
    ]);

    // 500 − 15 − 50 − 100 − 5 − 2 = 328
    expect(r.effectifActuel).toBe(328);
    expect(r.mortalites).toBe(15);
    expect(r.totalSorties).toBe(172);
    expect(r.tauxMortalite).toBe(3); // 15/500 = 3 %
  });

  it('renvoie l’effectif initial sans mouvement', () => {
    const r = calculerEffectif(500, []);
    expect(r.effectifActuel).toBe(500);
    expect(r.tauxMortalite).toBe(0);
  });

  it('filtre correctement à une date donnée', () => {
    const mouvements = [
      mvt('mortalite', 10, '2026-01-10'),
      mvt('mortalite', 20, '2026-03-15'),
    ];
    // Le mouvement du jour même est inclus (comparaison <=)
    expect(calculerEffectif(500, mouvements, '2026-01-10').effectifActuel).toBe(490);
    expect(calculerEffectif(500, mouvements, '2026-02-01').effectifActuel).toBe(490);
    expect(calculerEffectif(500, mouvements, '2026-03-15').effectifActuel).toBe(470);
    expect(calculerEffectif(500, mouvements, '2025-12-31').effectifActuel).toBe(500);
  });

  it('rejette un effectif initial invalide (erreur de programmation)', () => {
    expect(() => calculerEffectif(0, [])).toThrow(RangeError);
    expect(() => calculerEffectif(-5, [])).toThrow(RangeError);
    expect(() => calculerEffectif(12.5, [])).toThrow(RangeError);
  });
});

describe('contrôle de sortie de poules', () => {
  it('autorise une sortie couverte par l’effectif', () => {
    expect(verifierSortieEffectif(328, 50)).toEqual({ ok: true, valeur: 278 });
  });

  it('autorise la sortie de la totalité de l’effectif', () => {
    expect(verifierSortieEffectif(100, 100)).toEqual({ ok: true, valeur: 0 });
  });

  it('refuse une sortie supérieure à l’effectif', () => {
    const r = verifierSortieEffectif(10, 11);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain('Effectif insuffisant');
  });

  it('refuse une quantité nulle ou négative', () => {
    expect(verifierSortieEffectif(100, 0).ok).toBe(false);
    expect(verifierSortieEffectif(100, -5).ok).toBe(false);
  });
});
