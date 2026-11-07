import {
  ActionIcon,
  Box,
  Button,
  Group,
  Image,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import type { Flag, Mode, Question } from "@simata/core";
import { shuffle } from "@simata/core";
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconCheck,
  IconDice5,
  IconFeather,
  IconFlame,
  IconNote,
  IconPhotoOff,
  IconX,
} from "@tabler/icons-react";
import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { imageUrl } from "../data/bank";
import { db } from "../data/db";
import { recordAnswer, setFlag, setNote } from "../data/writes";
import { type Sort, swipeDirection } from "../lib/swipe";

export type { Sort };

export type Outcome = {
  questionId: string;
  correct: boolean;
  durationMs: number;
  guessed: boolean;
  sort: Sort;
};

type Props = {
  question: Question;
  mode: Exclude<Mode, "legacy">;
  flag?: Flag;
  note?: string;
  autoAdvance: boolean;
  onNext: (o: Outcome) => void;
};

type Phase = "asking" | "right" | "wrong";

/** How long a right answer stays on screen before moving on as "Next", unless touched. */
const AUTO_ADVANCE_MS = 1800;
/** Drag distance (px) that counts as a swipe. */
const SWIPE_PX = 90;
const EXIT_MS = 220;
/** Shrinks on short screens so the question and answers stay in view. Same slot with or without a picture. */
const IMAGE_H = "clamp(72px, 18dvh, 170px)";

const STAMP: Record<Sort, { label: string; color: string }> = {
  hard: { label: "HARD", color: "var(--mantine-color-orange-7)" },
  next: { label: "NEXT", color: "var(--mantine-color-blue-6)" },
  easy: { label: "EASY", color: "var(--mantine-color-teal-7)" },
};

export function QuestionCard({ question: q, mode, flag, note, autoAdvance, onNext }: Props) {
  const reduceMotion = useReducedMotion();
  const options = useMemo(() => shuffle(q.options, Math.random), [q]);
  const shownAt = useRef(Date.now());
  const [phase, setPhase] = useState<Phase>("asking");
  const [picked, setPicked] = useState<string | null>(null);
  const [guessed, setGuessed] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [autoRunning, setAutoRunning] = useState(false);

  // Drag state. `start` lives in a ref so pointermove doesn't wait on a render.
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const [exit, setExit] = useState<Sort | null>(null);
  const [entered, setEntered] = useState(false);

  const result = useRef<{ correct: boolean; durationMs: number } | null>(null);
  const guessedRef = useRef(false);
  const committed = useRef(false);
  const advanced = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editingRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const commit = () => {
    const r = result.current;
    if (!r || committed.current) return;
    committed.current = true;
    void recordAnswer(db, {
      questionId: q.id,
      correct: r.correct,
      durationMs: r.durationMs,
      guessed: r.correct && guessedRef.current,
      mode,
    });
  };

  // Leaving mid-pause (back button, Stop) must not lose the answer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once; commit only touches refs and this question
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      commit();
    },
    [],
  );

  const stopAuto = () => {
    clearTimeout(timer.current);
    setAutoRunning(false);
  };

  /** Sort the answered question and move on. */
  const sortAs = (s: Sort) => {
    const r = result.current;
    if (!r || advanced.current) return;
    advanced.current = true;
    stopAuto();
    if (s === "hard" && flag !== "hard") void setFlag(db, q.id, "hard");
    if (s === "easy" && flag !== "easy") void setFlag(db, q.id, "easy");
    commit();
    const out: Outcome = {
      questionId: q.id,
      correct: r.correct,
      durationMs: r.durationMs,
      guessed: r.correct && guessedRef.current,
      sort: s,
    };
    if (reduceMotion) {
      onNext(out);
      return;
    }
    setExit(s);
    setDrag((d) => ({ ...d, active: false }));
    timer.current = setTimeout(() => onNext(out), EXIT_MS);
  };

  const pick = (text: string) => {
    if (phase !== "asking") return;
    const correct = q.options.find((o) => o.text === text)?.correct === true;
    result.current = { correct, durationMs: Date.now() - shownAt.current };
    setPicked(text);
    if (correct) {
      setPhase("right");
      if (autoAdvance && !editingRef.current) {
        setAutoRunning(true);
        timer.current = setTimeout(() => sortAs("next"), AUTO_ADVANCE_MS);
      }
    } else {
      setPhase("wrong");
      commit(); // a miss is final the moment it happens
    }
  };

  const toggleGuessed = () => {
    if (phase !== "right" || advanced.current) return;
    stopAuto();
    guessedRef.current = !guessedRef.current;
    setGuessed(guessedRef.current);
  };

  const toggleFlag = (f: Flag) => void setFlag(db, q.id, flag === f ? null : f);

  const openNote = (open: boolean) => {
    editingRef.current = open;
    setEditingNote(open);
    if (open) stopAuto(); // reading or writing: don't move on by itself
  };

  const saveNote = () => {
    openNote(false);
    if (draft !== (note ?? "")) void setNote(db, q.id, draft.trim());
  };

  // --- Swipe ---------------------------------------------------------------
  const revealed = phase !== "asking";

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!revealed || advanced.current || editingNote) return;
    // Let the tool buttons, note and links keep their own taps. The answers are inert once
    // revealed, so a drag may start on them: they cover most of the card.
    if ((e.target as HTMLElement).closest('button:not([data-testid="option"]), textarea, a')) {
      stopAuto();
      return;
    }
    stopAuto();
    start.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ dx: 0, dy: 0, active: true });
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    setDrag({ dx: e.clientX - s.x, dy: e.clientY - s.y, active: true });
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    const dir = swipeDirection(drag.dx, drag.dy, SWIPE_PX);
    if (dir) sortAs(dir);
    else setDrag({ dx: 0, dy: 0, active: false });
  };

  // Keyboard: 1-3 answer. After answering: →/Space/Enter next, ←/H hard, ↑/E easy, G guessed.
  // Before answering, H/E toggle the flags as before. N opens the note.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const n = Number(k);
      if (phase === "asking") {
        if (n >= 1 && n <= options.length) pick(options[n - 1]?.text ?? "");
        else if (k === "h") toggleFlag("hard");
        else if (k === "e") toggleFlag("easy");
      } else if (k === " " || k === "enter" || k === "arrowright") {
        e.preventDefault();
        sortAs("next");
      } else if (k === "arrowleft" || k === "h") sortAs("hard");
      else if (k === "arrowup" || k === "e") {
        e.preventDefault();
        sortAs("easy");
      } else if (k === "g") toggleGuessed();
      if (k === "n") {
        e.preventDefault();
        openNote(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // --- Card motion ---------------------------------------------------------
  const dy = drag.dy < 0 ? drag.dy : drag.dy * 0.3; // pulling down is stiff: it means nothing
  let transform = `translate(${drag.dx}px, ${dy}px) rotate(${drag.dx / 18}deg)`;
  if (exit === "next") transform = `translate(120vw, ${dy + 40}px) rotate(22deg)`;
  if (exit === "hard") transform = `translate(-120vw, ${dy + 40}px) rotate(-22deg)`;
  if (exit === "easy") transform = `translate(${drag.dx}px, -120vh) rotate(${drag.dx / 18}deg)`;
  if (!entered) transform = "translateY(12px) scale(0.97)";

  const hint = exit ?? swipeDirection(drag.dx, drag.dy, 24);
  const hintStrength = exit ? 1 : Math.min(1, Math.max(Math.abs(drag.dx), -drag.dy) / SWIPE_PX);

  const optionColor = (text: string, correct: boolean) => {
    if (!revealed) return undefined;
    if (correct) return "green";
    return text === picked ? "red" : "gray";
  };

  return (
    // Fills the height the quiz page gives it: the card scrolls inside, the sort bar stays put.
    <Stack gap={8} style={{ flex: 1, minHeight: 0 }}>
      <Box
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        data-testid="swipe-card"
        data-revealed={revealed}
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          touchAction: revealed ? "none" : "auto",
          userSelect: drag.active ? "none" : undefined,
          cursor: revealed ? (drag.active ? "grabbing" : "grab") : undefined,
          transform,
          opacity: exit || !entered ? 0 : 1,
          transition:
            drag.active || reduceMotion
              ? "none"
              : `transform ${EXIT_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${EXIT_MS}ms ease`,
        }}
      >
        {revealed && hint && (
          <Box
            aria-hidden
            style={{
              position: "absolute",
              zIndex: 3,
              top: 20,
              left: "50%",
              transform: "translateX(-50%) rotate(-6deg)",
              padding: "4px 16px",
              border: `3px solid ${STAMP[hint].color}`,
              borderRadius: 10,
              color: STAMP[hint].color,
              background: "var(--mantine-color-body)",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "0.08em",
              opacity: hintStrength,
              pointerEvents: "none",
            }}
          >
            {STAMP[hint].label}
          </Box>
        )}

        <Paper
          withBorder
          radius="lg"
          p="sm"
          shadow="sm"
          // The scroller must carry touch-action itself: a touch that starts inside it ignores
          // the parent's, so the browser would pan and cancel the swipe.
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Stack
            gap={8}
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              touchAction: revealed ? "none" : "auto",
            }}
          >
            {/* One quiet line: where this question comes from, plus the flag tools. */}
            <Group justify="space-between" wrap="nowrap" gap={4} mih={28}>
              <Text size="xs" fw={600} c="dimmed" truncate style={{ letterSpacing: "0.04em" }}>
                {q.id}
              </Text>
              {phase === "right" && (
                <Button
                  size="compact-sm"
                  radius="xl"
                  variant={guessed ? "filled" : "outline"}
                  color="grape"
                  leftSection={<IconDice5 size={14} />}
                  onClick={toggleGuessed}
                  aria-pressed={guessed}
                  data-testid="guessed"
                  style={{ flex: "none" }}
                >
                  {guessed ? "Guessed" : "I guessed (G)"}
                </Button>
              )}
              <Group gap={2} wrap="nowrap">
                <Tooltip label="Hard: see it more (H)">
                  <ActionIcon
                    variant={flag === "hard" ? "filled" : "subtle"}
                    color="orange"
                    size="md"
                    aria-label="Mark hard"
                    onClick={() => toggleFlag("hard")}
                  >
                    <IconFlame size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Easy: stop showing it (E)">
                  <ActionIcon
                    variant={flag === "easy" ? "filled" : "subtle"}
                    color="teal"
                    size="md"
                    aria-label="Mark easy"
                    onClick={() => toggleFlag("easy")}
                  >
                    <IconFeather size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Note (N)">
                  <ActionIcon
                    variant={note ? "light" : "subtle"}
                    size="md"
                    aria-label="Edit note"
                    onClick={() => openNote(true)}
                  >
                    <IconNote size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>

            {q.image ? (
              <>
                <Box
                  h={IMAGE_H}
                  bg="var(--mantine-color-default-hover)"
                  style={{
                    borderRadius: "var(--mantine-radius-md)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  <Image
                    src={imageUrl(q.image)}
                    alt={`${q.id} illustration`}
                    fit="contain"
                    h="100%"
                    draggable={false}
                    style={{ cursor: "zoom-in" }}
                    onClick={() => !drag.active && setZoom(true)}
                  />
                </Box>
                <Modal
                  opened={zoom}
                  onClose={() => setZoom(false)}
                  size="lg"
                  centered
                  withCloseButton={false}
                >
                  <Image
                    src={imageUrl(q.image)}
                    alt=""
                    fit="contain"
                    onClick={() => setZoom(false)}
                  />
                </Modal>
              </>
            ) : q.imageMissing ? (
              <Group
                h={IMAGE_H}
                gap={8}
                justify="center"
                wrap="nowrap"
                c="orange"
                data-testid="image-lost"
                style={{
                  borderRadius: "var(--mantine-radius-md)",
                  border: "1.5px dashed var(--mantine-color-default-border)",
                  background: "var(--mantine-color-default-hover)",
                }}
              >
                <IconPhotoOff size={28} stroke={1.5} />
                <Text size="xs" fw={600} style={{ letterSpacing: "0.04em" }}>
                  Picture lost, answer without it
                </Text>
              </Group>
            ) : null}

            <Text fz={18} fw={650} lh={1.35} data-testid="question-text">
              {q.text}
            </Text>

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
              note && (
                <UnstyledButton
                  onClick={() => openNote(true)}
                  data-testid="question-note"
                  aria-hidden={!revealed}
                  tabIndex={revealed ? 0 : -1}
                  style={{
                    textAlign: "left",
                    visibility: revealed ? "visible" : "hidden",
                    padding: "4px 8px",
                    borderRadius: "var(--mantine-radius-md)",
                    background: "var(--mantine-color-default-hover)",
                  }}
                >
                  <Text size="xs" lineClamp={2}>
                    {note}
                  </Text>
                </UnstyledButton>
              )
            )}
          </Stack>

          {/* Answers sit at the bottom of the card, in thumb reach, right above the sort bar. */}
          <Box mt={8} style={{ flex: "none" }}>
            <Stack gap={6}>
              {options.map((o, i) => (
                <Button
                  key={o.text}
                  fullWidth
                  size="sm"
                  mih={48}
                  h="auto"
                  py="xs"
                  radius="md"
                  variant={
                    !revealed ? "default" : o.correct || o.text === picked ? "light" : "subtle"
                  }
                  color={optionColor(o.text, o.correct)}
                  onClick={() => pick(o.text)}
                  data-testid="option"
                  data-correct={o.correct}
                  justify="space-between"
                  leftSection={
                    <Text span fw={700} size="sm" c="dimmed" w={16}>
                      {i + 1}
                    </Text>
                  }
                  // Keep the icon slot in the layout at all times: adding it on reveal
                  // narrows the label and can wrap an option onto a second line.
                  rightSection={
                    <Box w={20} h={20} style={{ display: "flex", alignItems: "center" }}>
                      {revealed && o.correct ? (
                        <IconCheck size={20} aria-label="Correct answer" />
                      ) : revealed && o.text === picked ? (
                        <IconX size={20} aria-label="Your answer, wrong" />
                      ) : null}
                    </Box>
                  }
                  styles={{
                    label: { whiteSpace: "normal", textAlign: "left", flex: 1 },
                    root: revealed && !o.correct && o.text !== picked ? { opacity: 0.7 } : {},
                  }}
                >
                  {o.text}
                </Button>
              ))}
            </Stack>
          </Box>
        </Paper>
      </Box>

      {/* Always in the layout, so answering never resizes the card. Locked until you answer. */}
      <Box data-testid="sort-bar" pb="env(safe-area-inset-bottom)" style={{ flex: "none" }}>
        <Box style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.7fr", gap: 8 }}>
          <Button
            h={52}
            px={4}
            radius="md"
            variant="light"
            color="orange"
            disabled={!revealed}
            onClick={() => sortAs("hard")}
            data-testid="sort-hard"
            styles={STACKED}
          >
            <IconArrowLeft size={18} />
            <span>Hard</span>
          </Button>
          <Button
            h={52}
            px={4}
            radius="md"
            variant="light"
            color="teal"
            disabled={!revealed}
            onClick={() => sortAs("easy")}
            data-testid="sort-easy"
            styles={STACKED}
          >
            <IconArrowUp size={18} />
            <span>Easy</span>
          </Button>
          <Button
            h={52}
            radius="md"
            size="md"
            disabled={!revealed}
            rightSection={<IconArrowRight size={20} />}
            onClick={() => sortAs("next")}
            data-testid="next"
            style={
              autoRunning
                ? {
                    backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.25) 0 0)",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "0% 100%",
                    animation: `simata-fill ${AUTO_ADVANCE_MS}ms linear forwards`,
                  }
                : undefined
            }
          >
            Next
          </Button>
        </Box>
        <style>{"@keyframes simata-fill{to{background-size:100% 100%}}"}</style>
      </Box>
    </Stack>
  );
}

/** Icon over label: three buttons fit a 340 px column without clipping their text. */
const STACKED = {
  label: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    height: "auto",
    fontSize: "var(--mantine-font-size-xs)",
  },
} as const;
