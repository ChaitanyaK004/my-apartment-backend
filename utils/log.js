export function logSaved(collection, doc) {
  const data = typeof doc?.toJSON === "function" ? doc.toJSON() : doc;
  console.log(`\n💾 Saved in MongoDB → collection "${collection}"`);
  console.dir(data, { depth: 4, colors: true });
  console.log("");
}
