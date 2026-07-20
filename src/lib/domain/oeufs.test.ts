import { describe, expect, it } from 'vitest';
import {
  alveolesEnOeufs,
  formaterQuantite,
  oeufsEnAlveoles,
  saisieMixteVersOeufs,
  versOeufs,
} from './oeufs';

describe('conversion alvéoles ↔ œufs', () => {
  it('convertit les alvéoles pleines', () => {
    expect(alveolesEnOeufs(1)).toEqual({ ok: true, valeur: 30 });
    expect(alveolesEnOeufs(12)).toEqual({ ok: true, valeur: 360 });
    expect(alveolesEnOeufs(0)).toEqual({ ok: true, valeur: 0 });
  });

  it('accepte les demi-alvéoles qui tombent juste', () => {
    expect(alveolesEnOeufs(0.5)).toEqual({ ok: true, valeur: 15 });
    expect(alveolesEnOeufs(2.1)).toEqual({ ok: true, valeur: 63 });
  });

  it('refuse une saisie qui donnerait un nombre d’œufs fractionnaire', () => {
    // 2,05 × 30 = 61,5 : arrondir en silence fausserait le stock durablement.
    const r = alveolesEnOeufs(2.05);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain('entier');
  });

  it('refuse les valeurs négatives ou non finies', () => {
    expect(alveolesEnOeufs(-1).ok).toBe(false);
    expect(alveolesEnOeufs(Number.NaN).ok).toBe(false);
    expect(alveolesEnOeufs(Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  it('décompose des œufs en alvéoles + reste', () => {
    expect(oeufsEnAlveoles(367)).toEqual({ alveoles: 12, oeufsRestants: 7 });
    expect(oeufsEnAlveoles(30)).toEqual({ alveoles: 1, oeufsRestants: 0 });
    expect(oeufsEnAlveoles(0)).toEqual({ alveoles: 0, oeufsRestants: 0 });
  });

  it('fait un aller-retour sans perte', () => {
    for (const n of [0, 1, 29, 30, 31, 367, 12_345]) {
      const { alveoles, oeufsRestants } = oeufsEnAlveoles(n);
      expect(alveoles * 30 + oeufsRestants).toBe(n);
    }
  });
});

describe('normalisation de la saisie', () => {
  it('accepte une saisie directe en œufs', () => {
    expect(versOeufs(367, 'oeuf')).toEqual({ ok: true, valeur: 367 });
  });

  it('refuse un nombre d’œufs fractionnaire', () => {
    expect(versOeufs(12.5, 'oeuf').ok).toBe(false);
  });

  it('gère la saisie mixte « alvéoles + œufs »', () => {
    expect(saisieMixteVersOeufs(12, 7)).toEqual({ ok: true, valeur: 367 });
    expect(saisieMixteVersOeufs(0, 5)).toEqual({ ok: true, valeur: 5 });
  });

  it('propage l’erreur de la partie invalide', () => {
    expect(saisieMixteVersOeufs(1, -3).ok).toBe(false);
    expect(saisieMixteVersOeufs(-1, 3).ok).toBe(false);
  });
});

describe('affichage', () => {
  it('formate lisiblement', () => {
    expect(formaterQuantite(367)).toBe('12 alvéoles + 7 œufs (367 œufs)');
    expect(formaterQuantite(60)).toBe('2 alvéoles (60 œufs)');
    expect(formaterQuantite(7)).toBe('7 œufs');
    expect(formaterQuantite(1)).toBe('1 œuf');
    expect(formaterQuantite(0)).toBe('0 œuf');
  });
});
