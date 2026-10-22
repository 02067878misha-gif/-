import { plane, rad } from './core.js';

/**
 * Basal structural surface of a sedimentary complex. All layer boundaries
 * within a complex are parallel vertical offsets of this surface.
 *
 * Monocline: retains the historical planar model exactly.
 * Folding: smooth upright, non-plunging sinusoidal anticlines and synclines.
 * Fold width is the horizontal distance between adjacent anticline and
 * syncline axes (half a full oscillation); amplitude is the distance from
 * the mean structural level to the crest or trough.
 * Strike azimuth is measured clockwise from North and is axial, modulo 180°.
 */
function foldDisplacement(complex, x, y) {
  if (complex.structureType !== 'folding') return 0;
  const strike = rad(complex.foldStrike);
  const across = (x - 100) * Math.cos(strike) - (y - 75) * Math.sin(strike);
  return complex.foldAmplitude * Math.cos(Math.PI * across / complex.foldWidth);
}

function complexBasalSurface(complex, x, y) {
  if (complex.structureType !== 'folding') return plane(complex.baseZ, complex.az, complex.d, x, y);
  return complex.baseZ + foldDisplacement(complex, x, y);
}

// An inverse transform into the older geological coordinate frame.
// Folds are vertical, upright, and non-plunging in the current model.
function undoFoldForOlderRocks(p, complex) {
  if (complex.structureType !== 'folding' || !complex.foldAffectsOlder) return p;
  return {x:p.x, y:p.y, z:p.z-foldDisplacement(complex,p.x,p.y)};
}

export { complexBasalSurface, foldDisplacement, undoFoldForOlderRocks };
