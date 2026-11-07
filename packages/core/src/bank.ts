export type RawOption = { text: string; correct: boolean };
export type RawQuestion = {
  id: string;
  category: string;
  text: string;
  options: RawOption[];
  image?: string;
};

export type Question = {
  id: string;
  category: string;
  text: string;
  options: RawOption[];
  /** Blob key of the image, e.g. "media/<sha256>.jpg". */
  image?: string;
  /** The raw question had a picture, but the file is lost. Shown with a placeholder. */
  imageMissing?: true;
  /** True when the question can't be shown at all (e.g. it fails validation). */
  disabled?: true;
};

export type Bank = {
  version: string;
  categories: string[];
  questions: Question[];
};

/** Content hash that drivepoint put in the image filename: `<code>-<sha256>.jpg`. */
export function imageHashFromUrl(url: string): string | undefined {
  const file = url.split("/").pop() ?? "";
  return /-([0-9a-f]{64})\.jpg$/.exec(file)?.[1];
}

export function mediaKey(sha256: string): string {
  return `media/${sha256}.jpg`;
}

/** Problems that make a raw question unusable. Empty array = valid. */
export function validateRawQuestion(q: RawQuestion): string[] {
  const problems: string[] = [];
  if (!q.id) problems.push("missing id");
  if (!q.text.trim()) problems.push("empty text");
  if (q.options.length < 2) problems.push(`only ${q.options.length} options`);
  const correct = q.options.filter((o) => o.correct).length;
  if (correct !== 1) problems.push(`${correct} correct options (need exactly 1)`);
  if (new Set(q.options.map((o) => o.text)).size !== q.options.length)
    problems.push("duplicate option text");
  return problems;
}

/** Text hints that the question can't be answered without its picture. */
export function mentionsPicture(text: string): boolean {
  return /πινακίδ|εικόν|σχήμα|σε αυτ[ήό]ν? την (περίπτωση|κατάσταση)|στην εικόνα|στο σχήμα/i.test(
    text,
  );
}

export type BuildResult = {
  bank: Bank;
  missingImages: { id: string; reason: string }[];
  invalid: { id: string; problems: string[] }[];
  suspicious: { id: string; reason: string }[];
};

/**
 * Turn raw scraped questions into the canonical bank.
 * @param imageAvailable which image content hashes exist as files
 */
export function buildBank(
  raw: RawQuestion[],
  imageAvailable: ReadonlySet<string>,
  version: string,
): BuildResult {
  const missingImages: BuildResult["missingImages"] = [];
  const invalid: BuildResult["invalid"] = [];
  const suspicious: BuildResult["suspicious"] = [];
  const seen = new Set<string>();
  const questions: Question[] = [];

  for (const r of raw) {
    const problems = validateRawQuestion(r);
    if (seen.has(r.id)) problems.push("duplicate id");
    seen.add(r.id);

    const q: Question = { id: r.id, category: r.category, text: r.text, options: r.options };

    if (r.image) {
      const hash = imageHashFromUrl(r.image);
      if (hash && imageAvailable.has(hash)) q.image = mediaKey(hash);
      else {
        q.imageMissing = true;
        missingImages.push({
          id: r.id,
          reason: hash ? "image file missing" : "unparseable image url",
        });
      }
    } else if (mentionsPicture(r.text)) {
      suspicious.push({ id: r.id, reason: "text mentions a picture but no image" });
    }

    if (problems.length) {
      invalid.push({ id: r.id, problems });
      q.disabled = true;
    }
    questions.push(q);
  }

  const categories = [...new Set(questions.map((q) => q.category))];
  return { bank: { version, categories, questions }, missingImages, invalid, suspicious };
}
