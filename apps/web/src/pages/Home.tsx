import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  RingProgress,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { buildSession, mulberry32, newSeenBetween, passChance } from "@simata/core";
import {
  IconBolt,
  IconClipboardCheck,
  IconPlayerPlay,
  IconSearch,
  IconTarget,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useLearner } from "../data/learner";
import { localDayRange } from "../lib/time";
import { useNow } from "../lib/useNow";

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
        {label}
      </Text>
      <Text
        fz={22}
        fw={700}
        lh={1.2}
        data-testid={`stat-${label.toLowerCase().replace(/\W+/g, "-")}`}
      >
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Paper>
  );
}

function PassMeter({ chance, started }: { chance: number; started: boolean }) {
  const color = chance >= 80 ? "green" : chance >= 50 ? "yellow" : "red";
  return (
    <Paper withBorder p="md" radius="md">
      <Group wrap="nowrap" gap="lg">
        <RingProgress
          size={104}
          thickness={11}
          roundCaps
          sections={[{ value: chance, color }]}
          label={
            <Text ta="center" fw={700} fz={22} data-testid="pass-chance">
              {chance}%
            </Text>
          }
        />
        <Stack gap={2}>
          <Text fw={600}>Chance to pass a mock exam today</Text>
          <Text size="sm" c="dimmed">
            {started
              ? "Worked out from how well you remember each question right now."
              : "Answer a few questions and this starts to move."}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}

export function HomePage() {
  const L = useLearner();
  const now = useNow();

  const s = useMemo(() => {
    const pool = L.questions.filter((q) => !q.disabled && L.flags[q.id] !== "easy");
    const states = L.progress.states;
    const due = pool.filter(
      (q) => (states.get(q.id)?.card.due.getTime() ?? Infinity) <= now,
    ).length;
    const unseen = pool.filter((q) => !states.has(q.id)).length;
    const [from, to] = localDayRange(now);
    const newLeft = Math.min(
      unseen,
      Math.max(0, L.settings.newPerDay - newSeenBetween(L.progress, from, to)),
    );
    const weak = buildSession({
      questions: L.questions,
      progress: L.progress,
      now,
      mode: "weak",
      size: 1000,
      newBudget: 0,
      flags: L.flags,
      rng: mulberry32(1),
    }).length;
    const enabled = L.questions.filter((q) => !q.disabled).length;
    const chance = Math.round(
      passChance(L.questions, L.progress, now, mulberry32(1), { sims: 1000 }) * 100,
    );
    return {
      chance,
      due,
      unseen,
      newLeft,
      weak,
      enabled,
      seen: enabled - L.questions.filter((q) => !q.disabled && !states.has(q.id)).length,
      hidden: L.questions.length - enabled,
    };
  }, [L, now]);

  if (L.noBank) {
    return (
      <Alert color="yellow" title="No question bank">
        The server has no bank and this device has none cached yet. Seed it with the import tool,
        then reload.
      </Alert>
    );
  }
  if (!L.ready) return <Loader />;

  const trainCount = s.due + s.newLeft;

  return (
    <Stack gap="lg">
      <Title order={2}>Today</Title>
      <PassMeter chance={s.chance} started={L.events.length > 0} />
      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Stat label="Due now" value={s.due} />
        <Stat label="New left today" value={s.newLeft} />
        <Stat label="Seen" value={`${s.seen}/${s.enabled}`} />
        <Stat label="Weak spots" value={s.weak} />
      </SimpleGrid>

      <Stack gap="xs">
        <Button
          component={Link}
          to="/quiz/train"
          size="lg"
          leftSection={<IconPlayerPlay size={20} />}
          disabled={trainCount === 0}
        >
          {trainCount === 0 ? "Nothing due. Nice." : `Train (${trainCount})`}
        </Button>
        <Group grow gap="xs">
          <Button
            component={Link}
            to="/quiz/sweep"
            variant="light"
            leftSection={<IconSearch size={18} />}
            disabled={s.unseen === 0}
          >
            Sweep
          </Button>
          <Button
            component={Link}
            to="/exam"
            variant="light"
            color="grape"
            leftSection={<IconClipboardCheck size={18} />}
          >
            Mock exam
          </Button>
          <Button
            component={Link}
            to="/quiz/weak"
            variant="light"
            color="orange"
            leftSection={<IconBolt size={18} />}
            disabled={s.weak === 0}
          >
            Weak
          </Button>
        </Group>
      </Stack>

      {s.hidden > 0 && (
        <Group gap="xs" c="dimmed">
          <IconTarget size={16} />
          <Text size="xs">{s.hidden} questions are hidden because their pictures are lost.</Text>
        </Group>
      )}
    </Stack>
  );
}
