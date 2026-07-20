import { describe, expect, it } from 'vitest';
import { hacherMotDePasse, verifierMotDePasse, LONGUEUR_MIN_MOT_DE_PASSE } from './password';

describe('hachage des mots de passe', () => {
  it('accepte le bon mot de passe', async () => {
    const hash = await hacherMotDePasse('correct-cheval-batterie');
    expect(await verifierMotDePasse('correct-cheval-batterie', hash)).toBe(true);
  });

  it('refuse un mot de passe faux', async () => {
    const hash = await hacherMotDePasse('correct-cheval-batterie');
    expect(await verifierMotDePasse('correct-cheval-batteri', hash)).toBe(false);
    expect(await verifierMotDePasse('', hash)).toBe(false);
    expect(await verifierMotDePasse('Correct-Cheval-Batterie', hash)).toBe(false);
  });

  it('produit un hash différent à chaque appel (sel aléatoire)', async () => {
    const a = await hacherMotDePasse('meme-mot-de-passe');
    const b = await hacherMotDePasse('meme-mot-de-passe');
    // Deux comptes avec le même mot de passe ne doivent pas être repérables
    // par comparaison de leurs hash.
    expect(a).not.toBe(b);
    expect(await verifierMotDePasse('meme-mot-de-passe', a)).toBe(true);
    expect(await verifierMotDePasse('meme-mot-de-passe', b)).toBe(true);
  });

  it('ne stocke jamais le mot de passe en clair', async () => {
    const hash = await hacherMotDePasse('mot-de-passe-secret');
    expect(hash).not.toContain('mot-de-passe-secret');
  });

  it('embarque ses paramètres, pour pouvoir les durcir plus tard', async () => {
    const hash = await hacherMotDePasse('un-mot-de-passe');
    expect(hash.startsWith('scrypt$65536$8$1$')).toBe(true);
    expect(hash.split('$')).toHaveLength(6);
  });

  it('refuse un mot de passe trop court', async () => {
    await expect(hacherMotDePasse('court')).rejects.toThrow(
      new RegExp(String(LONGUEUR_MIN_MOT_DE_PASSE)),
    );
  });

  it('renvoie false — sans lever — sur un hash corrompu', async () => {
    // Une exception ici distinguerait « compte inexistant » de
    // « mot de passe faux » dans les logs et les temps de réponse.
    for (const mauvais of ['', 'pas-un-hash', 'scrypt$', 'bcrypt$1$2$3$4$5', 'scrypt$a$b$c$$']) {
      expect(await verifierMotDePasse('peu-importe', mauvais)).toBe(false);
    }
  });

  it('traite les équivalents Unicode comme identiques (normalisation NFKC)', async () => {
    // « é » composé et « é » décomposé s'affichent pareil : un clavier
    // différent ne doit pas empêcher la connexion.
    const compose = 'café-motdepasse';
    const decompose = 'café-motdepasse';
    const hash = await hacherMotDePasse(compose);
    expect(await verifierMotDePasse(decompose, hash)).toBe(true);
  });
});
