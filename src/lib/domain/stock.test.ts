import { describe, expect, it } from 'vitest';
import { calculerStockOeufs, verifierSortieOeufs } from './stock';
import type { Recolte, SortieOeuf } from './types';

const recolte = (dateRecolte: string, nombreOeufs: number, oeufsCasses = 0): Recolte => ({
  dateRecolte,
  nombreOeufs,
  oeufsCasses,
});

const sortie = (
  dateSortie: string,
  type: SortieOeuf['type'],
  nombreOeufs: number,
): SortieOeuf => ({ dateSortie, type, nombreOeufs });

describe('calcul du stock d’œufs', () => {
  it('soustrait les sorties des récoltes', () => {
    const r = calculerStockOeufs(
      [recolte('2026-03-01', 400), recolte('2026-03-02', 420)],
      [sortie('2026-03-02', 'vente', 300)],
    );
    expect(r.totalRecolte).toBe(820);
    expect(r.totalVendu).toBe(300);
    expect(r.stockActuel).toBe(520);
  });

  it('exclut du stock les œufs cassés au ramassage', () => {
    // Les cassés ne sont jamais entrés en stock : les compter puis les
    // ressortir créerait une vente fantôme dans les analyses.
    const r = calculerStockOeufs([recolte('2026-03-01', 400, 10)], []);
    expect(r.totalRecolte).toBe(400);
    expect(r.totalCasseRecolte).toBe(10);
    expect(r.stockActuel).toBe(390);
  });

  it('distingue les ventes des autres sorties', () => {
    const r = calculerStockOeufs(
      [recolte('2026-03-01', 500)],
      [
        sortie('2026-03-02', 'vente', 300),
        sortie('2026-03-02', 'consommation_perso', 30),
        sortie('2026-03-03', 'don', 20),
      ],
    );
    expect(r.totalVendu).toBe(300);
    expect(r.totalAutresSorties).toBe(50);
    expect(r.stockActuel).toBe(150);
  });

  it('respecte la date d’arrêté', () => {
    const recoltes = [recolte('2026-03-01', 400), recolte('2026-03-05', 400)];
    const sorties = [sortie('2026-03-02', 'vente', 100)];
    expect(calculerStockOeufs(recoltes, sorties, '2026-03-03').stockActuel).toBe(300);
    expect(calculerStockOeufs(recoltes, sorties, '2026-03-05').stockActuel).toBe(700);
  });

  it('renvoie un stock nul sans donnée', () => {
    expect(calculerStockOeufs([], []).stockActuel).toBe(0);
  });
});

describe('contrôle de stock avant vente', () => {
  it('autorise une vente couverte par le stock', () => {
    expect(verifierSortieOeufs(520, 300)).toEqual({ ok: true, valeur: 220 });
  });

  it('autorise la vente de la totalité du stock', () => {
    expect(verifierSortieOeufs(300, 300)).toEqual({ ok: true, valeur: 0 });
  });

  it('refuse une vente d’un seul œuf de trop', () => {
    const r = verifierSortieOeufs(300, 301);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toContain('Stock insuffisant');
  });

  it('exprime l’erreur en alvéoles, comme l’utilisateur compte', () => {
    const r = verifierSortieOeufs(90, 360);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erreur).toContain('12 alvéoles');
      expect(r.erreur).toContain('3 alvéoles');
    }
  });

  it('refuse une quantité nulle, négative ou fractionnaire', () => {
    expect(verifierSortieOeufs(100, 0).ok).toBe(false);
    expect(verifierSortieOeufs(100, -1).ok).toBe(false);
    expect(verifierSortieOeufs(100, 1.5).ok).toBe(false);
  });

  it('refuse toute sortie quand le stock est vide', () => {
    expect(verifierSortieOeufs(0, 1).ok).toBe(false);
  });
});
