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
import { IconHome, IconPhotoOff, IconPlayerPlay, IconRepeat } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sign } from "../components/Signs";
import { imageUrl } from "../data/bank";
import { db } from "../data/db";
import { useLearner } from "../data/learner";
import { recordAnswer, saveExam } from "../data/writes";
import { useT } from "../i18n";
import { useNow } from "../lib/useNow";

type Answer = { questionId: string; picked: string; correct: boolean };

const EXAM_MS = EXAM_MINUTES * 60_000;
const ADVANCE_MS = 300;

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function ExamPage() {
  const t = useT();
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

  if (L.noBank) return <Alert color="yellow">{t.exam.noBank}</Alert>;
  if (!L.ready) return <Loader />;

  if (ids === null) return <Intro onStart={start} />;

  if (finishedAt !== null) {
    return <Result ids={ids} answers={answers} byId={L.byId} onAgain={start} />;
  }

  const index = answers.length;
  const q = L.byId.get(ids[index] as string);
  if (!q) return <Alert color="red">{t.exam.missingQuestion(ids[index] as string)}</Alert>;

  const remaining = EXAM_MS - (now - startedAt);
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={600} data-testid="exam-position">
          {t.exam.position(index + 1, ids.length)}
        </Text>
        <Badge
          size="lg"
          color={remaining < 5 * 60_000 ? "red" : "gray"}
          variant="light"
          leftSection={<TrafficLight remaining={remaining} />}
        >
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

/** Three lamps: green with plenty of time, amber under 15 minutes, red under 5. */
function TrafficLight({ remaining }: { remaining: number }) {
  const lit = remaining < 5 * 60_000 ? 2 : remaining < 15 * 60_000 ? 1 : 0;
  const colors = ["#3FE08A", "#FFB020", "#FF4D4D"];
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        gap: 3,
        background: "var(--sim-navy)",
        padding: "3px 5px",
        borderRadius: 8,
      }}
    >
      {colors.map((c, i) => (
        <i
          key={c}
          style={{
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: i === lit ? c : "#2F3B5E",
            boxShadow: i === lit ? `0 0 6px ${c}` : undefined,
          }}
        />
      ))}
    </span>
  );
}

/** A big sticker for the result: a green check sign for a pass, a stop sign for a fail. */
function ResultSign({ passed }: { passed: boolean }) {
  if (!passed) return <Sign name="stop" size={112} />;
  return (
    <svg width="112" height="116" viewBox="0 0 120 124" aria-hidden="true">
      <circle cx="60" cy="64" r="56" fill="#0B2A6B" />
      <circle cx="60" cy="60" r="56" fill="#fff" />
      <circle cx="60" cy="60" r="47" fill="#17A862" />
      <path
        d="M38 61 l15 15 l30 -31"
        fill="none"
        stroke="#fff"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  const t = useT();
  const L = useLearner();
  return (
    <Paper p="lg" radius="lg">
      <Stack gap="md">
        <Title order={3}>{t.exam.intro.title}</Title>
        <Text>
          {t.exam.intro.description(DEFAULT_RULE.questions, EXAM_MINUTES, DEFAULT_RULE.maxWrong)}
        </Text>
        <Text size="xs" c="dimmed">
          {t.exam.intro.disclaimer}
        </Text>
        {L.exams.length === 0 && (
          <Text size="sm" c="dimmed">
            {t.exam.intro.counts}
          </Text>
        )}
        <Button
          leftSection={<IconPlayerPlay size={18} />}
          onClick={onStart}
          data-testid="start-exam"
        >
          {t.exam.intro.start}
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
  const t = useT();
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
      {q.imageMissing && (
        <Group gap="xs" c="orange">
          <IconPhotoOff size={16} />
          <Text size="sm">{t.exam.pictureLost}</Text>
        </Group>
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
  const t = useT();
  const navigate = useNavigate();
  return (
    <Button
      variant="subtle"
      color="gray"
      size="xs"
      onClick={() => {
        if (window.confirm(t.exam.quitConfirm)) navigate("/");
      }}
    >
      {t.exam.quit}
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
  const t = useT();
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
      <Paper p="lg" radius="lg">
        <Stack align="center" gap="xs" ta="center">
          <ResultSign passed={passed} />
          <Title order={2} c={passed ? "green" : "red"} data-testid="exam-verdict">
            {passed ? t.exam.result.passed : t.exam.result.failed}
          </Title>
          <span className="sim-swoosh" style={{ width: 120 }} />
          <Text data-testid="exam-score">
            {t.exam.result.score(right, ids.length)}
            {ids.length - answers.length > 0
              ? t.exam.result.unanswered(ids.length - answers.length)
              : ""}
          </Text>
        </Stack>
      </Paper>

      {missed.length > 0 && (
        <Stack gap="xs">
          <Text fw={600}>{t.exam.result.missed}</Text>
          {missed.map((m) => {
            const q = byId.get(m.questionId);
            return (
              <Paper key={m.questionId} p="sm" radius="md">
                <Text size="xs" c="dimmed">
                  {m.questionId}
                </Text>
                <Text size="sm" mb={4}>
                  {q?.text}
                </Text>
                {m.picked && (
                  <Text size="sm" c="red">
                    {t.exam.result.you(m.picked)}
                  </Text>
                )}
                <Text size="sm" c="green">
                  {t.exam.result.right(q?.options.find((o) => o.correct)?.text ?? "")}
                </Text>
              </Paper>
            );
          })}
        </Stack>
      )}

      <Group>
        <Button leftSection={<IconRepeat size={18} />} onClick={onAgain}>
          {t.exam.result.again}
        </Button>
        <Button component={Link} to="/" variant="default" leftSection={<IconHome size={18} />}>
          {t.exam.result.home}
        </Button>
      </Group>
    </Stack>
  );
}
