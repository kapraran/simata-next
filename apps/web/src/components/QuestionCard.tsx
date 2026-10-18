import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Image,
  Kbd,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@mantine/core";
import type { Flag, Mode, Question } from "@simata/core";
import { shuffle } from "@simata/core";
import { IconArrowRight, IconDice5, IconFeather, IconFlame, IconNote } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { imageUrl } from "../data/bank";
import { db } from "../data/db";
import { recordAnswer, setFlag, setNote } from "../data/writes";

export type Outcome = { questionId: string; correct: boolean; durationMs: number };

type Props = {
  question: Question;
  mode: Exclude<Mode, "legacy">;
  flag?: Flag;
  note?: string;
  autoAdvance: boolean;
  onNext: (o: Outcome) => void;
};

type Phase = "asking" | "right" | "wrong";

/** How long a right answer stays on screen before moving on (time to tap "I guessed"). */
const AUTO_ADVANCE_MS = 1300;
const GUESSED_PAUSE_MS = 450;

export function QuestionCard({ question: q, mode, flag, note, autoAdvance, onNext }: Props) {
  const options = useMemo(() => shuffle(q.options, Math.random), [q]);
  const shownAt = useRef(Date.now());
  const [phase, setPhase] = useState<Phase>("asking");
  const [picked, setPicked] = useState<string | null>(null);
  const [guessed, setGuessed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(note ?? "");

  const result = useRef<{ correct: boolean; durationMs: number } | null>(null);
  const guessedRef = useRef(false);
  const committed = useRef(false);
  const advanced = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editingRef = useRef(false);

  const commit = () => {
    const r = result.current;
    if (!r || committed.current) return;
    committed.current = true;
    clearTimeout(timer.current);
    void recordAnswer(db, {
      questionId: q.id,
      correct: r.correct,
      durationMs: r.durationMs,
      guessed: r.correct && guessedRef.current,
      mode,
    });
  };

  const advance = () => {
    const r = result.current;
    if (!r || advanced.current) return;
    advanced.current = true;
    commit();
    onNext({ questionId: q.id, correct: r.correct, durationMs: r.durationMs });
  };

  // Leaving mid-pause (back button, closing a tab handler) must not lose the answer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once; commit only touches refs and this question
  useEffect(() => () => commit(), []);

  const pick = (text: string) => {
    if (phase !== "asking") return;
    const correct = q.options.find((o) => o.text === text)?.correct === true;
    result.current = { correct, durationMs: Date.now() - shownAt.current };
    setPicked(text);
    if (correct) {
      setPhase("right");
      if (autoAdvance && !editingRef.current) timer.current = setTimeout(advance, AUTO_ADVANCE_MS);
    } else {
      setPhase("wrong");
      commit(); // a miss is final the moment it happens
    }
  };

  const markGuessed = () => {
    if (phase !== "right") return;
    guessedRef.current = true;
    setGuessed(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(advance, GUESSED_PAUSE_MS);
  };

  const toggleFlag = (f: Flag) => void setFlag(db, q.id, flag === f ? null : f);

  const openNote = (open: boolean) => {
    editingRef.current = open;
    setEditingNote(open);
    if (open) clearTimeout(timer.current); // reading or writing: don't move on by itself
  };

  const saveNote = () => {
    openNote(false);
    if (draft !== (note ?? "")) void setNote(db, q.id, draft.trim());
  };

  // Keyboard: 1-3 answer, Space/Enter next, G guessed, H/E flags, N note.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const n = Number(k);
      if (n >= 1 && n <= options.length) pick(options[n - 1]?.text ?? "");
      else if ((k === " " || k === "enter") && phase !== "asking") {
        e.preventDefault();
        advance();
      } else if (k === "g") markGuessed();
      else if (k === "h") toggleFlag("hard");
      else if (k === "e") toggleFlag("easy");
      else if (k === "n") {
        e.preventDefault();
        openNote(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const color = (text: string, correct: boolean) => {
    if (phase === "asking") return undefined;
    if (correct) return "green";
    return text === picked ? "red" : "gray";
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="nowrap">
        <Badge variant="light" size="lg">
          {q.id}
        </Badge>
        <Group gap={4}>
          <Tooltip label="Hard: see it more (H)">
            <ActionIcon
              variant={flag === "hard" ? "filled" : "subtle"}
              color="orange"
              aria-label="Mark hard"
              onClick={() => toggleFlag("hard")}
            >
              <IconFlame size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Easy: stop showing it (E)">
            <ActionIcon
              variant={flag === "easy" ? "filled" : "subtle"}
              color="teal"
              aria-label="Mark easy"
              onClick={() => toggleFlag("easy")}
            >
              <IconFeather size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Note (N)">
            <ActionIcon
              variant={note ? "light" : "subtle"}
              aria-label="Edit note"
              onClick={() => openNote(true)}
            >
              <IconNote size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Text size="lg" fw={500} data-testid="question-text">
        {q.text}
      </Text>

      {q.image && (
        <>
          <Image
            src={imageUrl(q.image)}
            alt={`${q.id} illustration`}
            fit="contain"
            mah={240}
            radius="md"
            style={{ cursor: "zoom-in" }}
            onClick={() => setZoom(true)}
          />
          <Modal
            opened={zoom}
            onClose={() => setZoom(false)}
            size="lg"
            centered
            withCloseButton={false}
          >
            <Image src={imageUrl(q.image)} alt="" fit="contain" onClick={() => setZoom(false)} />
          </Modal>
        </>
      )}

      <Stack gap="xs">
        {options.map((o, i) => (
          <Button
            key={o.text}
            fullWidth
            size="md"
            h="auto"
            py="sm"
            variant={
              phase === "asking" ? "default" : o.correct || o.text === picked ? "filled" : "light"
            }
            color={color(o.text, o.correct)}
            onClick={() => pick(o.text)}
            disabled={phase !== "asking" && !o.correct && o.text !== picked}
            data-testid="option"
            data-correct={o.correct}
            justify="flex-start"
            leftSection={<Kbd size="xs">{i + 1}</Kbd>}
            styles={{ label: { whiteSpace: "normal", textAlign: "left" } }}
          >
            {o.text}
          </Button>
        ))}
      </Stack>

      {editingNote ? (
        <Textarea
          autoFocus
          autosize
          minRows={2}
          placeholder="Your note for this question"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === "Escape") saveNote();
          }}
        />
      ) : (
        phase !== "asking" &&
        note && (
          <Paper withBorder p="sm" radius="md">
            <Text size="sm">{note}</Text>
          </Paper>
        )
      )}

      {phase !== "asking" && (
        <Group justify="space-between">
          {phase === "right" ? (
            <Button
              variant={guessed ? "filled" : "light"}
              color="yellow"
              leftSection={<IconDice5 size={18} />}
              onClick={markGuessed}
              data-testid="guessed"
            >
              {guessed ? "Marked as guess" : "I guessed (G)"}
            </Button>
          ) : (
            <Text c="red" fw={500}>
              Not quite. It comes back soon.
            </Text>
          )}
          <Button rightSection={<IconArrowRight size={18} />} onClick={advance} data-testid="next">
            Next
          </Button>
        </Group>
      )}
    </Stack>
  );
}
