import {
  Alert,
  Badge,
  Button,
  Group,
  Image,
  Kbd,
  Loader,
  Paper,
  Progress,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  buildSession,
  DEFAULT_RULE,
  EXAM_MINUTES,
  mulberry32,
  type Question,
  shuffle,
} from "@simata/core";
import { IconClipboardCheck, IconHome, IconPlayerPlay, IconRepeat } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { imageUrl } from "../data/bank";
import { db } from "../data/db";
import { useLearner } from "../data/learner";
import { recordAnswer, saveExam } from "../data/writes";
import { useNow } from "../lib/useNow";

type Answer = { questionId: string; picked: string; correct: boolean };

const EXAM_MS = EXAM_MINUTES * 60_000;
const ADVANCE_MS = 300;

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ExamPage() {
  const L = useLearner();
  const [ids, setIds] = useState<string[] | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const saved = useRef(false);

  const start = () => {
    const now = Date.now();
    setIds(
      buildSession({
        questions: L.questions,
        progress: L.progress,
        now,
        mode: "exam",
        size: DEFAULT_RULE.questions,
        newBudget: 0,
        rng: mulberry32(now),
      }),
    );
    setStartedAt(now);
    setAnswers([]);
    setFinishedAt(null);
    saved.current = false;
  };

  const now = useNow(1000);
  const running = ids !== null && finishedAt === null;
  const timeUp = running && now - startedAt >= EXAM_MS;
  const allDone = ids !== null && answers.length >= ids.length;

  useEffect(() => {
    if (running && (timeUp || allDone)) setFinishedAt(Date.now());
  }, [running, timeUp, allDone]);

  // Save the result once, when the exam ends.
  useEffect(() => {
    if (!ids || finishedAt === null || saved.current) return;
    saved.current = true;
    const right = answers.filter((a) => a.correct).length;
    void saveExam(db, {
      at: startedAt,
      right,
      total: ids.length,
      maxWrong: DEFAULT_RULE.maxWrong,
      passed: ids.length - right <= DEFAULT_RULE.maxWrong,
      durationMs: Math.min(finishedAt - startedAt, EXAM_MS),
    });
  }, [ids, finishedAt, answers, startedAt]);

  if (L.noBank) return <Alert color="yellow">No question bank yet.</Alert>;
  if (!L.ready) return <Loader />;

  if (ids === null) return <Intro onStart={start} />;

  if (finishedAt !== null) {
    return <Result ids={ids} answers={answers} byId={L.byId} onAgain={start} />;
  }

  const index = answers.length;
  const q = L.byId.get(ids[index] as string);
  if (!q) return <Alert color="red">Question {ids[index]} is missing from the bank.</Alert>;

  const remaining = EXAM_MS - (now - startedAt);
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600} data-testid="exam-position">
          Question {index + 1} of {ids.length}
        </Text>
        <Badge size="lg" color={remaining < 5 * 60_000 ? "red" : "gray"} variant="light">
          {clock(remaining)}
        </Badge>
      </Group>
      <Progress value={(index / ids.length) * 100} size="sm" />
      <ExamQuestion
        key={`${q.id}:${index}`}
        question={q}
        onAnswer={(a) => setAnswers((prev) => [...prev, a])}
      />
      <QuitButton />
    </Stack>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  const L = useLearner();
  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="md">
        <Title order={3}>Mock exam</Title>
        <Text>
          {DEFAULT_RULE.questions} questions, {EXAM_MINUTES} minutes. You see the answers only at
          the end. You pass with at most {DEFAULT_RULE.maxWrong} mistake
          {DEFAULT_RULE.maxWrong === 1 ? "" : "s"}.
        </Text>
        <Text size="xs" c="dimmed">
          That rule is from unofficial sources. Check it against the official one before relying on
          it.
        </Text>
        {L.exams.length === 0 && (
          <Text size="sm" c="dimmed">
            Your answers here count towards your schedule like any other.
          </Text>
        )}
        <Button
          leftSection={<IconPlayerPlay size={18} />}
          onClick={onStart}
          data-testid="start-exam"
        >
          Start
        </Button>
      </Stack>
    </Paper>
  );
}

function ExamQuestion({
  question: q,
  onAnswer,
}: {
  question: Question;
  onAnswer: (a: Answer) => void;
}) {
  const options = useMemo(() => shuffle(q.options, Math.random), [q]);
  const shownAt = useRef(Date.now());
  const [picked, setPicked] = useState<string | null>(null);

  const pick = (text: string) => {
    if (picked !== null) return;
    setPicked(text);
    const correct = q.options.find((o) => o.text === text)?.correct === true;
    void recordAnswer(db, {
      questionId: q.id,
      correct,
      durationMs: Date.now() - shownAt.current,
      guessed: false,
      mode: "exam",
    });
    setTimeout(() => onAnswer({ questionId: q.id, picked: text, correct }), ADVANCE_MS);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= options.length) pick(options[n - 1]?.text ?? "");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Stack gap="md">
      <Text size="lg" fw={500} data-testid="question-text">
        {q.text}
      </Text>
      {q.image && (
        <Image
          src={imageUrl(q.image)}
          alt={`${q.id} illustration`}
          fit="contain"
          mah={240}
          radius="md"
        />
      )}
      <Stack gap="xs">
        {options.map((o, i) => (
          <Button
            key={o.text}
            fullWidth
            size="md"
            h="auto"
            py="sm"
            justify="flex-start"
            variant={picked === o.text ? "filled" : "default"}
            onClick={() => pick(o.text)}
            data-testid="option"
            leftSection={<Kbd size="xs">{i + 1}</Kbd>}
            styles={{ label: { whiteSpace: "normal", textAlign: "left" } }}
          >
            {o.text}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

function QuitButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="subtle"
      color="gray"
      size="xs"
      onClick={() => {
        if (window.confirm("Leave the exam? It will not be scored.")) navigate("/");
      }}
    >
      Quit exam
    </Button>
  );
}

function Result({
  ids,
  answers,
  byId,
  onAgain,
}: {
  ids: string[];
  answers: Answer[];
  byId: ReadonlyMap<string, Question>;
  onAgain: () => void;
}) {
  const right = answers.filter((a) => a.correct).length;
  const wrong = ids.length - right;
  const passed = wrong <= DEFAULT_RULE.maxWrong;
  const answeredIds = new Set(answers.map((a) => a.questionId));
  const missed = [
    ...answers.filter((a) => !a.correct),
    ...ids
      .filter((id) => !answeredIds.has(id))
      .map((id) => ({ questionId: id, picked: "", correct: false })),
  ];

  return (
    <Stack gap="md">
      <Paper withBorder p="lg" radius="md">
        <Stack align="center" gap="xs" ta="center">
          <IconClipboardCheck size={36} />
          <Title order={2} c={passed ? "green" : "red"} data-testid="exam-verdict">
            {passed ? "Passed" : "Not passed"}
          </Title>
          <Text data-testid="exam-score">
            {right} of {ids.length} right
            {ids.length - answers.length > 0 ? ` (${ids.length - answers.length} unanswered)` : ""}
          </Text>
        </Stack>
      </Paper>

      {missed.length > 0 && (
        <Stack gap="xs">
          <Text fw={600}>What you missed</Text>
          {missed.map((m) => {
            const q = byId.get(m.questionId);
            return (
              <Paper key={m.questionId} withBorder p="sm" radius="md">
                <Text size="xs" c="dimmed">
                  {m.questionId}
                </Text>
                <Text size="sm" mb={4}>
                  {q?.text}
                </Text>
                {m.picked && (
                  <Text size="sm" c="red">
                    You: {m.picked}
                  </Text>
                )}
                <Text size="sm" c="green">
                  Right: {q?.options.find((o) => o.correct)?.text}
                </Text>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Group>
        <Button leftSection={<IconRepeat size={18} />} onClick={onAgain}>
          Another exam
        </Button>
        <Button component={Link} to="/" variant="default" leftSection={<IconHome size={18} />}>
          Home
        </Button>
      </Group>
    </Stack>
  );
}
