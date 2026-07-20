import { describe, expect, it } from 'vitest';
import { alertesActives, analyserProduction, deduireDebutPonte } from './alertes';
import type { MouvementEffectif, Recolte } from './types';

const recolte = (dateRecolte: string, nombreOeufs: number): Recolte => ({
  dateRecolte,
  nombreOeufs,
  oeufsCasses: 0,
});

const base = {
  effectifInitial: 100,
  dateDebutPonte: '2026-03-01',
  bandeActive: true,
  mouvements: [] as MouvementEffectif[],
};

const codes = (journees: ReturnType<typeof analyserProduction>, jour: string) =>
  journees.find((j) => j.jour === jour)?.alertes.map((a) => a.code) ?? [];

describe('alerte « pas de récolte »', () => {
  it('ne se déclenche pas pendant la première semaine de ponte', () => {
    const journees = analyserProduction({ ...base, dateFin: '2026-03-07', recoltes: [] });
    expect(alertesActives(journees)).toHaveLength(0);
  });

  it('se déclenche à partir du 8e jour (J+7)', () => {
    const journees = analyserProduction({ ...base, dateFin: '2026-03-08', recoltes: [] });
    expect(codes(journees, '2026-03-07')).toEqual([]);
    expect(codes(journees, '2026-03-08')).toEqual(['absence_recolte']);
  });

  it('disparaît dès que la récolte du jour est saisie', () => {
    const params = { ...base, dateFin: '2026-03-10' };

    const avant = analyserProduction({ ...params, recoltes: [] });
    expect(codes(avant, '2026-03-10')).toContain('absence_recolte');

    // Même jeu de paramètres, une récolte en plus : l'alerte s'évapore.
    // C'est l'intérêt d'une alerte dérivée plutôt que stockée.
    const apres = analyserProduction({ ...params, recoltes: [recolte('2026-03-10', 95)] });
    expect(codes(apres, '2026-03-10')).toEqual([]);
  });

  it('reste silencieuse sur une bande clôturée', () => {
    const journees = analyserProduction({
      ...base,
      bandeActive: false,
      dateFin: '2026-03-20',
      recoltes: [],
    });
    expect(alertesActives(journees)).toHaveLength(0);
  });

  it('ne produit rien tant que la ponte n’a pas commencé', () => {
    const journees = analyserProduction({
      ...base,
      dateDebutPonte: null,
      dateFin: '2026-03-20',
      recoltes: [],
    });
    expect(journees).toHaveLength(0);
  });
});

describe('alerte « baisse de performance » (seuil 80 %)', () => {
  // La montée en ponte dure 28 jours à partir du 2026-03-01,
  // donc le seuil ne s'évalue qu'à partir du 2026-03-29.
  const APRES_PIC = '2026-03-29';

  it('reste muette à 80 % pile — le seuil est strict', () => {
    const journees = analyserProduction({
      ...base,
      dateFin: APRES_PIC,
      recoltes: [recolte(APRES_PIC, 80)],
    });
    expect(codes(journees, APRES_PIC)).toEqual([]);
  });

  it('se déclenche à 79 %', () => {
    const journees = analyserProduction({
      ...base,
      dateFin: APRES_PIC,
      recoltes: [recolte(APRES_PIC, 79)],
    });
    expect(codes(journees, APRES_PIC)).toEqual(['baisse_production']);
  });

  it('ne s’évalue PAS pendant la montée en ponte', () => {
    // 25 % au 10e jour de ponte : normal pour une bande qui démarre.
    // Alerter ici noierait les vraies chutes sous un mois de bruit quotidien.
    const journees = analyserProduction({
      ...base,
      dateFin: '2026-03-10',
      recoltes: [recolte('2026-03-10', 25)],
    });
    const jour = journees.find((j) => j.jour === '2026-03-10');
    expect(jour?.enMonteePonte).toBe(true);
    expect(jour?.alertes).toHaveLength(0);
  });

  it('s’active dès le lendemain de la fin de montée en ponte', () => {
    const veille = '2026-03-28';
    const journees = analyserProduction({
      ...base,
      dateFin: APRES_PIC,
      recoltes: [recolte(veille, 40), recolte(APRES_PIC, 40)],
    });
    expect(codes(journees, veille)).toEqual([]);
    expect(codes(journees, APRES_PIC)).toEqual(['baisse_production']);
  });

  it('se calcule sur l’effectif RÉEL du jour, pas sur l’effectif initial', () => {
    // 40 poules mortes → effectif 60. 50 œufs = 83 % de 60 : pas d'alerte,
    // alors que 50/100 = 50 % de l'effectif initial en aurait déclenché une.
    const journees = analyserProduction({
      ...base,
      mouvements: [{ type: 'mortalite', quantite: 40, dateMouvement: '2026-03-05' }],
      dateFin: APRES_PIC,
      recoltes: [recolte(APRES_PIC, 50)],
    });
    const jour = journees.find((j) => j.jour === APRES_PIC);
    expect(jour?.effectifJour).toBe(60);
    expect(jour?.alertes).toHaveLength(0);
  });

  it('ne se cumule pas avec l’alerte d’absence de récolte', () => {
    // Un jour sans saisie ne doit PAS être lu comme une production nulle,
    // sinon l'utilisateur voit un effondrement inexistant.
    const journees = analyserProduction({ ...base, dateFin: '2026-03-15', recoltes: [] });
    expect(codes(journees, '2026-03-15')).toEqual(['absence_recolte']);
  });

  it('agrège plusieurs ramassages du même jour', () => {
    // 3 créneaux × 30 œufs = 90 sur 100 poules : au-dessus du seuil.
    const journees = analyserProduction({
      ...base,
      dateFin: APRES_PIC,
      recoltes: [recolte(APRES_PIC, 30), recolte(APRES_PIC, 30), recolte(APRES_PIC, 30)],
    });
    const jour = journees.find((j) => j.jour === APRES_PIC);
    expect(jour?.oeufsRecoltes).toBe(90);
    expect(jour?.tauxPonte).toBe(90);
    expect(jour?.alertes).toHaveLength(0);
  });
});

describe('déduction du début de ponte', () => {
  it('retient la première récolte non nulle', () => {
    expect(
      deduireDebutPonte([recolte('2026-03-05', 12), recolte('2026-03-03', 4), recolte('2026-03-01', 0)]),
    ).toBe('2026-03-03');
  });

  it('renvoie null si aucune ponte', () => {
    expect(deduireDebutPonte([])).toBeNull();
    expect(deduireDebutPonte([recolte('2026-03-01', 0)])).toBeNull();
  });
});
