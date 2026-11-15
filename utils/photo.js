// Staff photos are stored inside the document as a small data URL (the website resizes them to 256px
// before upload), or as an https:// link. This keeps the project free of extra file-storage services.
const DATA_URL = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_LENGTH = 700_000; // ~500 KB image

export const photoField = {
  type: String,
  trim: true,
  validate: {
    validator: (v) => !v || (v.length <= MAX_LENGTH && (DATA_URL.test(v) || /^https:\/\/\S+$/i.test(v))),
    message: "Photo must be a PNG/JPEG/WebP image under 500 KB or an https:// link",
  },
};
