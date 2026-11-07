import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export const LANGS = ["en", "el"] as const;
export type Lang = (typeof LANGS)[number];

const LANG_KEY = "simata:lang";

const en = {
  app: {
    home: "Simata home",
    stats: "Stats",
    settings: "Settings",
    sync: {
      offline: "Offline or server unreachable. Your answers are saved here and will upload later.",
      syncing: "Syncing",
      pending: (n: number) => `${n} ${n === 1 ? "answer" : "answers"} waiting to upload`,
      synced: "All synced",
    },
  },
  home: {
    noBank: {
      title: "No question bank",
      body: "The server has no bank and this device has none cached yet. Seed it with the import tool, then reload.",
    },
    hero: "Ready to roll?",
    stat: {
      today: "Answered today",
      unseen: "Never seen",
      confident: "Confident",
      weak: "Weak spots",
    },
    passMeter: {
      aria: (chance: number) => `${chance} percent chance to pass`,
      title: "Chance to pass a mock exam today",
      started: "Worked out from how well you remember each question right now.",
      notStarted: "Answer a few questions and this starts to move.",
    },
    train: "Train",
    mockExam: "Mock exam",
    weak: "Weak",
    missingPictures: (n: number) =>
      `${n} ${n === 1 ? "question lost its" : "questions lost their"} picture. They are shown with a placeholder.`,
  },
  quiz: {
    empty: {
      train: "Every question is marked easy or disabled. Nothing left to practise.",
      weak: "No weak spots right now. Nice.",
    },
    toast: {
      hard: "Hard · you'll see it more",
      easy: "Easy · retired",
    },
    unknownMode: "Unknown mode.",
    noBank: {
      title: "No question bank",
      body: "The server has no bank and this device has none cached. Run the import (see the README) and reload.",
    },
    stop: "Stop run",
    sortedThisRun: "Sorted this run",
    streakAria: (n: number) => `${n} in a row`,
    streakToast: (n: number) => `${n} in a row. Keep going`,
    missingQuestion: (id: string) => `Question ${id} is missing from the bank.`,
    summary: {
      allClear: "All clear",
      home: "Home",
      stopped: "You stopped the run",
      exhausted: "Nothing left to practise",
      answered: (n: number, right: number, avg: string) =>
        `${n} answered · ${right} right · ${avg} s each`,
      bestStreak: (n: number) => `Best streak ${n}`,
      piles: {
        hard: { label: "Hard", what: "Comes back more often." },
        guessed: {
          label: "Guessed",
          what: "Right, but luck. Graded as hard.",
        },
        next: { label: "Next", what: "Stays on the even rotation." },
        easy: { label: "Easy", what: "Retired. Won't show again." },
      },
      drillWeak: "Drill weak spots",
      keepGoing: "Keep going",
    },
  },
  exam: {
    noBank: "No question bank yet.",
    missingQuestion: (id: string) => `Question ${id} is missing from the bank.`,
    position: (index: number, total: number) => `Question ${index} of ${total}`,
    intro: {
      title: "Mock exam",
      description: (questions: number, minutes: number, maxWrong: number) =>
        `${questions} questions, ${minutes} minutes. You see the answers only at the end. You pass with at most ${maxWrong} mistake${maxWrong === 1 ? "" : "s"}.`,
      disclaimer:
        "That rule is from unofficial sources. Check it against the official one before relying on it.",
      counts: "Your answers here count towards your schedule like any other.",
      start: "Start",
    },
    pictureLost: "Picture lost — answer without it.",
    quitConfirm: "Leave the exam? It will not be scored.",
    quit: "Quit exam",
    result: {
      passed: "Passed",
      failed: "Not passed",
      score: (right: number, total: number) => `${right} of ${total} right`,
      unanswered: (n: number) => ` (${n} unanswered)`,
      missed: "What you missed",
      you: (picked: string) => `You: ${picked}`,
      right: (text: string) => `Right: ${text}`,
      again: "Another exam",
      home: "Home",
    },
  },
  stats: {
    title: "Stats",
    empty: "Answer some questions and your progress shows up here.",
    passChance: "Chance of passing a mock exam",
    accuracy: "Accuracy per day",
    answers: "Answers per day",
    passChanceSeries: "Pass chance",
    accuracySeries: "Accuracy",
    answersSeries: "Answers",
    exams: "Mock exams",
    noneYet: "None yet.",
    best: (best: number, total: number, streak: number) =>
      `Best score ${best}/${total}. Passed in a row: ${streak}.`,
    pass: "Pass",
    fail: "Fail",
    byCategory: "By category (weakest first)",
    seen: (seen: number, total: number, pct: number) => `${seen}/${total} seen · ${pct}%`,
    mostMissed: "Most missed",
    nothingMissed: "Nothing missed yet.",
    missedDetail: (n: number, seen: number) => `${n} missed of ${seen}`,
    slowest: "Slowest",
    needsRepeats: "Needs a few repeat answers.",
    avgTime: (avg: string) => `${avg} s on average`,
  },
  settings: {
    title: "Settings",
    autoAdvance: "Move on by itself after a right answer",
    language: "Language",
    languageSystem: "System",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    sync: "Sync",
    syncNow: "Sync now",
    pending: (n: number) => `${n} ${n === 1 ? "answer" : "answers"} waiting to upload. `,
    lastFailed: (error: string) => `Last attempt failed: ${error}.`,
    lastSynced: (time: string) => ` Last synced ${time}.`,
    device: (id: string) => `This device: ${id}`,
    deviceUnused: "(not used yet)",
    diagnostics: "Diagnostics",
    diagnosticsHint: (n: number) =>
      `${n} log ${n === 1 ? "entry" : "entries"} on this device. Copy them and send them to share what went wrong.`,
    copyLog: "Copy log",
    copied: "Copied",
    clearLog: "Clear",
  },
  question: {
    stamp: { hard: "HARD", next: "NEXT", easy: "EASY" },
    guessed: "Guessed",
    iGuessed: "I guessed (G)",
    hardHint: "Hard: see it more (H)",
    easyHint: "Easy: stop showing it (E)",
    noteHint: "Note (N)",
    markHard: "Mark hard",
    markEasy: "Mark easy",
    editNote: "Edit note",
    pictureLost: "Picture lost, answer without it",
    notePlaceholder: "Your note for this question",
    correct: "Correct answer",
    yourWrong: "Your answer, wrong",
    hard: "Hard",
    easy: "Easy",
    next: "Next",
  },
};

export type Messages = typeof en;

const el: Messages = {
  app: {
    home: "Αρχική Simata",
    stats: "Στατιστικά",
    settings: "Ρυθμίσεις",
    sync: {
      offline:
        "Εκτός σύνδεσης ή ο διακομιστής δεν αποκρίνεται. Οι απαντήσεις σου αποθηκεύονται εδώ και θα μεταφορτωθούν αργότερα.",
      syncing: "Συγχρονισμός",
      pending: (n) =>
        `${n} ${n === 1 ? "απάντηση περιμένει" : "απαντήσεις περιμένουν"} μεταφόρτωση`,
      synced: "Όλα συγχρονισμένα",
    },
  },
  home: {
    noBank: {
      title: "Δεν υπάρχει τράπεζα ερωτήσεων",
      body: "Ο διακομιστής δεν έχει τράπεζα και αυτή η συσκευή δεν έχει καμία αποθηκευμένη. Φόρτωσέ την με το εργαλείο εισαγωγής και κάνε ανανέωση.",
    },
    hero: "Έτοιμος για δρόμο;",
    stat: {
      today: "Σήμερα",
      unseen: "Αθέατες",
      confident: "Σίγουρες",
      weak: "Αδυναμίες",
    },
    passMeter: {
      aria: (chance) => `${chance} τοις εκατό πιθανότητα επιτυχίας`,
      title: "Πιθανότητα επιτυχίας σε προσομοίωση σήμερα",
      started: "Υπολογίζεται από το πόσο καλά θυμάσαι κάθε ερώτηση τώρα.",
      notStarted: "Απάντησε μερικές ερωτήσεις και θα αρχίσει να ανεβαίνει.",
    },
    train: "Προπόνηση",
    mockExam: "Προσομοίωση",
    weak: "Αδυναμίες",
    missingPictures: (n) =>
      `${n} ${n === 1 ? "ερώτηση έχασε την εικόνα της" : "ερωτήσεις έχασαν την εικόνα τους"}. Εμφανίζονται με εικονίδιο αντί εικόνας.`,
  },
  quiz: {
    empty: {
      train:
        "Όλες οι ερωτήσεις είναι σημασμένες ως εύκολες ή απενεργοποιημένες. Δεν έμεινε τίποτα για εξάσκηση.",
      weak: "Καμία αδυναμία αυτή τη στιγμή. Μπράβο.",
    },
    toast: {
      hard: "Δύσκολο · θα το βλέπεις πιο συχνά",
      easy: "Εύκολο · αποσύρεται",
    },
    unknownMode: "Άγνωστη λειτουργία.",
    noBank: {
      title: "Δεν υπάρχει τράπεζα ερωτήσεων",
      body: "Ο διακομιστής δεν έχει τράπεζα και αυτή η συσκευή δεν έχει καμία αποθηκευμένη. Τρέξε την εισαγωγή (δες το README) και κάνε ανανέωση.",
    },
    stop: "Διακοπή",
    sortedThisRun: "Ταξινόμηση σε αυτή τη σειρά",
    streakAria: (n) => `${n} στη σειρά`,
    streakToast: (n) => `${n} στη σειρά. Συνέχισε!`,
    missingQuestion: (id) => `Η ερώτηση ${id} λείπει από την τράπεζα.`,
    summary: {
      allClear: "Όλα καθαρά",
      home: "Αρχική",
      stopped: "Σταμάτησες τη σειρά",
      exhausted: "Δεν έμεινε τίποτα για εξάσκηση",
      answered: (n, right, avg) => `${n} απαντήσεις · ${right} σωστές · ${avg} δευτ. η καθεμία`,
      bestStreak: (n) => `Καλύτερο σερί ${n}`,
      piles: {
        hard: { label: "Δύσκολο", what: "Επιστρέφει πιο συχνά." },
        guessed: {
          label: "Μάντεψα",
          what: "Σωστό, αλλά από τύχη. Βαθμολογείται ως δύσκολο.",
        },
        next: { label: "Επόμενο", what: "Μένει στην κανονική εναλλαγή." },
        easy: { label: "Εύκολο", what: "Αποσύρεται. Δεν θα ξαναεμφανιστεί." },
      },
      drillWeak: "Εξάσκηση στις αδυναμίες",
      keepGoing: "Συνέχισε",
    },
  },
  exam: {
    noBank: "Δεν υπάρχει ακόμη τράπεζα ερωτήσεων.",
    missingQuestion: (id) => `Η ερώτηση ${id} λείπει από την τράπεζα.`,
    position: (index, total) => `Ερώτηση ${index} από ${total}`,
    intro: {
      title: "Προσομοίωση εξέτασης",
      description: (questions, minutes, maxWrong) =>
        `${questions} ερωτήσεις, ${minutes} λεπτά. Βλέπεις τις απαντήσεις μόνο στο τέλος. Περνάς με ${maxWrong === 1 ? "ένα λάθος" : `${maxWrong} λάθη`} το πολύ.`,
      disclaimer:
        "Ο κανόνας αυτός προέρχεται από ανεπίσημες πηγές. Επαλήθευσέ τον με τον επίσημο πριν βασιστείς σε αυτόν.",
      counts: "Οι απαντήσεις εδώ μετρούν στο πρόγραμμά σου όπως όλες οι άλλες.",
      start: "Έναρξη",
    },
    pictureLost: "Η εικόνα χάθηκε — απάντησε χωρίς αυτήν.",
    quitConfirm: "Να φύγεις από την εξέταση; Δεν θα βαθμολογηθεί.",
    quit: "Έξοδος από την εξέταση",
    result: {
      passed: "Πέρασες",
      failed: "Δεν πέρασες",
      score: (right, total) => `${right} από ${total} σωστές`,
      unanswered: (n) => ` (${n} αναπάντητες)`,
      missed: "Τι έχασες",
      you: (picked) => `Εσύ: ${picked}`,
      right: (text) => `Σωστή: ${text}`,
      again: "Άλλη εξέταση",
      home: "Αρχική",
    },
  },
  stats: {
    title: "Στατιστικά",
    empty: "Απάντησε μερικές ερωτήσεις και η πρόοδός σου θα εμφανιστεί εδώ.",
    passChance: "Πιθανότητα επιτυχίας σε προσομοίωση",
    accuracy: "Ακρίβεια ανά ημέρα",
    answers: "Απαντήσεις ανά ημέρα",
    passChanceSeries: "Πιθανότητα",
    accuracySeries: "Ακρίβεια",
    answersSeries: "Απαντήσεις",
    exams: "Προσομοιώσεις",
    noneYet: "Καμία ακόμη.",
    best: (best, total, streak) =>
      `Καλύτερο σκορ ${best}/${total}. Συνεχόμενες επιτυχίες: ${streak}.`,
    pass: "Επιτυχία",
    fail: "Αποτυχία",
    byCategory: "Ανά κατηγορία (πιο αδύναμες πρώτα)",
    seen: (seen, total, pct) => `${seen}/${total} ειδωμένες · ${pct}%`,
    mostMissed: "Πιο συχνά λάθη",
    nothingMissed: "Δεν έχεις χάσει τίποτα ακόμη.",
    missedDetail: (n, seen) => `${n} λάθη σε ${seen}`,
    slowest: "Πιο αργές",
    needsRepeats: "Χρειάζεται μερικές επαναλήψεις.",
    avgTime: (avg) => `${avg} δευτ. κατά μέσο όρο`,
  },
  settings: {
    title: "Ρυθμίσεις",
    autoAdvance: "Να προχωρά μόνο του μετά από σωστή απάντηση",
    language: "Γλώσσα",
    languageSystem: "Σύστημα",
    theme: "Θέμα",
    themeSystem: "Σύστημα",
    themeLight: "Φωτεινό",
    themeDark: "Σκοτεινό",
    sync: "Συγχρονισμός",
    syncNow: "Συγχρονισμός τώρα",
    pending: (n) =>
      `${n} ${n === 1 ? "απάντηση περιμένει" : "απαντήσεις περιμένουν"} μεταφόρτωση. `,
    lastFailed: (error) => `Η τελευταία προσπάθεια απέτυχε: ${error}.`,
    lastSynced: (time) => ` Τελευταίος συγχρονισμός ${time}.`,
    device: (id) => `Αυτή η συσκευή: ${id}`,
    deviceUnused: "(δεν έχει χρησιμοποιηθεί ακόμη)",
    diagnostics: "Διαγνωστικά",
    diagnosticsHint: (n) =>
      `${n} ${n === 1 ? "εγγραφή" : "εγγραφές"} καταγραφής σε αυτή τη συσκευή. Αντίγραψέ τες και στείλε τες για να μοιραστείς τι πήγε στραβά.`,
    copyLog: "Αντιγραφή καταγραφής",
    copied: "Αντιγράφηκε",
    clearLog: "Καθαρισμός",
  },
  question: {
    stamp: { hard: "ΔΥΣΚΟΛΟ", next: "ΕΠΟΜΕΝΟ", easy: "ΕΥΚΟΛΟ" },
    guessed: "Μάντεψα",
    iGuessed: "Μάντεψα (G)",
    hardHint: "Δύσκολο: θα το βλέπεις πιο συχνά (H)",
    easyHint: "Εύκολο: σταμάτα να το δείχνεις (E)",
    noteHint: "Σημείωση (N)",
    markHard: "Σήμανση ως δύσκολο",
    markEasy: "Σήμανση ως εύκολο",
    editNote: "Επεξεργασία σημείωσης",
    pictureLost: "Η εικόνα χάθηκε, απάντησε χωρίς αυτήν",
    notePlaceholder: "Η σημείωσή σου για αυτή την ερώτηση",
    correct: "Σωστή απάντηση",
    yourWrong: "Η απάντησή σου, λάθος",
    hard: "Δύσκολο",
    easy: "Εύκολο",
    next: "Επόμενο",
  },
};

/** The chosen language, or "system" to follow the device. */
export type LangPref = "system" | Lang;

function isLangPref(value: string | null): value is LangPref {
  return value === "system" || value === "en" || value === "el";
}

/** The device language, Greek when it is one of the user's languages. */
export function detectLang(): Lang {
  const tags =
    typeof navigator === "undefined"
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  return tags.some((tag) => tag.toLowerCase().startsWith("el")) ? "el" : "en";
}

function storedPref(): LangPref | null {
  try {
    const value = localStorage.getItem(LANG_KEY);
    return isLangPref(value) ? value : null;
  } catch {
    return null;
  }
}

type I18n = {
  /** The language actually in use. */
  lang: Lang;
  /** The stored choice, which may be "system". */
  pref: LangPref;
  t: Messages;
  setLang: (pref: LangPref) => void;
};

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [pref, setPref] = useState<LangPref>(() => storedPref() ?? "system");
  const [device, setDevice] = useState<Lang>(detectLang);

  // "System" must follow the device if its language changes while the app is open.
  useEffect(() => {
    if (pref !== "system") return;
    const onChange = () => setDevice(detectLang());
    window.addEventListener("languagechange", onChange);
    return () => window.removeEventListener("languagechange", onChange);
  }, [pref]);

  const setLang = useCallback((next: LangPref) => {
    setPref(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Storage can be unavailable in private mode; the choice still applies for this visit.
    }
  }, []);

  const lang = pref === "system" ? device : pref;

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(
    () => ({ lang, pref, t: lang === "el" ? el : en, setLang }),
    [lang, pref, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Ctx);
  if (!value) throw new Error("useI18n outside I18nProvider");
  return value;
}

export function useT(): Messages {
  return useI18n().t;
}
