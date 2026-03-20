async function main() {
  const fs = await import("node:fs");

  // Check law data
  const law = JSON.parse(fs.readFileSync("data/laws/N0030001.json", "utf-8"));
  console.log("=== Law Data ===");
  console.log("Name:", law.name);
  console.log("Date:", law.effectiveDate);
  console.log("Articles:", law.totalArticles);
  console.log("Chapters:", law.chapters.length);
  console.log("");
  console.log("First article:");
  console.log("  No:", law.articles[0].articleNo);
  console.log("  Chapter:", law.articles[0].chapter);
  console.log("  Content:", law.articles[0].content.substring(0, 120));
  console.log("");

  // Check all chunks
  const chunks = JSON.parse(
    fs.readFileSync("data/chunks/_all_chunks.json", "utf-8")
  );
  console.log("=== All Chunks ===");
  console.log("Total:", chunks.length);

  const sources = {};
  chunks.forEach((chunk) => {
    sources[chunk.sourceId] = (sources[chunk.sourceId] || 0) + 1;
  });
  Object.entries(sources).forEach(([key, value]) =>
    console.log(`  ${key}: ${value} chunks`)
  );

  console.log("");
  console.log("Sample chunk keys:", Object.keys(chunks[0]).join(", "));
  console.log("Sample text preview:", chunks[0].text.substring(0, 150));
}

main().catch(console.error);
