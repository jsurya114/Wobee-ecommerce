/**
 * Renders one schema.org JSON-LD block (Week 2 Day 9, week2 (1).md §19 —
 * "Product structured data"). `JSON.stringify` doesn't escape `<` inside
 * string values, so a product name/description containing a literal
 * `</script>` (admin-entered content, not something this app controls)
 * could otherwise break out of the script tag — escaped to `<` here,
 * the standard fix for this exact JSON-in-HTML footgun.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
