import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { buildSession, mulberry32, pickNext, type RunEntry } from "@simata/core";
import { IconBolt, IconHome, IconPlayerPlay, IconPlayerStopFilled } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { type Outcome, QuestionCard, type Sort } from "../components/QuestionCard";
import { type Learner, useLearner } from "../data/learner";

const MODES = ["train", "weak"] as const;
type QuizMode = (typeof MODES)[number];
/** In Weak, a missed question comes back after this many others, once. */
const RETRY_GAP = 4;
/** A streak toast every this many right answers in a row. */
const STREAK_STEP = 5;

const EMPTY: Record<QuizMode, string> = {
  train: "Every question is marked easy or disabled. Nothing left to practise.",
  weak: "No weak spots right now. Nice.",
};

const TOAST: Record<Sort, string> = {
  hard: "Hard · you'll see it more",
  next: "",
  easy: "Easy · retired",
};

export function QuizPage() {
  const { mode: raw } = useParams();
  // Sweep was folded into Train; keep old links working.
  if (raw === "sweep") return <Navigate to="/quiz/train" replace />;
  const mode = MODES.find((m) => m === raw);
  if (!mode) return <Alert color="red">Unknown mode.</Alert>;
  return <Quiz key={mode} mode={mode} />;
}

/** The whole Weak list, worst first. */
function weakList(L: Learner): string[] {
  return buildSession({
    questions: L.questions,
    progress: L.progress,
    now: Date.now(),
    mode: "weak",
    size: 1000,
    flags: L.flags,
    rng: mulberry32(Date.now()),
  });
}

/** Train: one question at a time, no cap. Weak: the fixed list. */
function pickTrain(L: Learner, run: readonly RunEntry[]): string | undefined {
  return pickNext({
    questions: L.questions,
    progress: L.progress,
    flags: L.flags,
    run,
    rng: mulberry32(Date.now() + run.length),
  });
}

function Quiz({ mode }: { mode: QuizMode }) {
  const L = useLearner();
  /** Questions in the order they are shown. For Train it grows by one per answer. */
  const [queue, setQueue] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<Outcome[]>([]);
  const [retried, setRetried] = useState<ReadonlySet<string>>(new Set());
  const [exhausted, setExhausted] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const flash = (msg: string) => {
    if (!msg) return;
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  };

  // First question(s) once the data has loaded.
  useEffect(() => {
    if (!L.ready || queue !== null || L.noBank) return;
    const ids = mode === "weak" ? weakList(L) : [pickTrain(L, [])].filter((x) => x !== undefined);
    setQueue(ids);
    setExhausted(ids.length === 0);
  }, [L, mode, queue]);

  if (L.noBank) {
    return (
      <Alert color="yellow" title="No question bank">
        The server has no bank and this device has none cached. Run the import (see the README) and
        reload.
      </Alert>
    );
  }
  if (!L.ready || queue === null) return <Loader />;

  const onNext = (o: Outcome) => {
    const all = [...results, o];
    setResults(all);

    const s = o.correct ? streak + 1 : 0;
    setStreak(s);
    setBest(Math.max(best, s));

    let q = queue;
    if (mode === "weak") {
      if (!o.correct && !retried.has(o.questionId)) {
        q = [...q];
        q.splice(Math.min(step + 1 + RETRY_GAP, q.length), 0, o.questionId);
        setRetried(new Set(retried).add(o.questionId));
      }
      if (step + 1 >= q.length) setExhausted(true);
    } else {
      const run: RunEntry[] = all.map((r) => ({
        id: r.questionId,
        correct: r.correct,
        guessed: r.guessed,
      }));
      const nextId = pickTrain(L, run);
      if (nextId === undefined) setExhausted(true);
      else q = [...q, nextId];
    }
    setQueue(q);
    setStep(step + 1);

    if (o.correct && s > 0 && s % STREAK_STEP === 0) flash(`${s} in a row. Keep going`);
    else flash(TOAST[o.sort]);
  };

  if (stopped || exhausted || step >= queue.length) {
    return (
      <RunSummary
        mode={mode}
        results={results}
        best={best}
        exhausted={exhausted && !stopped}
        resume={exhausted ? undefined : () => setStopped(false)}
      />
    );
  }

  const q = L.byId.get(queue[step] as string);
  if (!q) return <Alert color="red">Question {queue[step]} is missing from the bank.</Alert>;

  const tally = countSorts(results);

  return (
    // Fills the screen under the app bar. The question is the star; the run stats are one thin line.
    <Stack gap={8} h="calc(100dvh - 20px)" mih={420}>
      <Group gap={8} wrap="nowrap" h={32} data-testid="run-strip">
        <ActionIcon
          variant="filled"
          color="red"
          size="md"
          radius="md"
          aria-label="Stop run"
          onClick={() => setStopped(true)}
          data-testid="stop"
        >
          <IconPlayerStopFilled size={14} />
        </ActionIcon>
        <Box style={{ flex: 1 }} />
        <Group gap={6} wrap="nowrap" aria-label="Sorted this run" data-testid="run-count">
          <Text size="xs" fw={800} c="orange.7">
            {tally.hard}
          </Text>
          <Text size="xs" fw={800} c="blue.6">
            {tally.next}
          </Text>
          <Text size="xs" fw={800} c="teal.7">
            {tally.easy}
          </Text>
        </Group>
        <Badge
          size="md"
          color={streak >= STREAK_STEP ? "yellow" : "gray"}
          variant={streak >= STREAK_STEP ? "filled" : "light"}
          c={streak >= STREAK_STEP ? "dark.9" : undefined}
          leftSection={<IconBolt size={12} />}
          aria-label={`${streak} in a row`}
          data-testid="streak"
        >
          {streak}
        </Badge>
      </Group>

      <Box
        pos="relative"
        style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        {toast && (
          <Paper
            role="status"
            px="md"
            py={6}
            radius="xl"
            className="sim-toast"
            c="white"
            fz="sm"
            fw={600}
            style={{
              position: "absolute",
              zIndex: 20,
              top: 8,
              left: "50%",
              transform: "translateX(-50%)",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}
          >
            {toast}
          </Paper>
        )}
        <QuestionCard
          key={`${q.id}:${step}`}
          question={q}
          mode={mode}
          flag={L.flags[q.id]}
          note={L.notes[q.id]}
          autoAdvance={L.settings.autoAdvance}
          onNext={onNext}
        />
      </Box>
    </Stack>
  );
}

function countSorts(results: readonly Outcome[]) {
  const t = { hard: 0, next: 0, easy: 0, guessed: 0 };
  for (const r of results) {
    t[r.sort]++;
    if (r.guessed) t.guessed++;
  }
  return t;
}

function RunSummary({
  mode,
  results,
  best,
  exhausted,
  resume,
}: {
  mode: QuizMode;
  results: Outcome[];
  best: number;
  exhausted: boolean;
  resume?: () => void;
}) {
  if (results.length === 0) {
    return (
      <Paper withBorder p="lg" radius="md">
        <Stack gap="md" align="center" ta="center">
          <Title order={3}>All clear</Title>
          <Text c="dimmed">{EMPTY[mode]}</Text>
          <Button component={Link} to="/" variant="default" leftSection={<IconHome size={18} />}>
            Home
          </Button>
        </Stack>
      </Paper>
    );
  }

  const right = results.filter((r) => r.correct).length;
  const avg = results.reduce((a, r) => a + r.durationMs, 0) / results.length / 1000;
  const t = countSorts(results);
  const piles = [
    { label: "Hard", n: t.hard, color: "orange", what: "Comes back more often." },
    { label: "Guessed", n: t.guessed, color: "grape", what: "Right, but luck. Graded as hard." },
    { label: "Next", n: t.next, color: "blue", what: "Stays on the even rotation." },
    { label: "Easy", n: t.easy, color: "teal", what: "Retired. Won't show again." },
  ];

  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Text c="dimmed" fw={600} size="sm">
          {exhausted ? "Nothing left to practise" : "You stopped the run"}
        </Text>
        <Group gap="xs" align="baseline">
          <Text fz={44} fw={800} lh={1} data-testid="summary">
            {results.length}
          </Text>
          <Text fw={600}>
            answered · {right} right · {avg.toFixed(1)} s each
          </Text>
        </Group>
        <Group gap="xs" mt={4}>
          <Badge size="lg" variant="light" color="yellow" leftSection={<IconBolt size={14} />}>
            Best streak {best}
          </Badge>
        </Group>
      </Stack>

      <SimpleGrid cols={2} spacing="sm">
        {piles.map((p) => (
          <Paper key={p.label} p="md" radius="lg" bg={`var(--mantine-color-${p.color}-light)`}>
            <Group justify="space-between" align="baseline">
              <Text fw={700} c={`${p.color}.8`}>
                {p.label}
              </Text>
              <Text fz={26} fw={800} c={`${p.color}.8`}>
                {p.n}
              </Text>
            </Group>
            <Text size="xs">{p.what}</Text>
          </Paper>
        ))}
      </SimpleGrid>

      <Stack gap="xs">
        {t.hard + t.guessed > 0 && (
          <Button
            component={Link}
            to="/quiz/weak"
            reloadDocument
            size="lg"
            color="orange"
            leftSection={<IconBolt size={18} />}
          >
            Drill weak spots
          </Button>
        )}
        <Group grow gap="xs">
          {resume && (
            <Button
              size="md"
              variant="default"
              leftSection={<IconPlayerPlay size={18} />}
              onClick={resume}
            >
              Keep going
            </Button>
          )}
          <Button
            component={Link}
            to="/"
            size="md"
            variant="default"
            leftSection={<IconHome size={18} />}
          >
            Home
          </Button>
        </Group>
      </Stack>
    </Stack>
  );
}
