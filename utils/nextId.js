import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { collection: "counters" });
export const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

export async function nextSeq(key) {
  const c = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return c.seq;
}

// Validate first (so failed requests never waste an ID), then give a friendly ID like C006 / VIS-502.
export async function createWithId(Model, data, key, prefix, pad = 0) {
  const doc = new Model(data);
  await doc.validate();
  doc.id = `${prefix}${String(await nextSeq(key)).padStart(pad, "0")}`;
  await doc.save();
  return doc;
}
