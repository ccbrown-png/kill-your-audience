// Render layers. Layer 0 is the world. Things held in front of the camera (hands, the can in hand)
// go on the viewmodel layer, which is drawn after the world with a fresh depth buffer, so walls
// and the curtain can never cut through them, but they still hide their own back faces correctly.
export const WORLD_LAYER = 0;
export const VIEWMODEL_LAYER = 1;

/** Moves an object and everything inside it onto one layer. */
export function setLayerDeep(object, layer) {
  object.traverse((child) => child.layers.set(layer));
}
