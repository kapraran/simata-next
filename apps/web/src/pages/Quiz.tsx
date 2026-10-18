import { Alert, Button, Group, Loader, Paper, Progress, Stack, Text, Title } from "@mantine/core";
import { buildSession, mulberry32, newSeenBetween } from "@simata/core";
import { IconHome, IconRepeat } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { type Outcome, QuestionCard } from "../components/QuestionCard";
import { useLearner } from "../data/learner";
import { localDayRange } from "../lib/time";

const MODES = ["train", "sweep", "weak"] as const;
type QuizMode = (typeof MODES)[number];
const SWEEP_SIZE = 20;
/** A missed question comes back after this many others, once. */
const RETRY_GAP = 4;

const EMPTY: Record<QuizMode, string> = {
  train: "Nothing is due and today's new questions are done. Come back later.",
  sweep: "You have seen every question at least once.",
  weak: "No weak spots right now. Nice.",
};

export function QuizPage() {
  const { mode: raw } = useParams();
  const mode = MODES.find((m) => m === raw);
  if (!mode) return <Alert color="red">Unknown mode.</Alert>;
  return <Quiz mode={mode} />;
}

function Quiz({ mode }: { mode: QuizMode }) {
  const L = useLearner();
  const [queue, setQueue] = useState<string[] | null>(null);
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<Outcome[]>([]);
  const [retried, setRetried] = useState<ReadonlySet<string>>(new Set());

  // Build the round once the data has loaded, and again whenever a new round is asked for.
  useEffect(() => {
    if (!L.ready || queue !== null || L.noBank) return;
    const now = Date.now();
    const [from, to] = localDayRange(now);
    const ids = buildSession({
      questions: L.questions,
      progress: L.progress,
      now,
      mode,
      size: mode === "sweep" ? SWEEP_SIZE : L.settings.sessionSize,
      newBudget: Math.max(0, L.settings.newPerDay - newSeenBetween(L.progress, from, to)),
      flags: L.flags,
      rng: mulberry32(now),
    });
    setQueue(ids);
    setStep(0);
    setResults([]);
    setRetried(new Set());
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
    setResults((r) => [...r, o]);
    if (!o.correct && !retried.has(o.questionId)) {
      const q = [...queue];
      q.splice(Math.min(step + 1 + RETRY_GAP, q.length), 0, o.questionId);
      setQueue(q);
      setRetried(new Set(retried).add(o.questionId));
    }
    setStep(step + 1);
  };

  const done = step >= queue.length;
  if (done) {
    return (
      <Summary
        empty={queue.length === 0}
        mode={mode}
        results={results}
        again={() => setQueue(null)}
      />
    );
  }

  const q = L.byId.get(queue[step] as string);
  if (!q) return <Alert color="red">Question {queue[step]} is missing from the bank.</Alert>;

  return (
    <Stack gap="md">
      <Progress value={(step / queue.length) * 100} size="sm" aria-label="Round progress" />
      <QuestionCard
        key={`${q.id}:${step}`}
        question={q}
        mode={mode}
        flag={L.flags[q.id]}
        note={L.notes[q.id]}
        autoAdvance={L.settings.autoAdvance}
        onNext={onNext}
      />
    </Stack>
  );
}

function Summary({
  empty,
  mode,
  results,
  again,
}: {
  empty: boolean;
  mode: QuizMode;
  results: Outcome[];
  again: () => void;
}) {
  const right = results.filter((r) => r.correct).length;
  const avg = results.length
    ? results.reduce((a, r) => a + r.durationMs, 0) / results.length / 1000
    : 0;
  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="md" align="center" ta="center">
        <Title order={3}>{empty ? "All clear" : "Round done"}</Title>
        {empty ? (
          <Text c="dimmed">{EMPTY[mode]}</Text>
        ) : (
          <Text data-testid="summary">
            {right} of {results.length} right · {avg.toFixed(1)} s per question
          </Text>
        )}
        <Group>
          {!empty && (
            <Button leftSection={<IconRepeat size={18} />} onClick={again}>
              Another round
            </Button>
          )}
          <Button component={Link} to="/" variant="default" leftSection={<IconHome size={18} />}>
            Home
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
