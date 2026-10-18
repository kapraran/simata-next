import { BarChart, LineChart } from "@mantine/charts";
import { Badge, Group, Loader, Paper, Progress, Stack, Text, Title } from "@mantine/core";
import { useMemo } from "react";
import { currentPassStreak } from "../data/exams";
import { useLearner } from "../data/learner";
import { categoryMastery, dailyStats, passChanceTrend, trouble } from "../lib/stats";
import { useNow } from "../lib/useNow";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Text fw={600}>{title}</Text>
        {children}
      </Stack>
    </Paper>
  );
}

const shortDay = (d: string) => d.slice(5);

export function StatsPage() {
  const L = useLearner();
  const now = useNow();

  const s = useMemo(
    () => ({
      daily: dailyStats(L.events, now),
      trend: passChanceTrend(L.events, L.questions, now),
      cats: categoryMastery(L.questions, L.progress, now),
      trouble: trouble(L.events),
    }),
    [L.events, L.questions, L.progress, now],
  );

  if (!L.ready) return <Loader />;
  if (L.events.length === 0) {
    return (
      <Stack gap="sm">
        <Title order={2}>Stats</Title>
        <Text c="dimmed">Answer some questions and your progress shows up here.</Text>
      </Stack>
    );
  }

  const exams = [...L.exams].sort((a, b) => b.at - a.at);
  const best = exams.reduce((m, e) => Math.max(m, e.right), 0);

  return (
    <Stack gap="lg">
      <Title order={2}>Stats</Title>

      <Section title="Chance of passing a mock exam">
        <LineChart
          h={160}
          data={s.trend.map((t) => ({ day: shortDay(t.day), "Pass chance": t.chance }))}
          dataKey="day"
          series={[{ name: "Pass chance", color: "blue.6" }]}
          yAxisProps={{ domain: [0, 100] }}
          unit="%"
          curveType="monotone"
          withLegend={false}
        />
      </Section>

      <Section title="Accuracy per day">
        <LineChart
          h={140}
          data={s.daily.map((d) => ({ day: shortDay(d.day), Accuracy: d.accuracy }))}
          dataKey="day"
          series={[{ name: "Accuracy", color: "teal.6" }]}
          yAxisProps={{ domain: [0, 100] }}
          unit="%"
          curveType="monotone"
          withLegend={false}
        />
      </Section>

      <Section title="Answers per day">
        <BarChart
          h={140}
          data={s.daily.map((d) => ({ day: shortDay(d.day), Answers: d.answers }))}
          dataKey="day"
          series={[{ name: "Answers", color: "violet.6" }]}
          withLegend={false}
        />
      </Section>

      <Section title="Mock exams">
        {exams.length === 0 ? (
          <Text size="sm" c="dimmed">
            None yet.
          </Text>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              Best score {best}/{exams[0]?.total}. Passed in a row: {currentPassStreak(exams)}.
            </Text>
            {exams.slice(0, 8).map((e) => (
              <Group key={e.at} justify="space-between">
                <Text size="sm">{new Date(e.at).toLocaleString()}</Text>
                <Group gap="xs">
                  <Text size="sm">
                    {e.right}/{e.total}
                  </Text>
                  <Badge color={e.passed ? "green" : "red"} variant="light">
                    {e.passed ? "Pass" : "Fail"}
                  </Badge>
                </Group>
              </Group>
            ))}
          </>
        )}
      </Section>

      <Section title="By category (weakest first)">
        {s.cats.map((c) => (
          <div key={c.category}>
            <Group justify="space-between" gap="xs">
              <Text size="sm">{c.category}</Text>
              <Text size="xs" c="dimmed">
                {c.seen}/{c.total} seen · {Math.round(c.mastery * 100)}%
              </Text>
            </Group>
            <Progress
              value={c.mastery * 100}
              size="sm"
              color={c.mastery > 0.85 ? "green" : c.mastery > 0.6 ? "yellow" : "red"}
            />
          </div>
        ))}
      </Section>

      <Section title="Most missed">
        {s.trouble.mostMissed.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing missed yet.
          </Text>
        ) : (
          s.trouble.mostMissed.map((m) => (
            <QuestionLine key={m.id} id={m.id} detail={`${m.misses} missed of ${m.seen}`} />
          ))
        )}
      </Section>

      <Section title="Slowest">
        {s.trouble.slowest.length === 0 ? (
          <Text size="sm" c="dimmed">
            Needs a few repeat answers.
          </Text>
        ) : (
          s.trouble.slowest.map((m) => (
            <QuestionLine
              key={m.id}
              id={m.id}
              detail={`${(m.avgMs / 1000).toFixed(1)} s on average`}
            />
          ))
        )}
      </Section>
    </Stack>
  );
}

function QuestionLine({ id, detail }: { id: string; detail: string }) {
  const { byId } = useLearner();
  const text = byId.get(id)?.text ?? "";
  return (
    <div>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="xs" c="dimmed">
          {id}
        </Text>
        <Text size="xs" c="dimmed">
          {detail}
        </Text>
      </Group>
      <Text size="sm" lineClamp={2}>
        {text}
      </Text>
    </div>
  );
}
