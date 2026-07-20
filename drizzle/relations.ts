import { relations } from "drizzle-orm/relations";
import { fermes, tarifsReference, users, bandes, mouvementsEffectif, recoltesOeufs, sortiesOeufs, alimentations, modelesProphylaxie, modelesProphylaxieLignes, interventionsSante, depenses } from "./schema";

export const tarifsReferenceRelations = relations(tarifsReference, ({one, many}) => ({
	ferme: one(fermes, {
		fields: [tarifsReference.fermeId],
		references: [fermes.id]
	}),
	mouvementsEffectifs: many(mouvementsEffectif),
	sortiesOeufs: many(sortiesOeufs),
}));

export const fermesRelations = relations(fermes, ({many}) => ({
	tarifsReferences: many(tarifsReference),
	users: many(users),
	bandes: many(bandes),
	modelesProphylaxies: many(modelesProphylaxie),
	depenses: many(depenses),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	ferme: one(fermes, {
		fields: [users.fermeId],
		references: [fermes.id]
	}),
	mouvementsEffectifs: many(mouvementsEffectif),
	recoltesOeufs: many(recoltesOeufs),
	sortiesOeufs: many(sortiesOeufs),
	depenses: many(depenses),
}));

export const bandesRelations = relations(bandes, ({one, many}) => ({
	ferme: one(fermes, {
		fields: [bandes.fermeId],
		references: [fermes.id]
	}),
	mouvementsEffectifs: many(mouvementsEffectif),
	recoltesOeufs: many(recoltesOeufs),
	sortiesOeufs: many(sortiesOeufs),
	alimentations: many(alimentations),
	interventionsSantes: many(interventionsSante),
	depenses: many(depenses),
}));

export const mouvementsEffectifRelations = relations(mouvementsEffectif, ({one}) => ({
	bande: one(bandes, {
		fields: [mouvementsEffectif.bandeId],
		references: [bandes.id]
	}),
	user: one(users, {
		fields: [mouvementsEffectif.createdBy],
		references: [users.id]
	}),
	tarifsReference: one(tarifsReference, {
		fields: [mouvementsEffectif.tarifId],
		references: [tarifsReference.id]
	}),
}));

export const recoltesOeufsRelations = relations(recoltesOeufs, ({one}) => ({
	bande: one(bandes, {
		fields: [recoltesOeufs.bandeId],
		references: [bandes.id]
	}),
	user: one(users, {
		fields: [recoltesOeufs.createdBy],
		references: [users.id]
	}),
}));

export const sortiesOeufsRelations = relations(sortiesOeufs, ({one}) => ({
	bande: one(bandes, {
		fields: [sortiesOeufs.bandeId],
		references: [bandes.id]
	}),
	user: one(users, {
		fields: [sortiesOeufs.createdBy],
		references: [users.id]
	}),
	tarifsReference: one(tarifsReference, {
		fields: [sortiesOeufs.tarifId],
		references: [tarifsReference.id]
	}),
}));

export const alimentationsRelations = relations(alimentations, ({one}) => ({
	bande: one(bandes, {
		fields: [alimentations.bandeId],
		references: [bandes.id]
	}),
}));

export const modelesProphylaxieRelations = relations(modelesProphylaxie, ({one, many}) => ({
	ferme: one(fermes, {
		fields: [modelesProphylaxie.fermeId],
		references: [fermes.id]
	}),
	modelesProphylaxieLignes: many(modelesProphylaxieLignes),
}));

export const modelesProphylaxieLignesRelations = relations(modelesProphylaxieLignes, ({one}) => ({
	modelesProphylaxie: one(modelesProphylaxie, {
		fields: [modelesProphylaxieLignes.modeleId],
		references: [modelesProphylaxie.id]
	}),
}));

export const interventionsSanteRelations = relations(interventionsSante, ({one}) => ({
	bande: one(bandes, {
		fields: [interventionsSante.bandeId],
		references: [bandes.id]
	}),
}));

export const depensesRelations = relations(depenses, ({one}) => ({
	bande: one(bandes, {
		fields: [depenses.bandeId],
		references: [bandes.id]
	}),
	user: one(users, {
		fields: [depenses.createdBy],
		references: [users.id]
	}),
	ferme: one(fermes, {
		fields: [depenses.fermeId],
		references: [fermes.id]
	}),
}));