'use strict';
// Mapper kildens kjedenavn -> vår kanoniske chain (chains.canonical).
const MAP = {
  'kiwi': 'KIWI',
  'rema 1000': 'REMA 1000', 'rema': 'REMA 1000',
  'meny': 'MENY',
  'extra': 'Coop Extra', 'coop extra': 'Coop Extra',
  'obs': 'Coop Obs', 'obs!': 'Coop Obs', 'coop obs': 'Coop Obs',
  'coop prix': 'Coop Prix', 'coop mega': 'Coop Mega', 'coop marked': 'Coop Marked',
  'coop': 'Coop',
  'spar': 'SPAR', 'eurospar': 'EUROSPAR',
  'joker': 'Joker', 'bunnpris': 'Bunnpris', 'matkroken': 'Matkroken',
  'nærbutikken': 'Nærbutikken', 'narbutikken': 'Nærbutikken',
};
function toChain(name) {
  if (!name) return null;
  return MAP[String(name).trim().toLowerCase()] || null;
}
module.exports = { toChain, MAP };
