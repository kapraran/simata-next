import { ActionIcon, AppShell, Container, Group, Loader, Tooltip } from "@mantine/core";
import {
  IconChartBar,
  IconCloudCheck,
  IconCloudOff,
  IconCloudUp,
  IconSettings,
} from "@tabler/icons-react";
import { Link, Route, Routes, useMatch } from "react-router-dom";
import { LogoMark, SignSprite } from "./components/Signs";
import { db } from "./data/db";
import { LearnerProvider, useLearner, useSyncState } from "./data/learner";
import { syncNow } from "./data/sync";
import { ExamPage } from "./pages/Exam";
import { HomePage } from "./pages/Home";
import { QuizPage } from "./pages/Quiz";
import { SettingsPage } from "./pages/Settings";
import { StatsPage } from "./pages/Stats";

function SyncIndicator() {
  const sync = useSyncState();
  const { pendingCount } = useLearner();
  const failed = sync.state === "error";
  const label = failed
    ? "Offline or server unreachable. Your answers are saved here and will upload later."
    : sync.state === "syncing"
      ? "Syncing"
      : pendingCount > 0
        ? `${pendingCount} answers waiting to upload`
        : "All synced";
  return (
    <Tooltip label={label}>
      <ActionIcon
        variant="subtle"
        color={failed ? "red" : pendingCount > 0 ? "yellow" : "gray"}
        style={failed || pendingCount > 0 ? undefined : { color: "#fff" }}
        aria-label={label}
        onClick={() => void syncNow(db)}
        data-testid="sync-indicator"
        data-state={
          failed
            ? "error"
            : sync.state === "syncing"
              ? "syncing"
              : pendingCount > 0
                ? "pending"
                : "synced"
        }
      >
        {sync.state === "syncing" ? (
          <Loader size={16} />
        ) : failed ? (
          <IconCloudOff size={20} />
        ) : pendingCount > 0 ? (
          <IconCloudUp size={20} />
        ) : (
          <IconCloudCheck size={20} />
        )}
      </ActionIcon>
    </Tooltip>
  );
}

export function App() {
  // The quiz owns the whole screen height, so it gets less padding than other pages.
  const inQuiz = useMatch("/quiz/:mode") !== null;
  return (
    <LearnerProvider>
      <SignSprite />
      <AppShell header={inQuiz ? undefined : { height: 56 }} padding={inQuiz ? "xs" : "md"}>
        {!inQuiz && (
          <AppShell.Header className="sim-appbar">
            <Group h="100%" px="md" justify="space-between">
              <Link
                to="/"
                style={{ color: "inherit", textDecoration: "none" }}
                aria-label="Simata home"
              >
                <Group gap="xs">
                  <LogoMark size={28} />
                  <span className="sim-brand">Simata</span>
                </Group>
              </Link>
              <Group gap={4}>
                <SyncIndicator />
                <ActionIcon
                  component={Link}
                  to="/stats"
                  variant="subtle"
                  color="gray"
                  style={{ color: "#fff" }}
                  aria-label="Stats"
                >
                  <IconChartBar size={20} />
                </ActionIcon>
                <ActionIcon
                  component={Link}
                  to="/settings"
                  variant="subtle"
                  color="gray"
                  style={{ color: "#fff" }}
                  aria-label="Settings"
                >
                  <IconSettings size={20} />
                </ActionIcon>
              </Group>
            </Group>
          </AppShell.Header>
        )}
        <AppShell.Main>
          <Container size="xs" p={0} pt={inQuiz ? 0 : "md"} pb={inQuiz ? 0 : "xl"}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/quiz/:mode" element={<QuizPage />} />
              <Route path="/exam" element={<ExamPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Container>
        </AppShell.Main>
      </AppShell>
    </LearnerProvider>
  );
}
