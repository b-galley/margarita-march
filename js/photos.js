// Photo uploads — stored as compressed base64 JPEGs directly in the Realtime Database
// (no Firebase Storage/Blaze plan, per Blake's constraint), in their own `photoMeta`
// node independent of `stops`. That independence is the actual fix for the old app's
// bug: there, photos lived on the stop object and got wiped by ANY concurrent stop
// edit, because the stops listener rebuilt the whole array with `photo: null` every
// time. Here, editing a stop can never touch photoMeta at all.

import { SERVER_TIMESTAMP } from './firebase.js';
import { getRoomRef, getRoomState } from './room.js';

const MAX_DIMENSION = 1000; // longest edge, px — plenty for a phone-screen thumbnail
const JPEG_QUALITY = 0.7;

// Downscales + re-encodes an uploaded file into a compressed JPEG data URL. Keeps
// mobile data usage (and RTDB storage) sane for a burst of photos on crawl night —
// a phone photo straight off the camera can be 5-10MB; this gets it down to ~100-300KB.
export function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not read that image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export async function uploadPhoto(stopId, file) {
  const { userName } = getRoomState();
  const dataUrl = await compressImageFile(file);
  await getRoomRef()
    .child(`photoMeta/${stopId}/${userName}`)
    .set({ dataUrl, uploadedAt: SERVER_TIMESTAMP });
}

// onChange(photoMeta) fires with the live, full photoMeta tree:
// { stopId: { userName: {dataUrl, uploadedAt} } }
export function attachPhotoMetaListener(onChange) {
  const ref = getRoomRef().child('photoMeta');
  const listener = (snap) => onChange(snap.val() || {});
  ref.on('value', listener);
  return { ref, event: 'value', listener };
}
