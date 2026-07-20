import { describe, expect, it } from 'vitest';
import { ajouterJours, differenceJours, estDateISO, intervalleJours } from './dates';

describe('validation des dates', () => {
  it('accepte les dates valides', () => {
    expect(estDateISO('2026-03-01')).toBe(true);
    expect(estDateISO('2024-02-29')).toBe(true); // année bissextile
  });

  it('rejette les dates invalides', () => {
    expect(estDateISO('2026-02-30')).toBe(false);
    expect(estDateISO('2025-02-29')).toBe(false); // non bissextile
    expect(estDateISO('2026-13-01')).toBe(false);
    expect(estDateISO('2026-3-1')).toBe(false);
    expect(estDateISO('01/03/2026')).toBe(false);
  });
});

describe('arithmétique des dates', () => {
  it('ajoute des jours en franchissant les mois et les années', () => {
    expect(ajouterJours('2026-03-01', 7)).toBe('2026-03-08');
    expect(ajouterJours('2026-03-28', 7)).toBe('2026-04-04');
    expect(ajouterJours('2026-12-28', 7)).toBe('2027-01-04');
    expect(ajouterJours('2026-03-08', -7)).toBe('2026-03-01');
  });

  it('gère le 29 février', () => {
    expect(ajouterJours('2024-02-28', 1)).toBe('2024-02-29');
    expect(ajouterJours('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('ne dérive pas au passage à l’heure d’été', () => {
    // En Europe, le changement d'heure a lieu fin mars. Un calcul en heure
    // locale renverrait ici le 2026-03-29 au lieu du 2026-03-30.
    expect(ajouterJours('2026-03-29', 1)).toBe('2026-03-30');
    expect(differenceJours('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('calcule les écarts, y compris négatifs', () => {
    expect(differenceJours('2026-03-01', '2026-03-08')).toBe(7);
    expect(differenceJours('2026-03-01', '2026-03-01')).toBe(0);
    expect(differenceJours('2026-03-08', '2026-03-01')).toBe(-7);
  });

  it('génère un intervalle inclusif', () => {
    expect(intervalleJours('2026-03-01', '2026-03-03')).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
    ]);
    expect(intervalleJours('2026-03-01', '2026-03-01')).toEqual(['2026-03-01']);
    expect(intervalleJours('2026-03-03', '2026-03-01')).toEqual([]);
  });

  it('rejette une date malformée', () => {
    expect(() => ajouterJours('pas-une-date', 1)).toThrow(TypeError);
  });
});
