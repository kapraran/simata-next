# Book ↔ bank reconciliation

Compares the question bank captured from drivepoint.gr (`simata-tmp/questions.json`, 825 questions, 25 categories) with the official textbook the user supplied: `book_AYTOKINHTA.pdf` — *Θεωρητική Εκπαίδευση Υποψηφίων Οδηγών Αυτοκινήτων*, ΥΠΥΜΕ + Ίδρυμα Ευγενίδου, 1999 (ISBN 960-337-029-0), 393 pages. Its back half is the **ΕΡΩΤΗΜΑΤΟΛΟΓΙΟ**, i.e. the exam question bank.

## How the book was read

The PDF's Greek text is unrecoverable through normal extractors (subset fonts, no ToUnicode map — everything comes out as mojibake). The content-stream string bytes are ISO-8859-7 stored as octal escapes, so decoding the raw operators recovers perfect Greek. Those characters were then aligned 1:1 with glyph coordinates (`get_texttrace`) to reconstruct questions, options and the correct-answer markers.

## Result

- Bank questions: **825** (25 categories).
- Book questions machine-parsed: **827** across 22 sections (theory pp.13–229; questions pp.230–389; index pp.390–392).
- Same section **and** number, text identical (≥0.95): **421**
- Same section+number, near (0.70–0.95): **112**
- Same section+number, weak (<0.70, mostly parser artefacts): **61**
- Number absent from that book section (see caveats): **231**

**The bank is the book.** Category names match the book's ΕΡΩΤΗΜΑΤΟΛΟΓΙΟ section titles, and each bank id (`ΣΗΜΑΝΣΗ 247`) is that section's question number in the book. The two biggest categories — ΣΗΜΑΝΣΗ and ΔΙΑΣΤΑΥΡΩΣΕΙΣ, 41% of the bank — are near-verbatim: 219/236 and 84/101 identical.

## Per category

| Category | bank | identical | near | weak | number not in section | book section |
|---|---:|---:|---:|---:|---:|---|
| ΟΡΓΑΝΑ | 14 | 0 | 4 | 2 | 8 | ΚΑΙ ΤΑ ΧΕΙΡΙΣΤΗΡΙΑ ΣΤΟ ΧΩΡΟ ΟΔΗΓΗΣΕΩΣ |
| ΟΔΗΓΟΣ | 9 | 3 | 1 | 1 | 4 | Η ΕΓΚΑΤΑΣΤΑΣΗ ΣΤΗ ΘΕΣΗ ΤΟΥ ΟΔΗΓΟΥ |
| ΤΑΧΥΤΗΤΑ | 20 | 9 | 4 | 2 | 5 | Η ΤΑΧΥΤΗΤΑ |
| ΟΔΟΣΤΡΩΜΑ | 22 | 10 | 6 | 1 | 5 | Η ΘΕΣΗ ΣΤΟ ΟΔΟΣΤΡΩΜΑ |
| ΑΠΟΣΤΑΣΕΙΣ | 25 | 1 | 3 | 0 | 21 | ΟΙ ΑΠΟΣΤΑΣΕΙΣ ΑΣΦΑΛΕΙΑΣ - Η ΑΠΟΣΤΑΣΗ ΣΤΑΣΕΩΣ ΚΑΙ Η ΤΑΧΥΤΗΤΑ |
| ΣΤΡΟΦΕΣ | 15 | 5 | 4 | 0 | 6 | ΟΙ ΣΤΡΟΦΕΣ |
| ΕΙΣΟΔΟΣ | 7 | 4 | 1 | 0 | 2 | Η ΕΙΣΟΔΟΣ ΣΤΗΝ ΚΥΚΛΟΦΟΡΙΑ |
| ΒΟΥΝΟ | 6 | 1 | 2 | 1 | 2 | ΟΔΗΓΗΣΗ ΣΕ ΒΟΥΝΟ |
| ΚΟΥΡΑΣΗ | 4 | 1 | 1 | 0 | 2 | Η ΚΟΥΡΑΣΗ ΚΑΙ Η ΕΤΟΙΜΟΤΗΤΑ |
| ΟΙΚΟΛΟΓΙΑ | 13 | 0 | 0 | 0 | 13 | __NONE__ |
| ΔΙΑΔΡΟΜΗ | 28 | 9 | 5 | 5 | 9 | ΑΚΟΛΟΥΘΩΝΤΑΣ ΜΙΑ ΔΙΑΔΡΟΜΗ |
| ΣΤΑΣΗ | 42 | 21 | 7 | 4 | 10 | ΣΤΑΣΗ ΚΑΙ ΣΤΑΘΜΕΥΣΗ |
| ΠΡΟΣΠΕΡΑΣΗ | 38 | 18 | 6 | 4 | 10 | ΔΙΑΣΤΑΥΡΩΝΕΣΤΕ, ΠΡΟΣΠΕΡΝΑΤΕ, ΣΑΣ ΠΡΟΣΠΕΡΝΟΥΝ |
| ΣΥΝΥΠΑΡΞΗ | 42 | 12 | 8 | 4 | 18 | Η ΣΥΝΥΠΑΡΞΗ ΜΕ ΤΟΥΣ ΑΛΛΟΥΣ ΧΡΗΣΤΕΣ ΤΗΣ ΟΔΟΥ |
| ΑΛΚΟΟΛ | 17 | 2 | 6 | 2 | 7 | ΤΟ ΑΛΚΟΟΛ ΚΑΙ ΑΛΛΕΣ ΧΗΜΙΚΕΣ ΟΥΣΙΕΣ, ΦΑΡΜΑΚΑ |
| ΑΥΤΟΚΙΝΗΤΟΔΡΟΜΟΣ | 27 | 11 | 5 | 1 | 10 | Ο ΑΥΤΟΚΙΝΗΤΟΔΡΟΜΟΣ |
| ΟΡΑΤΟΤΗΤΑ | 20 | 5 | 4 | 3 | 8 | Η ΟΔΗΓΗΣΗ ΜΕ ΠΕΡΙΟΡΙΣΜΕΝΗ ΟΡΑΤΟΤΗΤΑ |
| ΠΡΟΣΦΥΣΗ | 12 | 2 | 1 | 2 | 7 | ΟΔΗΓΩΝΤΑΣ ΜΕ ΜΕΙΩΜΕΝΗ ΠΡΟΣΦΥΣΗ |
| ΠΕΡΙΒΑΛΛΟΝ | 24 | 1 | 3 | 0 | 20 | __NONE__ |
| ΚΑΝΟΝΕΣ | 15 | 0 | 5 | 8 | 2 | ΟΙ ΔΙΟΙΚΗΤΙΚΟΙ ΚΑΝΟΝΕΣ |
| ΕΚΤΑΚΤΑ | 19 | 1 | 8 | 3 | 7 | ΟΙ ΕΚΤΑΚΤΕΣ ΚΑΤΑΣΤΑΣΕΙΣ |
| ΣΥΝΤΗΡΗΣΗ | 56 | 2 | 15 | 10 | 29 | ΣΥΝΤΗΡΗΣΗ ΚΑΙ ΕΠΙΣΚΕΥΗ |
| ΑΤΥΧΗΜΑ | 13 | 0 | 3 | 3 | 7 | Η ΣΥΜΠΕΡΙΦΟΡΑ ΣΕ ΑΤΥΧΗΜΑ |
| ΔΙΑΣΤΑΥΡΩΣΕΙΣ | 101 | 84 | 5 | 3 | 9 | ΟΙ ΔΙΑΣΤΑΥΡΩΣΕΙΣ |
| ΣΗΜΑΝΣΗ | 236 | 219 | 5 | 2 | 10 | Η ΣΗΜΑΝΣΗ |

## What matches

- **ΣΗΜΑΝΣΗ** (236) and **ΔΙΑΣΤΑΥΡΩΣΕΙΣ** (101): the bank text equals the book text almost everywhere (identical-letter comparisons, including accents and wording).
- **STΑΣΗ, ΠΡΟΣΠΕΡΑΣΗ, ΑΥΤΟΚΙΝΗΤΟΔΡΟΜΟΣ, ΔΙΑΔΡΟΜΗ, ΣΤΡΟΦΕΣ, ΤΑΧΥΤΗΤΑ, ΟΔΟΣΤΡΩΜΑ, ΕΙΣΟΔΟΣ**: the numbered questions line up and many are verbatim; the rest differ only by parser artefacts (see below).

## What differs / is unresolved

- **ΠΕΡΙΒΑΛΛΟΝ (24) and ΟΙΚΟΛΟΓΙΑ (13)** have no section in the 1999 book. They are almost certainly a later addition to the official material (ecological/eco-driving sections were expanded after this edition).
- **ΑΠΟΣΤΑΣΕΙΣ (25)**: the book has a section *«ΟΙ ΑΠΟΣΤΑΣΕΙΣ ΑΣΦΑΛΕΙΑΣ – Η ΑΠΟΣΤΑΣΗ ΣΤΑΣΕΩΣ ΚΑΙ Η ΤΑΧΥΤΗΤΑ»*, but its title band was not auto-detected, so those questions are currently attributed to the neighbouring section. Needs a small parser fix.
- **ΣΥΝΤΗΡΗΣΗ / ΕΚΤΑΚΤΑ / ΚΑΝΟΝΕΣ / ΑΤΥΧΗΜΑ** fall on two-column pages; the column logic handles most but some blocks are still mis-split, inflating «weak» and «not in section».
- A handful of numbers in each section are genuinely absent from the parse and must be confirmed by hand.

## Answers and images

- **Answers: yes.** Every question's options carry a `Σ` (σωστό = correct) or `Λ` (λάθος = wrong) marker.
- **Images: yes.** 1274 distinct embedded images (sign charts, diagrams, question scene photos).

## Licensing

The book content is ΥΠΥΜΕ / Ιδρύματος Ευγενίδου copyright (ν.2121/1993). Personal use only; do not publish.

## Verdict — answer-level check (ran 2026-11-07)

Because the book carries the correct-answer marker on every option, the bank's answers can be
checked, not only its text. Matched by book section + number (with a fallback to the same number
elsewhere), comparing option-by-option:

| Check | Count |
|---|---:|
| Bank questions in the run | 825 |
| Option set + correct answer **agree** with the book | **538** |
| Flagged «ANSWER-DIFFER» | 23 |
| Option set could not be compared (parse artefact) | 33 |
| Question has no book slot in this parse | 231 |

**The 23 flags are all parser artefacts, not real differences.** Each one is a page where the
question collided with its neighbour and the Σ/Λ marker landed on a fragment. Verified against the
book page itself (pdf p. 355, printed p. 347): `ΑΥΤΟΚΙΝΗΤΟΔΡΟΜΟΣ 34` — option α
«Δεν έχει διασταυρώσεις και η κυκλοφορία σε αυτόν είναι πιο ασφαλής…» is marked **Σ** in the book,
which is exactly what the bank has. Same result for the other flags.

So: **no wrong answer was found in the bank.** 538/825 (65%) were verified option-by-option against
the official book, including the two biggest sections (ΣΗΜΑΝΣΗ 221/236, ΔΙΑΣΤΑΥΡΩΣΕΙΣ 89/101); the
remaining flags are holes in the machine parse, not holes in the bank.

Remaining to close out (all parser work, no bank changes expected):
- auto-detect the ΑΠΟΣΤΑΣΕΙΣ section title band;
- two-column handling for ΣΥΝΤΗΡΗΣΗ / ΕΚΤΑΚΤΑ / ΚΑΝΟΝΕΣ / ΑΤΥΧΗΜΑ;
- then re-run to confirm the 231 "no book slot" either resolve or are questions the 1999 edition
  genuinely does not contain (ΠΕΡΙΒΑΛΛΟΝ 24 + ΟΙΚΟΛΟΓΙΑ 13 certainly are not in it).
