import { BarChart, LineChart } from "@mantine/charts";
import { Badge, Group, Loader, Paper, Progress, Stack, Text, Title } from "@mantine/core";
import { useMemo } from "react";
import { currentPassStreak } from "../data/exams";
import { useLearner } from "../data/learner";
import { useT } from "../i18n";
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
  const t = useT();
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
        <Title order={2}>{t.stats.title}</Title>
        <Text c="dimmed">{t.stats.empty}</Text>
      </Stack>
    );
  }

  const exams = [...L.exams].sort((a, b) => b.at - a.at);
  const best = exams.reduce((m, e) => Math.max(m, e.right), 0);

  return (
    <Stack gap="lg">
      <Title order={2}>{t.stats.title}</Title>

      <Section title={t.stats.passChance}>
        <LineChart
          h={160}
          data={s.trend.map((p) => ({
            day: shortDay(p.day),
            [t.stats.passChanceSeries]: p.chance,
          }))}
          dataKey="day"
          series={[{ name: t.stats.passChanceSeries, color: "blue.6" }]}
          yAxisProps={{ domain: [0, 100] }}
          unit="%"
          curveType="monotone"
          withLegend={false}
        />
      </Section>

      <Section title={t.stats.accuracy}>
        <LineChart
          h={140}
          data={s.daily.map((d) => ({
            day: shortDay(d.day),
            [t.stats.accuracySeries]: d.accuracy,
          }))}
          dataKey="day"
          series={[{ name: t.stats.accuracySeries, color: "teal.6" }]}
          yAxisProps={{ domain: [0, 100] }}
          unit="%"
          curveType="monotone"
          withLegend={false}
        />
      </Section>

      <Section title={t.stats.answers}>
        <BarChart
          h={140}
          data={s.daily.map((d) => ({
            day: shortDay(d.day),
            [t.stats.answersSeries]: d.answers,
          }))}
          dataKey="day"
          series={[{ name: t.stats.answersSeries, color: "violet.6" }]}
          withLegend={false}
        />
      </Section>

      <Section title={t.stats.exams}>
        {exams.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t.stats.noneYet}
          </Text>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              {t.stats.best(best, exams[0]?.total ?? 0, currentPassStreak(exams))}
            </Text>
            {exams.slice(0, 8).map((e) => (
              <Group key={e.at} justify="space-between">
                <Text size="sm">{new Date(e.at).toLocaleString()}</Text>
                <Group gap="xs">
                  <Text size="sm">
                    {e.right}/{e.total}
                  </Text>
                  <Badge color={e.passed ? "green" : "red"} variant="light">
                    {e.passed ? t.stats.pass : t.stats.fail}
                  </Badge>
                </Group>
              </Group>
            ))}
          </>
        )}
      </Section>

      <Section title={t.stats.byCategory}>
        {s.cats.map((c) => (
          <div key={c.category}>
            <Group justify="space-between" gap="xs">
              <Text size="sm">{c.category}</Text>
              <Text size="xs" c="dimmed">
                {t.stats.seen(c.seen, c.total, Math.round(c.mastery * 100))}
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

      <Section title={t.stats.mostMissed}>
        {s.trouble.mostMissed.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t.stats.nothingMissed}
          </Text>
        ) : (
          s.trouble.mostMissed.map((m) => (
            <QuestionLine key={m.id} id={m.id} detail={t.stats.missedDetail(m.misses, m.seen)} />
          ))
        )}
      </Section>

      <Section title={t.stats.slowest}>
        {s.trouble.slowest.length === 0 ? (
          <Text size="sm" c="dimmed">
            {t.stats.needsRepeats}
          </Text>
        ) : (
          s.trouble.slowest.map((m) => (
            <QuestionLine
              key={m.id}
              id={m.id}
              detail={t.stats.avgTime((m.avgMs / 1000).toFixed(1))}
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
