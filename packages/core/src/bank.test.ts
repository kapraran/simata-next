import { describe, expect, it } from "vitest";
import { buildBank, imageHashFromUrl, mentionsPicture, validateRawQuestion } from "./bank";

const H = "a".repeat(64);
const url = (h: string) => `https://x.gr/assets/b02-${h}.jpg`;
const opts = [
  { text: "a", correct: false },
  { text: "b", correct: true },
];

describe("imageHashFromUrl", () => {
  it("extracts the sha256 from the filename", () => {
    expect(imageHashFromUrl(url(H))).toBe(H);
    expect(imageHashFromUrl("https://x.gr/foo.jpg")).toBeUndefined();
  });
});

describe("validateRawQuestion", () => {
  it("accepts one correct option", () => {
    expect(validateRawQuestion({ id: "A 1", category: "A", text: "t", options: opts })).toEqual([]);
  });
  it("rejects zero or several correct options and duplicate texts", () => {
    const none = opts.map((o) => ({ ...o, correct: false }));
    expect(validateRawQuestion({ id: "A 1", category: "A", text: "t", options: none })).toContain(
      "0 correct options (need exactly 1)",
    );
    const dup = [opts[0]!, { ...opts[0]!, correct: true }];
    expect(validateRawQuestion({ id: "A 1", category: "A", text: "t", options: dup })).toContain(
      "duplicate option text",
    );
  });
});

describe("buildBank", () => {
  it("maps available images to media keys and flags the lost ones", () => {
    const B = "b".repeat(64);
    const { bank, missingImages } = buildBank(
      [
        { id: "A 1", category: "A", text: "t", options: opts, image: url(H) },
        { id: "A 2", category: "A", text: "t", options: opts, image: url(B) },
        { id: "A 3", category: "B", text: "t", options: opts },
      ],
      new Set([H]),
      "v1",
    );
    expect(bank.questions[0]).toMatchObject({ image: `media/${H}.jpg` });
    expect(bank.questions[1]?.imageMissing).toBe(true);
    expect(bank.questions[1]?.disabled).toBeUndefined();
    expect(bank.questions[2]?.imageMissing).toBeUndefined();
    expect(missingImages).toEqual([{ id: "A 2", reason: "image file missing" }]);
    expect(bank.categories).toEqual(["A", "B"]);
  });
  it("flags questions that mention a picture without one", () => {
    expect(mentionsPicture("Ποια πινακίδα ισχύει;")).toBe(true);
    const r = buildBank(
      [{ id: "A 1", category: "A", text: "Η πινακίδα", options: opts }],
      new Set(),
      "v",
    );
    expect(r.suspicious).toHaveLength(1);
  });
});
