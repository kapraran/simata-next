import { Alert, Button, Group, Loader, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { buildSession, isConfident, mulberry32, passChance } from "@simata/core";
import { IconPhotoOff, IconPlayerPlayFilled } from "@tabler/icons-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Sign, type SignName } from "../components/Signs";
import { useLearner } from "../data/learner";
import { localDayRange } from "../lib/time";
import { useNow } from "../lib/useNow";

function Stat({
  label,
  value,
  total,
  sign,
}: {
  label: string;
  value: number | string;
  total?: number;
  sign: SignName;
}) {
  return (
    <Group
      className="sim-sticker"
      wrap="nowrap"
      gap="xs"
      p="xs"
      pl="sm"
      style={{ borderRadius: 16 }}
    >
      <Sign name={sign} size={34} />
      <div>
        <Text
          className="sim-stat-n"
          data-testid={`stat-${label.toLowerCase().replace(/\W+/g, "-")}`}
        >
          {value}
          {total !== undefined && (
            <Text span fz={13} c="dimmed" ml={2}>
              /{total}
            </Text>
          )}
        </Text>
        <Text fz={11.5} fw={700} c="dimmed">
          {label}
        </Text>
      </div>
    </Group>
  );
}

/** The pass chance drawn as a speed-limit sign: the red ring fills as the chance goes up. */
function PassMeter({ chance, started }: { chance: number; started: boolean }) {
  const circ = 2 * Math.PI * 44;
  return (
    <Group className="sim-sticker" wrap="nowrap" gap="md" p="sm" mt={-54} pos="relative">
      <svg
        width="92"
        height="96"
        viewBox="0 0 120 124"
        role="img"
        aria-label={`${chance} percent chance to pass`}
        style={{ flex: "none" }}
      >
        <circle cx="60" cy="64" r="56" fill="#0B2A6B" />
        <circle cx="60" cy="60" r="56" fill="#fff" />
        <circle cx="60" cy="60" r="44" fill="none" stroke="#F8D3D1" strokeWidth="15" />
        <circle
          cx="60"
          cy="60"
          r="44"
          fill="none"
          stroke="#E8322B"
          strokeWidth="15"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - chance / 100)}
          transform="rotate(-90 60 60)"
        />
        <text
          x="58"
          y="72"
          textAnchor="middle"
          fontFamily="Fredoka, sans-serif"
          fontWeight="700"
          fontSize="34"
          fill="#0B2A6B"
          data-testid="pass-chance"
        >
          {chance}
          <tspan fontSize="17" dy="-12">
            %
          </tspan>
        </text>
      </svg>
      <Stack gap={2}>
        <Text className="sim-display" fw={700} fz={18} lh={1.15}>
          Chance to pass a mock exam today
        </Text>
        <Text size="sm" c="dimmed" fw={600}>
          {started
            ? "Worked out from how well you remember each question right now."
            : "Answer a few questions and this starts to move."}
        </Text>
      </Stack>
    </Group>
  );
}

export function HomePage() {
  const L = useLearner();
  const now = useNow();

  const s = useMemo(() => {
    const pool = L.questions.filter((q) => !q.disabled && L.flags[q.id] !== "easy");
    const states = L.progress.states;
    const unseen = pool.filter((q) => !states.has(q.id)).length;
    const [from, to] = localDayRange(now);
    const today = L.events.filter((e) => e.at >= from && e.at < to && e.mode !== "legacy").length;
    const confident = pool.filter((q) => isConfident(states.get(q.id))).length;
    const weak = buildSession({
      questions: L.questions,
      progress: L.progress,
      now,
      mode: "weak",
      size: 1000,
      flags: L.flags,
      rng: mulberry32(1),
    }).length;
    const chance = Math.round(
      passChance(L.questions, L.progress, now, mulberry32(1), { sims: 1000 }) * 100,
    );
    return {
      chance,
      today,
      unseen,
      weak,
      confident,
      total: pool.length,
      missingPictures: L.questions.filter((q) => q.imageMissing).length,
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

  return (
    <Stack gap="md">
      <div className="sim-hero">
        <Title order={2} fz={26} c="white">
          Ready to roll?
        </Title>
      </div>
      <PassMeter chance={s.chance} started={L.events.length > 0} />
      <SimpleGrid cols={2} spacing="xs">
        <Stat label="Answered today" value={s.today} sign="round" />
        <Stat label="Never seen" value={s.unseen} sign="diamond" />
        <Stat label="Confident" value={s.confident} total={s.total} sign="info" />
        <Stat label="Weak spots" value={s.weak} sign="warn" />
      </SimpleGrid>

      <Button
        component={Link}
        to="/quiz/train"
        className="sim-train"
        size="lg"
        leftSection={<IconPlayerPlayFilled size={22} />}
      >
        Train
      </Button>
      <SimpleGrid cols={2} spacing="xs">
        <Button
          component={Link}
          to="/exam"
          variant="default"
          h={64}
          styles={{ label: { flexDirection: "column", gap: 2 } }}
        >
          <Sign name="stop" size={28} />
          Mock exam
        </Button>
        <Button
          component={Link}
          to="/quiz/weak"
          variant="default"
          h={64}
          disabled={s.weak === 0}
          styles={{ label: { flexDirection: "column", gap: 2 } }}
        >
          <Sign name="warn" size={28} />
          Weak
        </Button>
      </SimpleGrid>

      {s.missingPictures > 0 && (
        <Group gap="xs" c="dimmed">
          <IconPhotoOff size={16} />
          <Text size="xs">
            {s.missingPictures} questions lost their picture. They are shown with a placeholder.
          </Text>
        </Group>
      )}
    </Stack>
  );
}
