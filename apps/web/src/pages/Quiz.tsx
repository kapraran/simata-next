import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { buildSession, mulberry32, newSeenBetween } from "@simata/core";
import { IconBolt, IconHome, IconPlayerPlay, IconPlayerStopFilled } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { type Outcome, QuestionCard, type Sort } from "../components/QuestionCard";
import { type Learner, useLearner } from "../data/learner";
import { localDayRange } from "../lib/time";

const MODES = ["train", "sweep", "weak"] as const;
type QuizMode = (typeof MODES)[number];
/** A missed question comes back after this many others, once. */
const RETRY_GAP = 4;
/** A streak toast every this many right answers in a row. */
const STREAK_STEP = 5;

const EMPTY: Record<QuizMode, string> = {
  train:
    "Nothing is due, today's new questions are done and there are no weak spots. Come back later.",
  sweep: "You have seen every question at least once.",
  weak: "No weak spots right now. Nice.",
};

const TOAST: Record<Sort, string> = {
  hard: "Hard · you'll see it more",
  next: "",
  easy: "Easy · retired",
};

export function QuizPage() {
  const { mode: raw } = useParams();
  const mode = MODES.find((m) => m === raw);
  if (!mode) return <Alert color="red">Unknown mode.</Alert>;
  return <Quiz key={mode} mode={mode} />;
}

/**
 * The next batch for an endless run. Train falls back to weak spots, then to unseen questions,
 * once nothing is due, so the run only ends when you stop it (or the bank is truly done).
 * Questions already shown in this run are skipped: the answer log may not have caught up yet.
 */
function nextBatch(L: Learner, mode: QuizMode, shown: ReadonlySet<string>) {
  const now = Date.now();
  const [from, to] = localDayRange(now);
  const build = (m: QuizMode, newBudget: number) =>
    buildSession({
      questions: L.questions,
      progress: L.progress,
      now,
      mode: m,
      size: L.settings.sessionSize + shown.size, // room for the ones we filter out
      newBudget,
      flags: L.flags,
      rng: mulberry32(now),
    })
      .filter((id) => !shown.has(id))
      .slice(0, L.settings.sessionSize);

  const budget = Math.max(0, L.settings.newPerDay - newSeenBetween(L.progress, from, to));
  const first = build(mode, budget);
  if (first.length > 0 || mode !== "train") return { ids: first, extra: false };
  for (const fallback of ["weak", "sweep"] as const) {
    const ids = build(fallback, 0);
    if (ids.length > 0) return { ids, extra: true };
  }
  return { ids: [], extra: false };
}

function Quiz({ mode }: { mode: QuizMode }) {
  const L = useLearner();
  const [queue, setQueue] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<Outcome[]>([]);
  const [retried, setRetried] = useState<ReadonlySet<string>>(new Set());
  const [extra, setExtra] = useState(false);
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

  // First batch once the data has loaded.
  useEffect(() => {
    if (!L.ready || queue !== null || L.noBank) return;
    const b = nextBatch(L, mode, new Set());
    setQueue(b.ids);
    setExtra(b.extra);
    setExhausted(b.ids.length === 0);
  }, [L, mode, queue]);

  const todayCount = useMemo(() => {
    const [from, to] = localDayRange(Date.now());
    return L.events.filter((e) => e.at >= from && e.at < to && e.mode !== "legacy").length;
  }, [L.events]);

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
    if (!o.correct && !retried.has(o.questionId)) {
      q = [...q];
      q.splice(Math.min(step + 1 + RETRY_GAP, q.length), 0, o.questionId);
      setRetried(new Set(retried).add(o.questionId));
    }

    // Endless: load the next batch when this one runs out.
    if (step + 1 >= q.length) {
      const b = nextBatch(L, mode, new Set([...q, ...all.map((r) => r.questionId)]));
      if (b.ids.length === 0) {
        setExhausted(true);
      } else {
        if (b.extra && !extra) flash("Reviews done · extra practice");
        setExtra(b.extra);
        q = [...q, ...b.ids];
      }
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
        todayCount={todayCount}
        goal={L.settings.dailyGoal}
        resume={exhausted ? undefined : () => setStopped(false)}
      />
    );
  }

  const q = L.byId.get(queue[step] as string);
  if (!q) return <Alert color="red">Question {queue[step]} is missing from the bank.</Alert>;

  const goal = L.settings.dailyGoal;
  const tally = countSorts(results);

  return (
    // Fills the screen under the app bar. The question is the star; the run stats are one thin line.
    <Stack gap={8} h="calc(100dvh - 20px)" mih={420}>
      <Group gap={8} wrap="nowrap" h={32} data-testid="run-strip">
        <ActionIcon
          variant="default"
          size="md"
          radius="md"
          aria-label="Stop run"
          onClick={() => setStopped(true)}
          data-testid="stop"
        >
          <IconPlayerStopFilled size={14} />
        </ActionIcon>
        <Progress
          value={Math.min(100, (todayCount / goal) * 100)}
          size="sm"
          radius="xl"
          style={{ flex: 1 }}
          aria-label="Daily goal"
        />
        <Text size="xs" fw={700} c="dimmed" style={{ whiteSpace: "nowrap" }}>
          {todayCount}/{goal}
        </Text>
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
        {extra && (
          <Badge size="sm" variant="light" color="grape">
            Extra
          </Badge>
        )}
        <Badge
          size="md"
          variant="light"
          color={streak >= STREAK_STEP ? "yellow" : "gray"}
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
            bg="dark.7"
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
  todayCount,
  goal,
  resume,
}: {
  mode: QuizMode;
  results: Outcome[];
  best: number;
  exhausted: boolean;
  todayCount: number;
  goal: number;
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
    { label: "Hard", n: t.hard, color: "orange", what: "Comes back sooner and more often." },
    { label: "Guessed", n: t.guessed, color: "grape", what: "Right, but luck. Graded as hard." },
    { label: "Next", n: t.next, color: "blue", what: "Normal schedule." },
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
          <Badge size="lg" variant="light" color={todayCount >= goal ? "green" : "blue"}>
            {todayCount}/{goal} today{todayCount >= goal ? " · goal hit" : ""}
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
